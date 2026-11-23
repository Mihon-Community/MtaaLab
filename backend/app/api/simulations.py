"""Persisted simulation session state, history, and replay endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.api.auth import CurrentUser, get_current_user
from app.api.dependencies import get_simulation_gateway
from app.api.errors import simulation_http_error
from app.api.schemas import (
    AdvanceRequest,
    CreateSimulationRequest,
    ErrorResponse,
    HistoryResponse,
    ReplayRequest,
    ReplayResponse,
    SessionCreatedResponse,
    SessionStateResponse,
)
from app.simulation.gateway import SimulationGateway

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


@router.post("", response_model=SessionCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_simulation(
    request: CreateSimulationRequest,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    idempotency_key: str | None = Header(
        default=None, alias="Idempotency-Key", min_length=1, max_length=128
    ),
) -> SessionCreatedResponse:
    """Start a run from a published, immutable scenario version."""
    try:
        result = gateway.get_or_create_session(request.mission_id, user.id, idempotency_key)
        return SessionCreatedResponse.model_validate(result)
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error


@router.get("/{session_id}/state", response_model=SessionStateResponse)
def get_simulation_state(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
) -> SessionStateResponse:
    """Return only the caller-authorized last-confirmed state."""
    try:
        result = gateway.get_state(session_id, user.id)
        return SessionStateResponse(
            session_id=result["session_id"],
            turn=result["turn"],
            status=result["status"],
            state=result["state"],
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error


@router.get("/{session_id}/history", response_model=HistoryResponse)
def get_simulation_history(
    session_id: UUID,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> HistoryResponse:
    """Return the ordered persisted snapshots, decisions, and scripted events."""
    try:
        return HistoryResponse.model_validate(
            gateway.history(session_id, user.id, limit=limit, offset=offset)
        )
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error


@router.post("/{session_id}/replay", response_model=ReplayResponse)
def replay_simulation(
    session_id: UUID,
    request: ReplayRequest | None = None,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    idempotency_key: str | None = Header(
        default=None, alias="Idempotency-Key", min_length=1, max_length=128
    ),
) -> ReplayResponse:
    """Start a separate alternative run at the source scenario's initial state."""
    try:
        result = gateway.replay(
            session_id,
            user.id,
            idempotency_key=idempotency_key,
            label=request.label if request is not None else None,
        )
        return ReplayResponse.model_validate(result)
    except HTTPException:
        raise
    except Exception as error:
        raise simulation_http_error(error) from error


@router.post(
    "/{session_id}/advance",
    response_model=ErrorResponse,
    status_code=status.HTTP_409_CONFLICT,
)
def advance_without_decision(
    session_id: UUID,
    request: AdvanceRequest,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=200),
) -> ErrorResponse:
    """The MVP advances together with a decision, so a no-action advance is rejected."""
    del request, idempotency_key
    try:
        gateway.get_state(session_id, user.id)
    except Exception as error:
        raise simulation_http_error(error) from error
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Submit a decision to advance the MVP simulation by one turn.",
    )
