"""World-state models own reservoir, inflow, demand, budget, and service values."""

from typing import Any


def validate_world_state(state: dict[str, Any], scenario: dict[str, Any]) -> None:
    """Validate scenario-bounded world state; TODO(owner): implement constraints."""
    raise NotImplementedError
