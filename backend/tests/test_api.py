"""HTTP contract tests using explicit fake auth, persistence, and AI boundaries."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.ai.schemas import Debrief
from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import (
    get_ai_interaction_recorder,
    get_mission_repository,
    get_simulation_gateway,
    get_stakeholder_feedback_task,
)
from app.main import app
from app.simulation.engine import calculate_next_state, load_scenario
from app.simulation.service import StaleTurnError
from app.simulation.world_state import Action, TurnResult, WorldState

SESSION_ID = UUID("00000000-0000-4000-8000-000000000777")
MISSION_ID = UUID("40000000-0000-4000-8000-000000000001")
USER_ID = UUID("00000000-0000-4000-8000-000000000102")


class FakeGateway:
    """Exercise route orchestration while keeping database access out of unit tests."""

    def __init__(self) -> None:
        self.scenario = load_scenario()
        self.state = WorldState.model_validate(self.scenario["initial_state"])
        self.last_result: TurnResult | None = None
        self.idempotent = False
        self.ai_status: str | None = None

    def get_or_create_session(self, mission_id: UUID, user_id: UUID, idempotency_key=None):
        assert user_id == USER_ID
        return {
            "session_id": SESSION_ID,
            "mission_id": mission_id,
            "turn": self.state.current_turn,
            "status": "active",
            "state": self.state,
        }

    def get_state(self, session_id: UUID, user_id: UUID):
        assert session_id == SESSION_ID
        assert user_id == USER_ID
        return {
            "session_id": SESSION_ID,
            "mission_id": MISSION_ID,
            "turn": self.state.current_turn,
            "status": "active",
            "state": self.state,
        }

    def list_actions(self, session_id: UUID, user_id: UUID):
        return []

    def submit_decision(
        self, session_id: UUID, user_id: UUID, action: Action, idempotency_key: str
    ) -> TurnResult:
        if self.idempotent and self.last_result is not None:
            return self.last_result.model_copy(update={"idempotent_replay": True})
        if action.expected_turn != self.state.current_turn:
            raise StaleTurnError("stale")
        result = calculate_next_state(self.state, action, self.scenario)
        self.last_result = TurnResult.model_validate(result)
        self.state = self.last_result.state
        return self.last_result

    def history(self, session_id: UUID, user_id: UUID, limit: int = 50, offset: int = 0):
        entries = [
            {
                "turn": 0,
                "action": None,
                "events": [],
                "state": WorldState.model_validate(self.scenario["initial_state"]),
                "state_hash": None,
                "ai_feedback_status": None,
            }
        ]
        if self.last_result is not None:
            entries.append(
                {
                    "turn": self.last_result.turn,
                    "action": self.last_result.action.model_dump(mode="json"),
                    "events": [event.model_dump(mode="json") for event in self.last_result.events],
                    "state": self.last_result.state,
                    "state_hash": "test-hash",
                    "ai_feedback_status": self.ai_status,
                }
            )
        total = len(entries)
        return {
            "session_id": session_id,
            "entries": entries[offset : offset + limit],
            "limit": limit,
            "offset": offset,
            "total": total,
        }

    def replay(self, session_id: UUID, user_id: UUID, idempotency_key=None, label=None):
        return {
            "session_id": uuid4(),
            "mission_id": MISSION_ID,
            "turn": 0,
            "status": "active",
            "state": WorldState.model_validate(self.scenario["initial_state"]),
            "parent_session_id": session_id,
        }


class FakeMissionRepository:
    def __init__(self) -> None:
        self.mission = SimpleNamespace(
            id=MISSION_ID,
            title="Mtoni water resilience",
            description="A fictional water-management mission.",
            subject="Systems science",
            grade_band="Grade 7",
        )
        self.version = SimpleNamespace(
            version=1,
            learning_objectives=["Compare needs with evidence."],
            rules_version="placeholder-v1",
        )

    def list_published(self, user_id: UUID):
        assert user_id == USER_ID
        return [self.mission]

    def get_published(self, mission_id: UUID):
        return (self.mission, self.version) if mission_id == MISSION_ID else None

    def get_published_for_user(self, mission_id: UUID, user_id: UUID):
        assert user_id == USER_ID
        return self.get_published(mission_id)


@pytest.fixture
def api_client(monkeypatch: pytest.MonkeyPatch):
    gateway = FakeGateway()
    user = CurrentUser(id=USER_ID, role="student", school_id=None)
    scheduled: list[dict] = []
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_simulation_gateway] = lambda: gateway
    app.dependency_overrides[get_mission_repository] = lambda: FakeMissionRepository()
    app.dependency_overrides[get_stakeholder_feedback_task] = lambda: (
        lambda **kwargs: scheduled.append(kwargs)
    )
    app.dependency_overrides[get_ai_interaction_recorder] = lambda: lambda **kwargs: None
    monkeypatch.setattr("app.api.reports.create_debrief", _fallback_debrief)
    with TestClient(app) as client:
        yield client, gateway, scheduled
    app.dependency_overrides.clear()


def _fallback_debrief(history, *, client=None, record_interaction=None):
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


def test_mission_routes_return_published_mtoni_metadata(api_client) -> None:
    client, _, _ = api_client
    listing = client.get("/api/missions")
    detail = client.get(f"/api/missions/{MISSION_ID}")

    assert listing.status_code == 200
    assert listing.json()["missions"][0]["id"] == str(MISSION_ID)
    assert detail.status_code == 200
    assert detail.json()["scenario_id"] == "mtoni"
    assert len(detail.json()["action_catalogue"]) == 5


def test_create_state_decision_history_and_replay_flow(api_client) -> None:
    client, _, scheduled = api_client
    created = client.post("/api/simulations", json={"mission_id": str(MISSION_ID)})
    assert created.status_code == 201
    assert created.json()["turn"] == 0

    current = client.get(f"/api/simulations/{SESSION_ID}/state")
    assert current.status_code == 200
    assert current.json()["state"]["reservoir_level"] == 60

    decision = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        headers={"Idempotency-Key": "api-test-1"},
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 0,
        },
    )
    assert decision.status_code == 200
    assert decision.json()["accepted"] is True
    assert decision.json()["turn"] == 1
    assert decision.json()["state"]["current_turn"] == 1
    assert decision.json()["ai_feedback_status"] == "pending"
    assert len(scheduled) == 1

    history = client.get(f"/api/simulations/{SESSION_ID}/history")
    assert history.status_code == 200
    assert history.json()["total"] == 2
    assert history.json()["entries"][1]["action"]["action_type"] == "change_allocation"

    replay = client.post(f"/api/simulations/{SESSION_ID}/replay", json={"label": "second plan"})
    assert replay.status_code == 200
    assert replay.json()["turn"] == 0
    assert replay.json()["parent_session_id"] == str(SESSION_ID)


def test_duplicate_decision_returns_persisted_status_without_rescheduling(api_client) -> None:
    client, gateway, scheduled = api_client
    first = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        headers={"Idempotency-Key": "api-test-2"},
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 0,
        },
    )
    assert first.status_code == 200
    assert len(scheduled) == 1

    gateway.idempotent = True
    gateway.ai_status = "available"
    duplicate = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        headers={"Idempotency-Key": "api-test-2"},
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 0,
        },
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["ai_feedback_status"] == "available"
    assert len(scheduled) == 1


def test_stale_decision_and_missing_idempotency_key_are_rejected(api_client) -> None:
    client, _, _ = api_client
    stale = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        headers={"Idempotency-Key": "api-test-stale"},
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 2,
        },
    )
    missing_key = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 0,
        },
    )
    assert stale.status_code == 409
    assert missing_key.status_code == 422


def test_report_and_debrief_use_confirmed_history(api_client) -> None:
    client, _, _ = api_client
    decision = client.post(
        f"/api/simulations/{SESSION_ID}/decisions",
        headers={"Idempotency-Key": "api-test-report"},
        json={
            "action_type": "change_allocation",
            "parameters": {"policy_id": "balanced"},
            "expected_turn": 0,
        },
    )
    report = client.get(f"/api/simulations/{SESSION_ID}/report")
    debrief = client.post(f"/api/simulations/{SESSION_ID}/debrief", json={})

    assert decision.status_code == 200
    assert report.status_code == 200
    assert report.json()["outcomes"]["reservoir_level"] >= 0
    assert len(report.json()["decisions"]) == 1
    assert debrief.status_code == 200
    assert debrief.json()["source"] == "fallback"
    assert debrief.json()["ai_feedback_status"] == "ai_unavailable"
