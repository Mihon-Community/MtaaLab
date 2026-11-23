"""Approved scenario events and their numerical effects are configuration, never AI inventions."""

from typing import Any


def get_event(event_id: str, catalogue: dict[str, Any]) -> dict[str, Any] | None:
    """Look up one pre-approved event; TODO(owner): validate event schema."""
    return catalogue.get(event_id)
