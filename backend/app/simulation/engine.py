"""Pure deterministic Mtoni turn calculation."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.simulation.action_validator import ActionValidationError, validate_action
from app.simulation.allocation_rules import allocate_water
from app.simulation.event_catalogue import events_for_turn
from app.simulation.world_state import Action, Event, TurnResult, WaterAccounting, WorldState

SCENARIO_PATH = Path(__file__).resolve().parent / "scenarios" / "mtoni_v1.json"
_FLOAT_EPSILON = 1e-8


class InvalidWorldStateError(ValueError):
    """The supplied state is invalid for the scenario or outside its bounds."""


@lru_cache(maxsize=1)
def _scenario_template() -> dict[str, Any]:
    return json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))


def load_scenario() -> dict[str, Any]:
    """Read and return a fresh copy of the committed Mtoni scenario definition."""
    return deepcopy(_scenario_template())


def _finite_state(state: WorldState) -> None:
    values = [
        state.reservoir_level,
        state.reservoir_capacity,
        state.leakage,
        state.budget_remaining,
        state.crop_health,
        state.wellbeing,
        *state.demand_by_sector.values(),
        *state.service_levels.values(),
        *state.unmet_demand_by_sector.values(),
    ]
    if any(not math.isfinite(value) for value in values):
        raise InvalidWorldStateError("world state values must be finite")


def validate_world_state(
    state: WorldState | Mapping[str, Any], scenario: Mapping[str, Any]
) -> None:
    """Validate canonical state shape, numeric bounds, and scenario references."""
    try:
        current = state if isinstance(state, WorldState) else WorldState.model_validate(state)
    except (ValidationError, TypeError, ValueError) as exc:
        raise InvalidWorldStateError(f"invalid world state: {exc}") from exc

    _finite_state(current)
    horizon = scenario.get("number_of_turns")
    if not isinstance(horizon, int) or horizon < 1:
        raise InvalidWorldStateError("scenario must define a positive number_of_turns")
    if current.current_turn > horizon:
        raise InvalidWorldStateError("world state is beyond the scenario horizon")

    base_capacity = scenario.get("reservoir_capacity")
    if not isinstance(base_capacity, int | float) or not math.isfinite(base_capacity):
        raise InvalidWorldStateError("scenario reservoir_capacity must be finite")
    capacity_actions = [
        definition
        for definition in scenario.get("actions", {}).values()
        if definition.get("effect", {}).get("type") == "increase_capacity"
    ]
    maximum_increase = max(
        (
            rule.get("maximum", 0)
            for definition in capacity_actions
            for rule in definition.get("parameters", {}).values()
        ),
        default=0,
    )
    if current.reservoir_capacity > base_capacity + maximum_increase + _FLOAT_EPSILON:
        raise InvalidWorldStateError("reservoir capacity exceeds the scenario maximum")

    policies = scenario.get("allocation_policies", {})
    if current.allocation_policy not in policies:
        raise InvalidWorldStateError("world state references an unknown allocation policy")

    known_actions = scenario.get("actions", {})
    if any(action_type not in known_actions for action_type in current.used_actions):
        raise InvalidWorldStateError("world state contains an unknown used action")
    for effect in current.pending_effects:
        if effect.action_type not in known_actions:
            raise InvalidWorldStateError("pending effect refers to an unknown action")


def _as_action(action: Action | Mapping[str, Any], current_turn: int) -> Action:
    if isinstance(action, Action):
        return action
    if not isinstance(action, Mapping):
        raise ActionValidationError("action must be an Action or mapping")
    action_data = dict(action)
    action_data.setdefault("expected_turn", current_turn)
    try:
        return Action.model_validate(action_data)
    except (ValidationError, TypeError, ValueError) as exc:
        raise ActionValidationError(f"invalid action shape: {exc}") from exc


def _apply_effect(
    state_data: dict[str, Any], effect: Mapping[str, Any], parameters: Mapping[str, Any]
) -> None:
    """Apply one already-approved scenario effect to a private state copy."""
    effect_type = effect.get("type")
    if effect_type == "reduce_leakage":
        amount = float(effect["amount"])
        state_data["leakage"] = max(0.0, float(state_data["leakage"]) - amount)
    elif effect_type == "reduce_demand":
        sector = effect["sector"]
        parameter = effect["ratio_parameter"]
        ratio = float(parameters[parameter])
        state_data["demand_by_sector"][sector] = max(
            0.0, float(state_data["demand_by_sector"][sector]) * (1.0 - ratio)
        )
    elif effect_type == "set_allocation_policy":
        state_data["allocation_policy"] = parameters[effect["parameter"]]
    elif effect_type == "increase_capacity":
        amount = float(parameters[effect["parameter"]])
        state_data["reservoir_capacity"] = float(state_data["reservoir_capacity"]) + amount
    else:
        raise ValueError(f"unsupported configured action effect: {effect_type}")


def _apply_due_effects(state_data: dict[str, Any], turn_number: int) -> None:
    pending: list[dict[str, Any]] = []
    for effect in state_data.get("pending_effects", []):
        if int(effect["apply_turn"]) <= turn_number:
            sector = effect["sector"]
            ratio = float(effect["reduction_ratio"])
            state_data["demand_by_sector"][sector] = max(
                0.0,
                float(state_data["demand_by_sector"][sector]) * (1.0 - ratio),
            )
        else:
            pending.append(effect)
    state_data["pending_effects"] = pending


def calculate_next_state(
    state: WorldState | Mapping[str, Any],
    action: Action | Mapping[str, Any],
    scenario: Mapping[str, Any],
) -> dict[str, Any]:
    """Return a complete ``TurnResult`` dict for one validated deterministic turn.

    Inputs are never mutated. Validation and calculation occur on private model/dict
    copies so a rejected action cannot partially change caller-owned state.
    """
    try:
        current_state = state if isinstance(state, WorldState) else WorldState.model_validate(state)
    except (ValidationError, TypeError, ValueError) as exc:
        raise InvalidWorldStateError(f"invalid world state: {exc}") from exc
    validate_world_state(current_state, scenario)
    action_model = _as_action(action, current_state.current_turn)
    validate_action(action_model, current_state, scenario)

    next_turn = current_state.current_turn + 1
    horizon = int(scenario["number_of_turns"])
    if next_turn > horizon:
        raise ActionValidationError("mission has reached its final turn")

    inflow_schedule = scenario.get("inflow_schedule", [])
    if not isinstance(inflow_schedule, list) or len(inflow_schedule) < horizon:
        raise InvalidWorldStateError("inflow_schedule must provide one value per turn")
    inflow = float(inflow_schedule[next_turn - 1])
    if not math.isfinite(inflow) or inflow < 0:
        raise InvalidWorldStateError("inflow must be a non-negative finite quantity")

    action_definition = scenario["actions"][action_model.action_type]
    action_parameters = action_model.parameters
    state_data = current_state.model_dump(mode="json")
    state_data["pending_effects"] = [
        effect.model_dump(mode="json") for effect in current_state.pending_effects
    ]
    state_data["budget_remaining"] = float(current_state.budget_remaining) - float(
        action_definition["cost"]
    )
    if action_definition.get("one_time", False):
        state_data["used_actions"].append(action_model.action_type)

    _apply_due_effects(state_data, next_turn)
    effect_definition = action_definition["effect"]
    delay_turns = int(action_definition.get("delay_turns", 0))
    if delay_turns == 0:
        _apply_effect(state_data, effect_definition, action_parameters)
    elif effect_definition["type"] == "reduce_demand":
        sector = effect_definition["sector"]
        parameter = effect_definition["ratio_parameter"]
        state_data["pending_effects"].append(
            {
                "action_type": action_model.action_type,
                "apply_turn": next_turn + delay_turns,
                "effect_type": "reduce_demand",
                "sector": sector,
                "reduction_ratio": float(action_parameters[parameter]),
            }
        )
    else:
        raise InvalidWorldStateError("only demand reductions may be delayed")

    opening_reservoir = float(current_state.reservoir_level)
    capacity = float(state_data["reservoir_capacity"])
    gross_water = opening_reservoir + inflow
    overflow = max(0.0, gross_water - capacity)
    available_water = gross_water - overflow
    actual_leakage = min(float(state_data["leakage"]), available_water)
    distributable_water = max(0.0, available_water - actual_leakage)

    policy_id = state_data["allocation_policy"]
    policy = scenario["allocation_policies"].get(policy_id)
    if policy is None:
        raise InvalidWorldStateError("selected allocation policy is not configured")
    critical_minimums = scenario.get("critical_service_minimums", {})
    withdrawals = allocate_water(
        distributable_water,
        state_data["demand_by_sector"],
        policy,
        critical_minimums,
    )
    total_withdrawals = sum(withdrawals.values())
    closing_reservoir = gross_water - overflow - actual_leakage - total_withdrawals
    if closing_reservoir < 0 and abs(closing_reservoir) <= _FLOAT_EPSILON:
        closing_reservoir = 0.0
    closing_reservoir = min(capacity, max(0.0, closing_reservoir))

    unmet_demand: dict[str, float] = {}
    service_levels: dict[str, float] = {}
    for sector, demand in state_data["demand_by_sector"].items():
        delivered = min(float(demand), withdrawals[sector])
        unmet_demand[sector] = max(0.0, float(demand) - delivered)
        service_levels[sector] = min(1.0, max(0.0, delivered / float(demand))) if demand else 1.0

    crop_health_delta = round(10 * (service_levels["farms"] - 0.7))
    wellbeing_delta = round(
        6 * (service_levels["households"] - 0.7) + 8 * (service_levels["clinic"] - 0.7)
    )
    state_data.update(
        {
            "current_turn": next_turn,
            "reservoir_level": closing_reservoir,
            "reservoir_capacity": capacity,
            "service_levels": service_levels,
            "unmet_demand_by_sector": unmet_demand,
            "crop_health": min(
                100.0, max(0.0, float(current_state.crop_health) + crop_health_delta)
            ),
            "wellbeing": min(100.0, max(0.0, float(current_state.wellbeing) + wellbeing_delta)),
        }
    )

    events = [Event.model_validate(event) for event in events_for_turn(scenario, next_turn)]
    accounting = WaterAccounting(
        opening_reservoir=opening_reservoir,
        inflow=inflow,
        closing_reservoir=closing_reservoir,
        withdrawals_by_sector=withdrawals,
        leakage=actual_leakage,
        overflow=overflow,
    )
    lhs = opening_reservoir + inflow
    rhs = closing_reservoir + total_withdrawals + actual_leakage + overflow
    if not math.isclose(lhs, rhs, rel_tol=0, abs_tol=_FLOAT_EPSILON):
        raise InvalidWorldStateError("water accounting invariant was violated")

    next_state = WorldState.model_validate(state_data)
    result = TurnResult(
        turn=next_turn,
        action=action_model,
        state=next_state,
        events=events,
        water_accounting=accounting,
    )
    return result.model_dump(mode="json")
