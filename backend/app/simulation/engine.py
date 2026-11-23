"""Turn orchestration owns reproducible outcomes; TODO(owner): implement after rules review."""

from typing import Any


def calculate_next_state(
    state: dict[str, Any], action: dict[str, Any], scenario: dict[str, Any]
) -> dict[str, Any]:
    """Calculate a validated next state from one scenario, prior state, and action."""
    # TODO(owner): implement deterministic turn accounting and test SIM-01..SIM-06.
    raise NotImplementedError
