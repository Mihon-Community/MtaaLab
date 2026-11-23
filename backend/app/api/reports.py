"""Persisted learner reports and bounded AI debrief/assessment endpoints."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.ai.debrief_service import create_debrief
from app.ai.reasoning_evaluator import evaluate_reasoning
from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_ai_interaction_recorder, get_simulation_gateway
from app.api.errors import simulation_http_error
from app.api.schemas import DebriefRequest, DebriefResponse, ReportResponse
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
            output=item["output"],
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
        state = state_record["state"]
        entries = timeline["entries"]
        return ReportResponse(
            session_id=session_id,
            mission_id=state_record["mission_id"],
            status=state_record["status"],
            current_turn=state_record["turn"],
            outcomes={
                "reservoir_level": state.reservoir_level,
                "reservoir_capacity": state.reservoir_capacity,
                "budget_remaining": state.budget_remaining,
                "service_levels": state.service_levels,
                "unmet_demand_by_sector": state.unmet_demand_by_sector,
                "crop_health": state.crop_health,
                "wellbeing": state.wellbeing,
            },
            decisions=[entry["action"] for entry in entries if entry.get("action")],
            events=[event for entry in entries for event in entry.get("events", [])],
            assessment=None,
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

        reasoning_result = None
        if request is not None and request.student_explanation:
            reasoning_result = evaluate_reasoning(
                request.student_explanation,
                {"entries": timeline["entries"]},
                record_interaction=callback,
            )

        debrief_result = create_debrief(
            timeline,
            record_interaction=callback,
        )
        debrief = debrief_result.output.model_dump(mode="json")
        statuses = [debrief_result.status]
        if reasoning_result is not None:
            debrief["reasoning_assessment"] = reasoning_result.output.model_dump(mode="json")
            statuses.append(reasoning_result.status)
        overall_status = (
            "available" if all(item == "available" for item in statuses) else "ai_unavailable"
        )
        return DebriefResponse(
            session_id=session_id,
            debrief=debrief,
            source=debrief_result.source,
            ai_feedback_status=overall_status,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error
