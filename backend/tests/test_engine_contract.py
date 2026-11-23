"""SIM-01..04 engine acceptance tests for the versioned Mtoni rules."""

from __future__ import annotations

from copy import deepcopy
from itertools import product
from typing import Any

import pytest

from app.simulation.action_validator import ActionValidationError
from app.simulation.engine import calculate_next_state, load_scenario


@pytest.fixture
def scenario() -> dict[str, Any]:
    return load_scenario()


def action(action_type: str, turn: int, parameters: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "action_type": action_type,
        "parameters": parameters or {},
        "expected_turn": turn,
    }


def test_same_inputs_are_deterministic(scenario: dict[str, Any]) -> None:
    """SIM-01: scenario version, state, and validated action yield the same result."""
    state = deepcopy(scenario["initial_state"])
    decision = action("repair_main_pipe", 0)

    first = calculate_next_state(state, decision, scenario)
    second = calculate_next_state(state, decision, scenario)

    assert first == second
    assert first["state"]["current_turn"] == 1
    assert first["events"][0]["event_type"] == "weekly_water_report"


def test_unaffordable_action_is_rejected_without_mutation(scenario: dict[str, Any]) -> None:
    """SIM-02: rejected budget action leaves both input objects untouched."""
    state = deepcopy(scenario["initial_state"])
    state["budget_remaining"] = 0
    state_before = deepcopy(state)
    decision = action("repair_main_pipe", 0)
    decision_before = deepcopy(decision)

    with pytest.raises(ActionValidationError, match="insufficient budget"):
        calculate_next_state(state, decision, scenario)

    assert state == state_before
    assert decision == decision_before


def test_out_of_range_parameter_is_rejected(scenario: dict[str, Any]) -> None:
    """SIM-03: storage capacity values outside scenario bounds are rejected."""
    state = deepcopy(scenario["initial_state"])
    before = deepcopy(state)

    with pytest.raises(ActionValidationError, match="above its configured maximum"):
        calculate_next_state(
            state, action("install_storage", 0, {"capacity_increase": 31}), scenario
        )

    assert state == before


def test_water_accounting_is_conserved(scenario: dict[str, Any]) -> None:
    """SIM-04: opening stock plus inflow equals stock, uses, losses, and overflow."""
    result = calculate_next_state(
        scenario["initial_state"], action("repair_main_pipe", 0), scenario
    )
    water = result["water_accounting"]
    used = sum(water["withdrawals_by_sector"].values())

    assert water["opening_reservoir"] + water["inflow"] == pytest.approx(
        water["closing_reservoir"] + used + water["leakage"] + water["overflow"],
        abs=1e-8,
    )
    assert result["state"]["budget_remaining"] >= 0
    assert 0 <= result["state"]["reservoir_level"] <= result["state"]["reservoir_capacity"]


def test_critical_services_are_prioritized_when_water_is_scarce(
    scenario: dict[str, Any],
) -> None:
    state = deepcopy(scenario["initial_state"])
    state["reservoir_level"] = 8
    result = calculate_next_state(state, action("repair_main_pipe", 0), scenario)
    services = result["state"]["service_levels"]

    assert services["clinic"] >= services["households"]
    assert services["school"] >= services["households"]
    assert result["water_accounting"]["closing_reservoir"] >= 0


def test_delayed_conservation_effect_applies_on_configured_turn(
    scenario: dict[str, Any],
) -> None:
    initial_demand = scenario["initial_state"]["demand_by_sector"]["households"]
    first = calculate_next_state(
        scenario["initial_state"],
        action("conservation_campaign", 0, {"household_reduction_ratio": 0.1}),
        scenario,
    )

    assert first["state"]["demand_by_sector"]["households"] == initial_demand
    assert first["state"]["pending_effects"][0]["apply_turn"] == 2

    second = calculate_next_state(
        first["state"], action("change_allocation", 1, {"policy_id": "balanced"}), scenario
    )
    assert second["state"]["demand_by_sector"]["households"] == pytest.approx(initial_demand * 0.9)
    assert second["state"]["pending_effects"] == []


def test_one_time_action_cannot_be_repeated(scenario: dict[str, Any]) -> None:
    first = calculate_next_state(scenario["initial_state"], action("repair_main_pipe", 0), scenario)

    with pytest.raises(ActionValidationError, match="already been used"):
        calculate_next_state(first["state"], action("repair_main_pipe", 1), scenario)


def test_every_six_turn_action_sequence_preserves_state_invariants(
    scenario: dict[str, Any],
) -> None:
    """Exhaustively visit all five-action sequences over the full six-turn mission."""
    initial_state = deepcopy(scenario["initial_state"])
    choices = (
        ("repair_main_pipe", {}),
        ("conservation_campaign", {"household_reduction_ratio": 0.1}),
        ("change_allocation", {"policy_id": "balanced"}),
        ("install_storage", {"capacity_increase": 10}),
        ("efficient_irrigation", {"farm_reduction_ratio": 0.1}),
    )

    for sequence in product(choices, repeat=scenario["number_of_turns"]):
        state = deepcopy(initial_state)
        for action_type, parameters in sequence:
            current_turn = state["current_turn"]
            try:
                result = calculate_next_state(
                    state, action(action_type, current_turn, parameters), scenario
                )
            except ActionValidationError:
                # A repeated one-time intervention is rejected with no mutation;
                # a zero-cost allocation update still advances this mission week.
                result = calculate_next_state(
                    state,
                    action("change_allocation", current_turn, {"policy_id": "balanced"}),
                    scenario,
                )
            state = result["state"]
            balance = result["water_accounting"]
            assert balance["opening_reservoir"] + balance["inflow"] == pytest.approx(
                balance["closing_reservoir"]
                + sum(balance["withdrawals_by_sector"].values())
                + balance["leakage"]
                + balance["overflow"],
                abs=1e-8,
            )
            assert state["budget_remaining"] >= 0
            assert 0 <= state["reservoir_level"] <= state["reservoir_capacity"]
            assert all(0 <= level <= 1 for level in state["service_levels"].values())
            assert all(value >= 0 for value in state["demand_by_sector"].values())

        assert state["current_turn"] == scenario["number_of_turns"]
