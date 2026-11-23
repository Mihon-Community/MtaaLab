"""Approved scenario events; model output cannot define event effects."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from typing import Any


def get_event(
    event_id: str, catalogue: Mapping[str, Any] | Sequence[Mapping[str, Any]]
) -> dict[str, Any] | None:
    """Return a defensive copy of one approved event, if it is configured."""
    if isinstance(catalogue, Mapping):
        event = catalogue.get(event_id)
    else:
        event = next((entry for entry in catalogue if entry.get("event_id") == event_id), None)
    if event is None:
        return None
    if not isinstance(event, Mapping):
        raise ValueError("configured event must be an object")
    return deepcopy(dict(event))


def events_for_turn(scenario: Mapping[str, Any], turn_number: int) -> list[dict[str, Any]]:
    """Build validated engine events for one scenario turn without numeric effects."""
    events: list[dict[str, Any]] = []
    for entry in scenario.get("scripted_events", []):
        if entry.get("turn") != turn_number:
            continue
        event_id = entry.get("event_id")
        if not isinstance(event_id, str) or not event_id:
            raise ValueError("scripted event must have an event_id")
        events.append(
            {
                "event_type": event_id,
                "turn_number": turn_number,
                "payload": {"message": str(entry.get("message", ""))},
                "engine_version": str(scenario.get("rules_version", "mtoni-rules-v1")),
            }
        )
    return events
