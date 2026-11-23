"""Isolated persistence acceptance checks against a real Supabase PostgreSQL database."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.ai.schemas import Debrief
from app.api import reports as reports_api
from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import (
    get_ai_interaction_recorder,
    get_stakeholder_feedback_task,
)
from app.config import settings
from app.db.models import (
    ClassMembership,
    ClassModel,
    Mission,
    MissionAssignment,
    Profile,
    ScenarioVersion,
    School,
    SimulationDecision,
    SimulationSession,
)
from app.db.session import build_engine, get_db_session
from app.main import app
from app.simulation.service import SimulationService, StaleTurnError
from app.simulation.world_state import Action, TurnResult

pytestmark = pytest.mark.skipif(
    not settings.supabase_db_url,
    reason="SUPABASE_DB_URL is not configured",
)


@pytest.fixture
def supabase_test_context():
    """Create one isolated student/mission and remove only that fixture's own rows."""
    assert settings.supabase_db_url is not None
    database_engine = build_engine(settings.supabase_db_url)
    factory = sessionmaker(bind=database_engine, autoflush=False, expire_on_commit=False)
    school_id, student_id, teacher_id, class_id, mission_id, version_id = (
        uuid4() for _ in range(6)
    )
    student_email = f"mtaalab-integration-student-{student_id.hex}@example.test"
    teacher_email = f"mtaalab-integration-teacher-{teacher_id.hex}@example.test"
    scenario_path = (
        Path(__file__).resolve().parents[1] / "app" / "simulation" / "scenarios" / "mtoni_v1.json"
    )
    scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
    fixture_committed = False

    try:
        try:
            with database_engine.connect() as connection:
                connection.execute(text("select 1"))
        except OperationalError:
            pytest.skip("Direct Supabase database connection is unavailable")

        with factory.begin() as db:
            insert_auth_user = text(
                """
                insert into auth.users
                  (id, instance_id, aud, role, email, encrypted_password,
                   email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                   created_at, updated_at)
                values
                  (:id, '00000000-0000-0000-0000-000000000000',
                   'authenticated', 'authenticated', :email, '', now(),
                   '{}'::jsonb, '{}'::jsonb, now(), now())
                """
            )
            db.execute(insert_auth_user, {"id": student_id, "email": student_email})
            db.execute(insert_auth_user, {"id": teacher_id, "email": teacher_email})
            db.add(
                School(
                    id=school_id,
                    name=f"Synthetic integration school {student_id.hex[:10]}",
                    country="Kenya",
                    timezone="Africa/Nairobi",
                )
            )
            db.flush()
            db.add_all(
                [
                    Profile(
                        id=student_id,
                        display_name="Synthetic Integration Student",
                        role="student",
                        school_id=school_id,
                        grade_level="Grade 7",
                        preferred_language="en",
                        accessibility_preferences={},
                    ),
                    Profile(
                        id=teacher_id,
                        display_name="Synthetic Integration Teacher",
                        role="teacher",
                        school_id=school_id,
                        grade_level="Grade 7",
                        preferred_language="en",
                        accessibility_preferences={},
                    ),
                ]
            )
            db.flush()
            db.add(
                ClassModel(
                    id=class_id,
                    school_id=school_id,
                    name=f"Synthetic integration class {class_id.hex[:10]}",
                    grade_level="Grade 7",
                    teacher_id=teacher_id,
                )
            )
            db.flush()
            db.add(
                ClassMembership(
                    id=uuid4(),
                    class_id=class_id,
                    student_id=student_id,
                    membership_status="active",
                )
            )
            db.flush()
            mission = Mission(
                id=mission_id,
                title="Synthetic Mtoni integration mission",
                description="A synthetic fixture used only by persistence tests.",
                subject="Systems science",
                grade_band="Grade 7",
                status="published",
                published_version_id=None,
            )
            db.add(mission)
            db.flush()
            db.add(
                ScenarioVersion(
                    id=version_id,
                    mission_id=mission_id,
                    version=1,
                    initial_state=scenario["initial_state"],
                    rules_version=scenario["rules_version"],
                    learning_objectives=scenario["learning_objectives"],
                    approved_by=None,
                )
            )
            db.flush()
            mission.published_version_id = version_id
            db.add(
                MissionAssignment(
                    class_id=class_id,
                    mission_id=mission_id,
                    assigned_by=teacher_id,
                )
            )
        fixture_committed = True

        yield {
            "factory": factory,
            "student_id": student_id,
            "mission_id": mission_id,
            "scenario": scenario,
        }
    finally:
        try:
            if fixture_committed:
                with factory.begin() as db:
                    db.execute(
                        delete(SimulationSession).where(SimulationSession.student_id == student_id)
                    )
                    db.execute(
                        update(Mission)
                        .where(Mission.id == mission_id)
                        .values(published_version_id=None)
                    )
                    db.execute(delete(ScenarioVersion).where(ScenarioVersion.id == version_id))
                    db.execute(delete(Mission).where(Mission.id == mission_id))
                    db.execute(delete(ClassMembership).where(ClassMembership.class_id == class_id))
                    db.execute(
                        delete(MissionAssignment).where(MissionAssignment.class_id == class_id)
                    )
                    db.execute(delete(ClassModel).where(ClassModel.id == class_id))
                    db.execute(delete(Profile).where(Profile.id == student_id))
                    db.execute(delete(Profile).where(Profile.id == teacher_id))
                    db.execute(text("delete from auth.users where id = :id"), {"id": student_id})
                    db.execute(text("delete from auth.users where id = :id"), {"id": teacher_id})
                    db.execute(delete(School).where(School.id == school_id))
        finally:
            database_engine.dispose()


