"""Action validation owns allowed actions, ranges, prerequisites, costs and affordability."""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from app.simulation.world_state import Action, WorldState


class ActionValidationError(ValueError):
    """A student action cannot be applied to the supplied world state."""


def _as_mapping(action: Action | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(action, Action):
        return action.model_dump(mode="python")
    if not isinstance(action, Mapping):
        raise ActionValidationError("action must be an Action or mapping")
    return dict(action)


def validate_action(
    action: Action | Mapping[str, Any],
    state: WorldState | Mapping[str, Any],
    scenario: Mapping[str, Any],
) -> None:
    """Raise ``ActionValidationError`` for unknown, invalid, or unaffordable actions.

    The function is pure: it only reads its arguments and never adjusts the state or action.
    """
    action_data = _as_mapping(action)
    try:
        current_state = state if isinstance(state, WorldState) else WorldState.model_validate(state)
    except (TypeError, ValueError) as exc:
        raise ActionValidationError(f"invalid world state: {exc}") from exc

    action_type = action_data.get("action_type")
    definitions = scenario.get("actions", {})
    if not isinstance(action_type, str) or action_type not in definitions:
        raise ActionValidationError("unknown action type")
    definition = definitions[action_type]
    if not isinstance(definition, Mapping):
        raise ActionValidationError("action definition is invalid")

    expected_turn = action_data.get("expected_turn", current_state.current_turn)
    if expected_turn != current_state.current_turn:
        raise ActionValidationError("expected_turn is stale")

    parameters = action_data.get("parameters", {})
    if not isinstance(parameters, Mapping):
        raise ActionValidationError("action parameters must be an object")
    parameter_rules = definition.get("parameters", {})
    if set(parameters) != set(parameter_rules):
        raise ActionValidationError("action parameters do not match the configured schema")

    for parameter_name, rule in parameter_rules.items():
        if not isinstance(rule, Mapping):
            raise ActionValidationError(f"parameter rule for {parameter_name} is invalid")
        value = parameters[parameter_name]
        if "allowed" in rule:
            if value not in rule["allowed"]:
                raise ActionValidationError(f"{parameter_name} is not an allowed value")
            continue
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ActionValidationError(f"{parameter_name} must be numeric") from exc
        if not math.isfinite(number):
            raise ActionValidationError(f"{parameter_name} must be finite")
        minimum, maximum = rule.get("minimum"), rule.get("maximum")
        if minimum is not None and number < minimum:
            raise ActionValidationError(f"{parameter_name} is below its configured minimum")
        if maximum is not None and number > maximum:
            raise ActionValidationError(f"{parameter_name} is above its configured maximum")

    for prerequisite in definition.get("prerequisites", []):
        if prerequisite not in current_state.used_actions:
            raise ActionValidationError(f"action prerequisite not met: {prerequisite}")

    if definition.get("one_time", False) and action_type in current_state.used_actions:
        raise ActionValidationError("one-time action has already been used")

    cost = definition.get("cost")
    if (
        not isinstance(cost, int | float)
        or isinstance(cost, bool)
        or not math.isfinite(cost)
        or cost < 0
    ):
        raise ActionValidationError("configured action cost must be a non-negative finite number")
    if cost > current_state.budget_remaining:
        raise ActionValidationError("insufficient budget for this action")

    delay_turns = definition.get("delay_turns", 0)
    if not isinstance(delay_turns, int) or isinstance(delay_turns, bool) or delay_turns < 0:
        raise ActionValidationError("configured action delay must be a non-negative integer")

    effect = definition.get("effect", {})
    if not isinstance(effect, Mapping) or effect.get("type") not in {
        "reduce_leakage",
        "reduce_demand",
        "set_allocation_policy",
        "increase_capacity",
    }:
        raise ActionValidationError("action has an unsupported configured effect")
    if (
        effect.get("type") == "reduce_demand"
        and effect.get("sector") not in current_state.demand_by_sector
    ):
        raise ActionValidationError("demand effect refers to an unknown sector")

    policies = scenario.get("allocation_policies", {})
    if action_type == "change_allocation" and parameters.get("policy_id") not in policies:
        raise ActionValidationError("allocation policy is not configured for this scenario")
