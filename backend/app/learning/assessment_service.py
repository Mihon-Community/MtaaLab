"""Persist one validated qualitative reasoning assessment per mission session."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.nvidia_client import redact_direct_pii
from app.ai.reasoning_evaluator import RUBRIC_VERSION
from app.ai.schemas import ReasoningAssessment
from app.db.models import LearningAssessment


def _json_value(value: Any) -> Any:
    """Convert SQLAlchemy/Pydantic history values into JSON-safe data."""
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def build_assessment_evidence(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Keep only bounded simulation facts; never retain the learner's free text."""
    saved_entries: list[dict[str, Any]] = []
    for entry in entries[-100:]:
        raw_state = _json_value(entry.get("state") or {})
        state = raw_state if isinstance(raw_state, dict) else {}
        safe_state = {
            key: state[key]
            for key in (
                "current_turn",
                "reservoir_level",
                "reservoir_capacity",
                "budget_remaining",
                "service_levels",
                "unmet_demand_by_sector",
                "crop_health",
                "wellbeing",
            )
            if key in state
        }

        raw_action = _json_value(entry.get("action"))
        action: dict[str, Any] | None = None
        if isinstance(raw_action, dict):
            action = {
                key: raw_action[key]
                for key in ("action_type", "parameters", "expected_turn")
                if key in raw_action
            }
        saved_entries.append(
            {
                "turn": entry.get("turn"),
                "action": action,
                "state": safe_state,
            }
        )

    return {
        "turn_count": max((int(item["turn"] or 0) for item in saved_entries), default=0),
        "entries": saved_entries,
    }


def get_assessment(
    db: Session, session_id: UUID, rubric_version: str = RUBRIC_VERSION
) -> LearningAssessment | None:
    """Return this session's assessment for a rubric version, if it exists."""
    return db.scalar(
        select(LearningAssessment).where(
            LearningAssessment.session_id == session_id,
            LearningAssessment.rubric_version == rubric_version,
        )
    )


def get_latest_assessment(db: Session, session_id: UUID) -> LearningAssessment | None:
    """Return the newest persisted assessment for an authorized session."""
    return db.scalars(
        select(LearningAssessment)
        .where(LearningAssessment.session_id == session_id)
        .order_by(LearningAssessment.created_at.desc(), LearningAssessment.id.desc())
        .limit(1)
    ).first()


def persist_assessment(
    db: Session,
    *,
    session_id: UUID,
    evidence: dict[str, Any],
    assessment: ReasoningAssessment,
    source: str,
    ai_feedback_status: str,
) -> LearningAssessment:
    """Insert idempotently; a concurrent retry returns the winning saved result."""
    safe_assessment = ReasoningAssessment.model_validate(
        redact_direct_pii(assessment.model_dump(mode="json"))
    )
    existing = get_assessment(db, session_id)
    if existing is not None:
        return existing

    row = LearningAssessment(
        id=uuid4(),
        session_id=session_id,
        rubric_version=safe_assessment.rubric_version,
        evidence=build_assessment_evidence(evidence.get("entries", [])),
        feedback={
            "assessment": safe_assessment.model_dump(mode="json"),
            "source": source,
            "ai_feedback_status": ai_feedback_status,
        },
        teacher_review_status="pending",
    )
    db.add(row)
    try:
        db.commit()
        return row
    except IntegrityError:
        # The database's UNIQUE(session_id, rubric_version) index serializes
        # concurrent retries. Roll back and return the committed winner.
        db.rollback()
        existing = get_assessment(db, session_id)
        if existing is None:
            raise
        return existing


def assessment_report(row: LearningAssessment | None) -> dict[str, Any] | None:
    """Serialize the persisted assessment without exposing database identifiers."""
    if row is None:
        return None
    feedback = row.feedback if isinstance(row.feedback, dict) else {}
    return {
        "rubric_version": row.rubric_version,
        "evidence": row.evidence,
        "feedback": feedback.get("assessment", feedback),
        "source": feedback.get("source"),
        "ai_feedback_status": feedback.get("ai_feedback_status"),
        "teacher_review_status": row.teacher_review_status,
    }
