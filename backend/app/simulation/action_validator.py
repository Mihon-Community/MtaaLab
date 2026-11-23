"""Action validation owns allowed actions, ranges, prerequisites, costs and affordability."""

from typing import Any


def validate_action(
    action: dict[str, Any], state: dict[str, Any], scenario: dict[str, Any]
) -> None:
    """Reject invalid or unaffordable decisions without mutating state."""
    # TODO(owner): implement against the versioned scenario action catalogue.
    raise NotImplementedError
