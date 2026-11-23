"""Atomic, idempotent decision submission with non-blocking AI feedback."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status

from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_simulation_gateway, get_stakeholder_feedback_task
from app.api.errors import simulation_http_error
from app.api.schemas import DecisionRequest, DecisionResponse
from app.simulation.engine import load_scenario
from app.simulation.gateway import SimulationGateway
from app.simulation.world_state import Action, TurnResult

router = APIRouter(prefix="/api/simulations", tags=["decisions"])


def _dialogue_facts(result: TurnResult) -> dict[str, Any]:
    """Build a minimal, de-identified post-turn snapshot for fictional dialogue."""
    return {
        "turn": result.turn,
        "action_type": result.action.action_type,
        "reservoir_level": result.state.reservoir_level,
        "budget_remaining": result.state.budget_remaining,
        "service_levels": result.state.service_levels,
        "unmet_demand_by_sector": result.state.unmet_demand_by_sector,
        "event_types": [event.event_type for event in result.events],
    }


@router.post(
    "/{session_id}/decisions",
    response_model=DecisionResponse,
    status_code=status.HTTP_200_OK,
)
def submit_decision(
    session_id: UUID,
    request: DecisionRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    feedback_task: Callable[..., None] = Depends(get_stakeholder_feedback_task),  # noqa: B008
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
) -> DecisionResponse:
    """Commit one engine-confirmed turn before returning its state to the client."""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Simulation session not found",
        )

    action = Action(
        action_type=request.action_type,
        parameters=request.parameters,
        expected_turn=request.expected_turn,
    )
    try:
        result = gateway.submit_decision(session_id, user.id, action, idempotency_key)
        ai_status: str = "pending"
        if result.idempotent_replay:
            history = gateway.history(session_id, user.id, limit=100, offset=0)
            stored_turn = next(
                (item for item in history["entries"] if item["turn"] == result.turn),
                None,
            )
            ai_status = (stored_turn or {}).get("ai_feedback_status") or "pending"
        else:
            actors = [actor["actor_id"] for actor in load_scenario()["approved_actors"]]
            actor_id = actors[(result.turn - 1) % len(actors)]
            background_tasks.add_task(
                feedback_task,
                session_id=session_id,
                turn=result.turn,
                state_summary=_dialogue_facts(result),
                actor_id=actor_id,
            )
        return DecisionResponse(
            session_id=session_id,
            turn=result.turn,
            accepted=True,
            state=result.state,
            events=result.events,
            water_accounting=result.water_accounting,
            ai_feedback_status=ai_status,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error