@pytest.mark.integration
def test_api_flow_persists_decision_history_replay_debrief_and_report(
    supabase_test_context, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exercise the API over real PostgreSQL persistence with synthetic identities."""
    factory = supabase_test_context["factory"]
    student_id = supabase_test_context["student_id"]
    mission_id = supabase_test_context["mission_id"]

    def override_db_session():
        with factory() as db:
            yield db

    def fallback_debrief(history, *, client=None, record_interaction=None):
        return SimpleNamespace(
            output=Debrief(
                summary="The persisted history is the confirmed outcome.",
                trade_offs=["Compare the recorded needs."],
                replay_suggestion="Try another allocation in a replay.",
                referenced_facts=[],
            ),
            status="ai_unavailable",
            source="fallback",
        )

    monkeypatch.setattr(reports_api, "create_debrief", fallback_debrief)
    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=student_id, role="student", school_id=None
    )
    app.dependency_overrides[get_stakeholder_feedback_task] = lambda: lambda **_kwargs: None
    app.dependency_overrides[get_ai_interaction_recorder] = lambda: lambda **_kwargs: None

    try:
        with TestClient(app) as client:
            create_headers = {"Idempotency-Key": "api-integration-create"}
            create_payload = {"mission_id": str(mission_id)}
            created = client.post("/api/simulations", headers=create_headers, json=create_payload)
            assert created.status_code == 201
            session_id = created.json()["session_id"]
            duplicate_create = client.post(
                "/api/simulations", headers=create_headers, json=create_payload
            )
            assert duplicate_create.status_code == 201
            assert duplicate_create.json()["session_id"] == session_id

            decision = client.post(
                f"/api/simulations/{session_id}/decisions",
                headers={"Idempotency-Key": "api-integration-decision"},
                json={"action_type": "repair_main_pipe", "parameters": {}, "expected_turn": 0},
            )
            assert decision.status_code == 200
            assert decision.json()["turn"] == 1

            state = client.get(f"/api/simulations/{session_id}/state")
            history = client.get(f"/api/simulations/{session_id}/history")
            assert state.status_code == 200
            assert state.json()["state"]["current_turn"] == 1
            assert history.status_code == 200
            assert history.json()["total"] == 2

            replay = client.post(
                f"/api/simulations/{session_id}/replay",
                headers={"Idempotency-Key": "api-integration-replay"},
            )
            assert replay.status_code == 200
            assert replay.json()["turn"] == 0
            assert replay.json()["parent_session_id"] == session_id

            debrief = client.post(f"/api/simulations/{session_id}/debrief", json={})
            report = client.get(f"/api/simulations/{session_id}/report")
            assert debrief.status_code == 200
            assert debrief.json()["source"] == "fallback"
            assert report.status_code == 200
            assert report.json()["current_turn"] == 1
            assert len(report.json()["decisions"]) == 1

            confirmed_after_replay = client.get(f"/api/simulations/{session_id}/state")
            assert confirmed_after_replay.json()["state"] == state.json()["state"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.integration
def test_sim05_and_rep01_persist_idempotently_and_replay_without_mutating_source(
    supabase_test_context,
) -> None:
    factory = supabase_test_context["factory"]
    student_id = supabase_test_context["student_id"]
    mission_id = supabase_test_context["mission_id"]

    with factory() as db:
        service = SimulationService(db)
        created = service.get_or_create_session(mission_id, student_id)
        session_id = created["session_id"]
        action = Action(action_type="repair_main_pipe", parameters={}, expected_turn=0)
        first = service.submit_decision(session_id, student_id, action, "sim05-retry-key")
        duplicate = service.submit_decision(session_id, student_id, action, "sim05-retry-key")
        assert duplicate.model_dump(mode="json", exclude={"idempotent_replay"}) == first.model_dump(
            mode="json", exclude={"idempotent_replay"}
        )
        assert first.idempotent_replay is False
        assert duplicate.idempotent_replay is True
        assert service.get_state(session_id, student_id)["turn"] == 1
        assert service.history(session_id, student_id)["total"] == 2
        decisions = list(
            db.scalars(
                select(SimulationDecision).where(
                    SimulationDecision.session_id == session_id,
                    SimulationDecision.idempotency_key == "sim05-retry-key",
                )
            )
        )
        assert len(decisions) == 1

        replay = service.replay(session_id, student_id, "replay-key")
        duplicate_replay = service.replay(session_id, student_id, "replay-key")
        assert duplicate_replay["session_id"] == replay["session_id"]
        assert replay["parent_session_id"] == session_id
        assert replay["turn"] == 0
        assert replay["state"].model_dump(mode="json") == created["state"].model_dump(mode="json")
        assert service.get_state(session_id, student_id)["turn"] == 1


@pytest.mark.integration
def test_sim06_concurrent_advances_serialize_and_only_one_wins(supabase_test_context) -> None:
    factory = supabase_test_context["factory"]
    student_id = supabase_test_context["student_id"]
    mission_id = supabase_test_context["mission_id"]
    with factory() as db:
        session_id = SimulationService(db).get_or_create_session(mission_id, student_id)[
            "session_id"
        ]

    barrier = Barrier(2)

    def advance(key: str) -> str:
        with factory() as db:
            service = SimulationService(db)
            barrier.wait(timeout=15)
            try:
                result = service.submit_decision(
                    session_id,
                    student_id,
                    Action(action_type="repair_main_pipe", parameters={}, expected_turn=0),
                    key,
                )
                assert isinstance(result, TurnResult)
                return "accepted"
            except StaleTurnError:
                return "stale"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(advance, ["sim06-key-a", "sim06-key-b"]))

    assert sorted(outcomes) == ["accepted", "stale"]
    with factory() as db:
        assert db.get(SimulationSession, session_id).current_turn == 1
        assert (
            len(
                list(
                    db.scalars(
                        select(SimulationDecision).where(
                            SimulationDecision.session_id == session_id
                        )
                    )
                )
            )
            == 1
        )
