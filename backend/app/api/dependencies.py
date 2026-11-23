"""Request-scoped backend services, overrideable in API tests."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.orm import Session

from app.api.ai_tasks import record_ai_interaction, run_stakeholder_feedback
from app.db.repositories import MissionRepository
from app.db.session import get_db_session
from app.simulation.gateway import SimulationGateway
from app.simulation.service import SimulationService


def get_simulation_gateway(
    db: Session = Depends(get_db_session),  # noqa: B008
) -> SimulationGateway:
    """Provide the real Postgres service; override this in API unit tests."""
    return SimulationService(db)


def get_mission_repository(
    db: Session = Depends(get_db_session),  # noqa: B008
) -> MissionRepository:
    """Provide read access to published mission metadata."""
    return MissionRepository(db)


def get_ai_interaction_recorder() -> Callable[..., None]:
    """Provide an injectable recorder for validated AI output only."""
    return record_ai_interaction


def get_stakeholder_feedback_task() -> Callable[..., None]:
    """Provide an injectable background job for post-decision dialogue."""
    return run_stakeholder_feedback
