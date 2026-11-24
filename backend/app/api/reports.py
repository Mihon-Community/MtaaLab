"""Persisted learner reports and bounded AI debrief/assessment endpoints."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.ai.debrief_service import create_debrief
from app.ai.nvidia_client import redact_direct_pii
from app.ai.reasoning_evaluator import evaluate_reasoning
from app.ai.schemas import ReasoningAssessment
from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_ai_interaction_recorder, get_simulation_gateway
from app.api.errors import simulation_http_error
from app.api.schemas import DebriefRequest, DebriefResponse, ReportResponse
from app.learning.assessment_service import (
    assessment_report,
    get_assessment,
    get_latest_assessment,
    persist_assessment,
)
from app.simulation.gateway import SimulationGateway

router = APIRouter(prefix="/api/simulations", tags=["reports"])


def _bound_recorder(
    recorder: Callable[..., None], session_id: UUID, turn: int
) -> Callable[..., None]:
    """Bind ownership metadata to validated AI output without recording prompts."""

    def record(**item: Any) -> None:
        recorder(
            session_id=session_id,
            turn=turn,
            task_type=item["task_type"],
            model_id=item["model_id"],
            output=redact_direct_pii(item["output"]),
            validation_status=item["validation_status"],
            latency_ms=item["latency_ms"],
        )

    return record


@router.get("/{session_id}/report", response_model=ReportResponse)
def get_report(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
) -> ReportResponse:
    """Build a report only from the confirmed state and persisted history."""
    try:
        state_record = gateway.get_state(session_id, user.id)
        timeline = gateway.history(session_id, user.id, limit=100, offset=0)
        db = getattr(gateway, "db", None)
        assessment_row = get_latest_assessment(db, session_id) if db is not None else None
        state = state_record["state"]
        state_data = state.model_dump(mode="json") if hasattr(state, "model_dump") else dict(state)
        entries = timeline["entries"]
        return ReportResponse(
            session_id=session_id,
            mission_id=state_record["mission_id"],
            status=state_record["status"],
            current_turn=state_record["turn"],
            outcomes=state_data,
            decisions=[entry["action"] for entry in entries if entry.get("action")],
            events=[event for entry in entries for event in entry.get("events", [])],
            assessment=assessment_report(assessment_row),
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error


@router.post("/{session_id}/debrief", response_model=DebriefResponse)
def create_session_debrief(
    session_id: UUID,
    request: DebriefRequest | None = None,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    recorder: Callable[..., None] = Depends(get_ai_interaction_recorder),  # noqa: B008
) -> DebriefResponse:
    """Return a validated debrief and optional qualitative reasoning assessment."""
    try:
        timeline = gateway.history(session_id, user.id, limit=100, offset=0)
        latest_turn = max((entry["turn"] for entry in timeline["entries"]), default=0)
        callback = _bound_recorder(recorder, session_id, latest_turn)

        db = getattr(gateway, "db", None)
        reasoning_assessment: dict[str, Any] | None = None
        reasoning_status: str | None = None
        if request is not None and request.student_explanation:
            session_state = gateway.get_state(session_id, user.id)
            if session_state["status"] != "completed":
                raise HTTPException(
                    status_code=409,
                    detail="Reasoning assessment is available after mission completion",
                )
            existing = get_assessment(db, session_id) if db is not None else None
            if existing is not None:
                report_value = assessment_report(existing) or {}
                reasoning_assessment = report_value.get("feedback")
                reasoning_status = report_value.get("ai_feedback_status")
            elif session_state.get("scenario_id", "mtoni") != "mtoni":
                # The current evaluator is calibrated only for the Mtoni water scenario.
                # Do not label explanations for other games with an unrelated rubric.
                reasoning_status = "ai_unavailable"
            else:
                reasoning_result = evaluate_reasoning(
                    request.student_explanation,
                    {"entries": timeline["entries"]},
                    record_interaction=callback,
                )
                safe_output = ReasoningAssessment.model_validate(
                    redact_direct_pii(reasoning_result.output.model_dump(mode="json"))
                )
                if db is not None:
                    saved = persist_assessment(
                        db,
                        session_id=session_id,
                        evidence={"entries": timeline["entries"]},
                        assessment=safe_output,
                        source=reasoning_result.source,
                        ai_feedback_status=reasoning_result.status,
                    )
                    saved_report = assessment_report(saved) or {}
                    reasoning_assessment = saved_report.get("feedback")
                    reasoning_status = saved_report.get("ai_feedback_status")
                else:
                    reasoning_assessment = safe_output.model_dump(mode="json")
                    reasoning_status = reasoning_result.status

        session_state = gateway.get_state(session_id, user.id)
        if session_state.get("scenario_id", "mtoni") == "mtoni":
            debrief_result = create_debrief(timeline, record_interaction=callback)
            debrief = debrief_result.output.model_dump(mode="json")
            debrief_source = debrief_result.source
            statuses = [debrief_result.status]
        else:
            debrief = {
                "summary": (
                    f"The saved {session_state['scenario_id']} run contains {latest_turn} "
                    "confirmed turns. Review the decision and event records before replaying."
                ),
                "trade_offs": ["Compare the confirmed state before and after each decision."],
                "replay_suggestion": (
                    "Replay and choose a different plan to compare the saved outcomes."
                ),
                "referenced_facts": [],
            }
            debrief_source = "fallback"
            statuses = ["ai_unavailable"]
        if reasoning_assessment is not None:
            debrief["reasoning_assessment"] = reasoning_assessment
            statuses.append(reasoning_status or "ai_unavailable")
        overall_status = (
            "available" if all(item == "available" for item in statuses) else "ai_unavailable"
        )
        return DebriefResponse(
            session_id=session_id,
            debrief=debrief,
            source=debrief_source,
            ai_feedback_status=overall_status,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error
