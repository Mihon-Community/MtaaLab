"""Pure replay helpers preserve the source run and its immutable initial setup."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.simulation.world_state import WorldState


def replay_configuration(session: dict[str, Any]) -> dict[str, Any]:
    """Describe a new turn-zero child session from a source session's initial snapshot."""
    try:
        parent_session_id = UUID(str(session["session_id"]))
        student_id = UUID(str(session["student_id"]))
        mission_version_id = UUID(str(session["mission_version_id"]))
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Replay source is missing valid session ownership metadata") from error
    if "initial_state" not in session:
        raise ValueError("Replay source must include its immutable initial state")
    initial_state = WorldState.model_validate(session["initial_state"])
    if initial_state.current_turn != 0:
        raise ValueError("Replay initial state must be turn zero")
    return {
        "parent_session_id": parent_session_id,
        "student_id": student_id,
        "mission_version_id": mission_version_id,
        "initial_state": initial_state.model_dump(mode="json"),
    }
