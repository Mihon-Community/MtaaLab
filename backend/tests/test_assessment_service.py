"""Assessment persistence keeps only bounded evidence and is retry-safe."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.ai.reasoning_evaluator import RUBRIC_VERSION
from app.ai.schemas import CriterionFeedback, ReasoningAssessment
from app.learning.assessment_service import (
    assessment_report,
    build_assessment_evidence,
    get_assessment,
    persist_assessment,
)

SESSION_ID = UUID("00000000-0000-4000-8000-000000000777")


def _assessment() -> ReasoningAssessment:
    return ReasoningAssessment(
        rubric_version=RUBRIC_VERSION,
        criteria=[
            CriterionFeedback(
                criterion_id="systems_thinking",
                evidence="The reservoir state changed after the recorded action.",
                feedback="Connect that change to one community need.",
            )
        ],
        overall_feedback="Use the recorded outcomes to explain a trade-off.",
        referenced_facts=["entries[1].state.reservoir_level"],
    )


def test_build_assessment_evidence_whitelists_simulation_fields() -> None:
    result = build_assessment_evidence(
        [
            {
                "turn": 1,
                "action": {
                    "action_type": "repair_main_pipe",
                    "parameters": {},
                    "expected_turn": 0,
                    "student_name": "not retained",
                },
                "state": SimpleNamespace(
                    model_dump=lambda **_: {
                        "current_turn": 1,
                        "reservoir_level": 59,
                        "budget_remaining": 75,
                        "student_name": "not retained",
                    }
                ),
            }
        ]
    )

    assert result["turn_count"] == 1
    assert result["entries"][0]["state"] == {
        "current_turn": 1,
        "reservoir_level": 59,
        "budget_remaining": 75,
    }
    assert "student_name" not in result["entries"][0]["action"]


def test_persist_assessment_inserts_one_pending_assessment() -> None:
    db = SimpleNamespace(scalar=lambda *_: None, add=lambda row: setattr(db, "row", row))
    db.commit = lambda: None

    saved = persist_assessment(
        db,
        session_id=SESSION_ID,
        evidence={"entries": [{"turn": 0, "action": None, "state": {}}]},
        assessment=_assessment(),
        source="nvidia",
        ai_feedback_status="available",
    )

    assert saved is db.row
    assert saved.session_id == SESSION_ID
    assert saved.rubric_version == RUBRIC_VERSION
    assert saved.teacher_review_status == "pending"
    assert saved.feedback["assessment"]["rubric_version"] == RUBRIC_VERSION
    assert saved.feedback["ai_feedback_status"] == "available"


def test_persist_assessment_returns_existing_record_without_rewriting() -> None:
    existing = SimpleNamespace(session_id=SESSION_ID, rubric_version=RUBRIC_VERSION)
    db = SimpleNamespace(scalar=lambda *_: existing)
    db.add = lambda _: (_ for _ in ()).throw(AssertionError("duplicate row was inserted"))
    db.commit = lambda: (_ for _ in ()).throw(AssertionError("existing row was committed"))

    result = persist_assessment(
        db,
        session_id=SESSION_ID,
        evidence={"entries": []},
        assessment=_assessment(),
        source="fallback",
        ai_feedback_status="ai_unavailable",
    )

    assert result is existing
    assert get_assessment(db, SESSION_ID) is existing


def test_concurrent_duplicate_returns_the_committed_winner() -> None:
    existing = SimpleNamespace(session_id=SESSION_ID, rubric_version=RUBRIC_VERSION)
    lookups = iter([None, existing])
    db = SimpleNamespace(
        scalar=lambda _statement: next(lookups),
        add=lambda _: None,
        commit=lambda: (_ for _ in ()).throw(IntegrityError("insert", {}, Exception("unique"))),
        rollback=lambda: None,
    )

    result = persist_assessment(
        db,
        session_id=SESSION_ID,
        evidence={"entries": []},
        assessment=_assessment(),
        source="nvidia",
        ai_feedback_status="available",
    )

    assert result is existing


def test_assessment_report_hides_database_identity() -> None:
    row = SimpleNamespace(
        id=UUID("00000000-0000-4000-8000-000000000099"),
        session_id=SESSION_ID,
        rubric_version=RUBRIC_VERSION,
        evidence={"turn_count": 1},
        feedback={
            "assessment": _assessment().model_dump(mode="json"),
            "source": "fallback",
            "ai_feedback_status": "ai_unavailable",
        },
        teacher_review_status="pending",
    )

    result = assessment_report(row)

    assert result is not None
    assert result["rubric_version"] == RUBRIC_VERSION
    assert result["teacher_review_status"] == "pending"
    assert result["ai_feedback_status"] == "ai_unavailable"
    assert "id" not in result
    assert "session_id" not in result
