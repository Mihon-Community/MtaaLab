"""Allocation policies own configured sector water allocation; AI must never choose quantities."""

from typing import Any


def allocate_water(
    available: float, demand: dict[str, float], policy: dict[str, Any]
) -> dict[str, float]:
    """Return per-sector allocations under the selected explicit policy."""
    # TODO(owner): define and test one MVP allocation policy.
    raise NotImplementedError
