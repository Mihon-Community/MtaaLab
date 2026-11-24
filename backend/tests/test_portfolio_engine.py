"""Fixed-seed contract tests for the deterministic portfolio game rules."""

import pytest

from app.simulation.portfolio_engine import calculate_next_state, load_scenario
from app.simulation.world_state import Action


def test_soko_market_revenue_stock_and_spoilage_are_auditable() -> None:
    scenario = load_scenario("soko-market-v1")
    action = Action(
        action_type="market_plan",
        parameters={"plan_id": "steady"},
        expected_turn=0,
    )

    result = calculate_next_state(scenario["initial_state"], action, scenario, seed=0)

    assert result["state"]["cash_credits"] == 144
    assert result["state"]["stock_units"] == 6
    assert result["state"]["total_sold"] == 8
    assert result["state"]["total_spoiled"] == 1
    assert result["events"][0]["payload"] == {
        "plan_id": "steady",
        "demand_units": 8,
        "sold_units": 8,
        "spoiled_units": 1,
        "order_quantity": 5,
        "delivered_units": 5,
        "unit_cost": 4,
        "selling_price": 8,
    }


def test_fever_response_applies_infrastructure_effect_one_turn_later() -> None:
    scenario = load_scenario("mtoni-fever-v1")
    first = calculate_next_state(
        scenario["initial_state"],
        Action(action_type="install_water_point", parameters={}, expected_turn=0),
        scenario,
        seed=2,
    )
    assert first["state"]["safe_water_points"] == 60
    assert first["state"]["pending_effects"] == [
        {"field": "safe_water_points", "amount": 10, "apply_turn": 2}
    ]

    second = calculate_next_state(
        first["state"],
        Action(action_type="improve_clinic_readiness", parameters={}, expected_turn=1),
        scenario,
        seed=2,
    )
    assert second["state"]["safe_water_points"] == 70
    assert second["state"]["clinic_readiness"] == 30


def test_chama_reserve_and_delayed_repayment_remain_separate() -> None:
    scenario = load_scenario("chama-circle-v1")
    loan = calculate_next_state(
        scenario["initial_state"],
        Action(action_type="approve_request_a", parameters={}, expected_turn=0),
        scenario,
        seed=0,
    )
    assert loan["state"]["pool_tokens"] == 70
    assert loan["state"]["reserve_tokens"] == 20
    assert loan["state"]["outstanding_tokens"] == 33
    assert loan["state"]["scheduled_repayments"] == [{"due_turn": 2, "amount_due": 33}]

    next_turn = calculate_next_state(
        loan["state"],
        Action(action_type="save_tokens", parameters={}, expected_turn=1),
        scenario,
        seed=0,
    )
    assert next_turn["state"]["pool_tokens"] == 100
    assert next_turn["state"]["reserve_tokens"] == 30
    assert next_turn["state"]["outstanding_tokens"] == 13
    assert next_turn["state"]["delayed_tokens"] == 13


@pytest.mark.parametrize(
    ("rules_version", "action"),
    [
        (
            "soko-market-v1",
            Action(action_type="market_plan", parameters={"plan_id": "other"}, expected_turn=0),
        ),
        (
            "mtoni-fever-v1",
            Action(action_type="install_water_point", parameters={"cost": 1}, expected_turn=0),
        ),
        (
            "chama-circle-v1",
            Action(action_type="approve_request_a", parameters={}, expected_turn=1),
        ),
    ],
)
def test_invalid_or_stale_portfolio_action_does_not_return_a_new_state(
    rules_version, action
) -> None:
    scenario = load_scenario(rules_version)
    with pytest.raises(ValueError):
        calculate_next_state(scenario["initial_state"], action, scenario, seed=0)
