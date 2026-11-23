"""Replay creates a new session from an immutable scenario; it never overwrites its source."""

from typing import Any


def replay_configuration(session: dict[str, Any]) -> dict[str, Any]:
    """Return source scenario and initial state for a new alternative run."""
    # TODO(owner): preserve immutable source run and identify parent session.
    raise NotImplementedError
