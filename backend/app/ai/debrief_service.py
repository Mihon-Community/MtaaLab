"""Debriefs explain recorded outcomes; numeric claims must match engine records."""

from app.ai.schemas import Debrief


def create_debrief(history: list[dict[str, object]]) -> Debrief:
    """Produce a validated factual debrief; TODO(owner): implement fallback."""
    raise NotImplementedError
