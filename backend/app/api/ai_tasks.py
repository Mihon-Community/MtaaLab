"""Bounded background AI work and separately persisted validated outputs."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.ai.stakeholder_service import stakeholder_dialogue
from app.db.repositories import AIInteractionRepository
from app.db.session import get_session_factory


def record_ai_interaction(
    *,
    session_id: UUID,
    turn: int,
    task_type: str,
    model_id: str,
    output: dict[str, Any],
    validation_status: str,
    latency_ms: int | None,
) -> None:
    """Persist a validated output without retaining a prompt or hidden reasoning."""
    try:
        with get_session_factory()() as db:
            AIInteractionRepository(db).add(
                session_id=session_id,
                task_type=task_type,
                model_id=model_id,
                output={"turn": turn, "result": output},
                validation_status=validation_status,
                latency_ms=latency_ms,
            )
            db.commit()
    except Exception:
        # AI auditing is best-effort and must never undo or delay a confirmed turn.
        return


def run_stakeholder_feedback(
    *, session_id: UUID, turn: int, state_summary: dict[str, Any], actor_id: str
) -> None:
    """Generate one bounded post-turn response and store only validated model output."""

    def record(**item: Any) -> None:
        record_ai_interaction(
            session_id=session_id,
            turn=turn,
            task_type=item["task_type"],
            model_id=item["model_id"],
            output=item["output"],
            validation_status=item["validation_status"],
            latency_ms=item["latency_ms"],
        )

    stakeholder_dialogue(
        state_summary,
        actor_id,
        record_interaction=record,
    )
