"""Scenario-configured allocation; AI never selects water quantities."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

_EPSILON = 1e-12


def allocate_water(
    available: float,
    demand: Mapping[str, float],
    policy: Mapping[str, Any],
    critical_minimums: Mapping[str, float] | None = None,
) -> dict[str, float]:
    """Allocate water with critical minima first, then weighted capped sharing.

    When there is insufficient water to meet all critical minima, clinic and school
    receive the same proportional share of their configured minimum requirements.
    The remainder uses the policy's relative sector weights, redistributing any
    amount released by a sector that reaches its demand cap.
    """
    if not math.isfinite(available) or available < 0:
        raise ValueError("available water must be a non-negative finite quantity")
    if not demand or any(not math.isfinite(amount) or amount < 0 for amount in demand.values()):
        raise ValueError("sector demands must be non-negative finite quantities")

    raw_weights = policy.get("weights", {})
    if not isinstance(raw_weights, Mapping):
        raise ValueError("allocation policy weights must be an object")
    weights: dict[str, float] = {}
    for sector in demand:
        try:
            weight = float(raw_weights[sector])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"allocation policy has no valid weight for {sector}") from exc
        if not math.isfinite(weight) or weight <= 0:
            raise ValueError(f"allocation weight for {sector} must be positive and finite")
        weights[sector] = weight

    minima = critical_minimums or {}
    minimum_requirements: dict[str, float] = {}
    for sector, minimum_share in minima.items():
        if sector not in demand:
            raise ValueError(f"critical minimum refers to unknown sector {sector}")
        if not math.isfinite(minimum_share) or not 0 <= minimum_share <= 1:
            raise ValueError(f"critical minimum for {sector} must be in [0, 1]")
        minimum_requirements[sector] = demand[sector] * minimum_share

    allocations = dict.fromkeys(demand, 0.0)
    requested_critical = sum(minimum_requirements.values())
    critical_water = min(available, requested_critical)
    if requested_critical > _EPSILON and critical_water > 0:
        remaining_critical = critical_water
        critical_sectors = list(minimum_requirements)
        for index, sector in enumerate(critical_sectors):
            if index == len(critical_sectors) - 1:
                share = remaining_critical
            else:
                share = critical_water * minimum_requirements[sector] / requested_critical
                remaining_critical -= share
            allocations[sector] = min(minimum_requirements[sector], max(0.0, share))

    remaining_water = max(0.0, available - sum(allocations.values()))
    remaining_demand = {sector: max(0.0, demand[sector] - allocations[sector]) for sector in demand}
    # Weighted water filling: any amount that exceeds a sector's remaining demand
    # is redistributed in the next iteration among sectors that still have room.
    while remaining_water > _EPSILON:
        eligible = [sector for sector in demand if remaining_demand[sector] > _EPSILON]
        if not eligible:
            break
        weight_total = sum(weights[sector] for sector in eligible)
        distributed = 0.0
        for sector in eligible:
            proposed = remaining_water * weights[sector] / weight_total
            amount = min(proposed, remaining_demand[sector])
            allocations[sector] += amount
            remaining_demand[sector] -= amount
            distributed += amount
        if distributed <= _EPSILON:
            break
        remaining_water = max(0.0, remaining_water - distributed)

    return {sector: min(demand[sector], max(0.0, amount)) for sector, amount in allocations.items()}
