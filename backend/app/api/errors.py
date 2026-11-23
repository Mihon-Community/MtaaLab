"""Safe HTTP mappings for simulation service failures."""

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.simulation.service import (
    MissionNotFoundError,
    PersistenceInvariantError,
    SessionConflictError,
    SessionNotFoundError,
    StaleTurnError,
)


def simulation_http_error(error: Exception) -> HTTPException:
    """Map domain exceptions without returning database/provider details."""
    if isinstance(error, SessionNotFoundError | MissionNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    if isinstance(error, StaleTurnError | SessionConflictError | IntegrityError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The simulation changed; fetch the latest confirmed state and retry.",
        )
    if isinstance(error, PersistenceInvariantError):
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The simulation could not be safely completed.",
        )
    if isinstance(error, ValueError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The requested simulation action is invalid.",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="The request could not be completed.",
    )
