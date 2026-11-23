"""Report and debrief endpoints expose and reuse persisted reasoning evidence."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.ai.reasoning_evaluator import RUBRIC_VERSION
from app.ai.schemas import CriterionFeedback, Debrief, ReasoningAssessment
from app.api.auth import CurrentUser
from app.api.reports import create_session_debrief, get_report
from app.api.schemas import DebriefRequest
from app.simulation.world_state import WorldState

SESSION_ID = UUID("00000000-0000-4000-8000-000000000777")
MISSION_ID = UUID("40000000-0000-4000-8000-000000000001")
USER_ID = UUID("00000000-0000-4000-8000-000000000102")


def _assessment() -> ReasoningAssessment:
    return ReasoningAssessment(
        rubric_version=RUBRIC_VERSION,
        criteria=[
            CriterionFeedback(
                criterion_id="evidence_use",
                evidence="The recorded state contains the outcome.",
                feedback="Use that outcome to support the decision.",
            )
        ],
        overall_feedback="Explain one recorded cause and effect.",
        referenced_facts=["entries[0].turn"],
    )


class FakeDb:
    def __init__(self) -> None:
        self.saved = None
        self.commits = 0

    def scalar(self, _statement):
        return self.saved

    def scalars(self, _statement):
        return SimpleNamespace(first=lambda: self.saved)

    def add(self, row):
        self.saved = row

    def commit(self):
        self.commits += 1

    def rollback(self):
        raise AssertionError("single-threaded assessment should not conflict")


class FakeGateway:
    def __init__(self, db: FakeDb) -> None:
        self.db = db
        self.state = WorldState.model_validate(
            {
                "current_turn": 1,
                "reservoir_level": 55,
                "reservoir_capacity": 100,
                "demand_by_sector": {
                    "households": 20,
                    "school": 8,
                    "clinic": 6,
                    "farms": 15,
                },
                "leakage": 4,
                "budget_remaining": 75,
                "service_levels": {
                    "households": 1.0,
                    "school": 1.0,
                    "clinic": 1.0,
                    "farms": 1.0,
                },
                "unmet_demand_by_sector": {
                    "households": 0,
                    "school": 0,
                    "clinic": 0,
                    "farms": 0,
                },
                "crop_health": 70,
                "wellbeing": 70,
                "allocation_policy": "balanced",
                "used_actions": [],
                "pending_effects": [],
            }
        )
        self.entries = [
            {"turn": 0, "action": None, "events": [], "state": self.state},
            {
                "turn": 1,
                "action": {
                    "action_type": "repair_main_pipe",
                    "parameters": {},
                    "expected_turn": 0,
                },
                "events": [],
                "state": self.state,
            },
        ]

    def history(self, _session_id, _user_id, limit=50, offset=0):
        return {
            "session_id": SESSION_ID,
            "entries": self.entries[offset : offset + limit],
            "limit": limit,
            "offset": offset,
            "total": len(self.entries),
        }

    def get_state(self, _session_id, _user_id):
        return {
            "session_id": SESSION_ID,
            "mission_id": MISSION_ID,
            "turn": self.state.current_turn,
            "status": "completed",
            "state": self.state,
        }


def _debrief(*_args, **_kwargs):
    return SimpleNamespace(
        output=Debrief(
            summary="The confirmed outcomes reflect the recorded choices.",
            trade_offs=["Compare the recorded sector needs."],
            replay_suggestion="Try another allocation.",
            referenced_facts=[],
        ),
        status="available",
        source="nvidia",
    )


def test_debrief_persists_then_reuses_one_assessment(monkeypatch) -> None:
    db = FakeDb()
    gateway = FakeGateway(db)
    user = CurrentUser(id=USER_ID, role="student", school_id=None)
    calls = []
    result = SimpleNamespace(
        output=_assessment(),
        status="available",
        source="nvidia",
    )
    monkeypatch.setattr("app.api.reports.create_debrief", _debrief)
    monkeypatch.setattr(
        "app.api.reports.evaluate_reasoning",
        lambda *_args, **_kwargs: calls.append("evaluated") or result,
    )

    first = create_session_debrief(
        SESSION_ID,
        DebriefRequest(student_explanation="The leak affected households."),
        user,
        gateway,
        lambda **_kwargs: None,
    )
    second = create_session_debrief(
        SESSION_ID,
        DebriefRequest(student_explanation="A changed explanation on retry."),
        user,
        gateway,
        lambda **_kwargs: None,
    )

    assert calls == ["evaluated"]
    assert db.commits == 1
    assert first.debrief["reasoning_assessment"]["rubric_version"] == RUBRIC_VERSION
    assert second.debrief["reasoning_assessment"] == first.debrief["reasoning_assessment"]


def test_report_returns_persisted_assessment(monkeypatch) -> None:
    db = FakeDb()
    gateway = FakeGateway(db)
    user = CurrentUser(id=USER_ID, role="student", school_id=None)
    assessment = _assessment()
    db.saved = SimpleNamespace(
        id=UUID("00000000-0000-4000-8000-000000000099"),
        session_id=SESSION_ID,
        rubric_version=RUBRIC_VERSION,
        evidence={"turn_count": 1},
        feedback={
            "assessment": assessment.model_dump(mode="json"),
            "source": "nvidia",
            "ai_feedback_status": "available",
        },
        teacher_review_status="pending",
    )

    report = get_report(SESSION_ID, user, gateway)

    assert report.assessment is not None
    assert report.assessment["rubric_version"] == RUBRIC_VERSION
    assert report.assessment["feedback"]["overall_feedback"] == (
        "Explain one recorded cause and effect."
    )
    assert report.assessment["teacher_review_status"] == "pending"


def test_reasoning_assessment_requires_completed_mission(monkeypatch) -> None:
    db = FakeDb()
    gateway = FakeGateway(db)
    gateway.get_state = lambda *_args: {"status": "active"}
    user = CurrentUser(id=USER_ID, role="student", school_id=None)
    monkeypatch.setattr(
        "app.api.reports.evaluate_reasoning",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("active-session reasoning must not be assessed")
        ),
    )

    with pytest.raises(HTTPException) as error:
        create_session_debrief(
            SESSION_ID,
            DebriefRequest(student_explanation="A short cause and effect."),
            user,
            gateway,
            lambda **_kwargs: None,
        )

    assert error.value.status_code == 409
