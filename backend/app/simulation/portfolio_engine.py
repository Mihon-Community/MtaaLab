"""Deterministic rules for MtaaLab's non-water learning games.

The game engines accept only a published scenario version, a confirmed state and
an allowlisted action. They return JSON-ready state and events; they never call AI.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.simulation.world_state import Action, Event

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"
SCENARIOS = {
    "soko-market-v1": "soko_market_v1.json",
    "mtoni-fever-v1": "mtoni_fever_v1.json",
    "chama-circle-v1": "chama_circle_v1.json",
}


class GameState(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    current_turn: int = Field(ge=0)
    completed_actions: list[str] = Field(default_factory=list)


class SokoState(GameState):
    cash_credits: int = Field(ge=0)
    stock_units: int = Field(ge=0)
    selling_price: int = Field(ge=1)
    total_sold: int = Field(ge=0)
    total_spoiled: int = Field(ge=0)


class FeverState(GameState):
    budget_tokens: int = Field(ge=0)
    safe_water_points: int = Field(ge=0, le=100)
    handwashing_points: int = Field(ge=0, le=100)
    clinic_readiness: int = Field(ge=0, le=100)
    pending_effects: list[dict[str, Any]] = Field(default_factory=list)


class ChamaState(GameState):
    pool_tokens: int = Field(ge=0)
    reserve_tokens: int = Field(ge=0)
    outstanding_tokens: int = Field(ge=0)
    repayments_received: int = Field(ge=0)
    delayed_tokens: int = Field(ge=0)
    scheduled_repayments: list[dict[str, Any]] = Field(default_factory=list)


@dataclass(frozen=True, slots=True)
class GameTurnResult:
    turn: int
    accepted: Literal[True]
    action: Action
    state: dict[str, Any]
    events: list[Event]
    water_accounting: None = None
    idempotent_replay: bool = False


def load_scenario(rules_version: str) -> dict[str, Any]:
    """Load only a checked-in, immutable ruleset selected by its version key."""
    filename = SCENARIOS.get(rules_version)
    if filename is None:
        raise LookupError("No backend scenario is configured for this mission version")
    with (SCENARIO_DIR / filename).open(encoding="utf-8") as scenario_file:
        scenario = json.load(scenario_file)
    if scenario.get("rules_version") != rules_version:
        raise ValueError("Scenario file and database rules version do not match")
    return scenario


def _model_for(scenario: dict[str, Any]) -> type[GameState]:
    models: dict[str, type[GameState]] = {
        "soko_market": SokoState,
        "mtoni_fever": FeverState,
        "chama_circle": ChamaState,
    }
    model = models.get(str(scenario.get("scenario_id")))
    if model is None:
        raise LookupError("Unknown game scenario")
    return model


def normalize_state(scenario: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Validate JSON state at both load and write boundaries."""
    model = _model_for(scenario)
    try:
        validated = model.model_validate(state)
    except (ValidationError, TypeError, ValueError) as error:
        raise ValueError("Invalid game state") from error
    return validated.model_dump(mode="json")


def action_catalogue(scenario: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"action_type": action_type, **definition}
        for action_type, definition in scenario.get("actions", {}).items()
    ]


def calculate_next_state(
    state: dict[str, Any],
    action: Action | dict[str, Any],
    scenario: dict[str, Any],
    *,
    seed: int = 0,
) -> dict[str, Any]:
    """Compute one deterministic turn; all constants come from versioned scenario JSON."""
    current = normalize_state(scenario, state)
    action_model = action if isinstance(action, Action) else Action.model_validate(action)
    if action_model.expected_turn != current["current_turn"]:
        raise ValueError("expected_turn does not match the current confirmed turn")
    next_turn = current["current_turn"] + 1
    horizon = int(scenario["number_of_turns"])
    if next_turn > horizon:
        raise ValueError("Game has reached its final turn")

    game_id = scenario["scenario_id"]
    action_type = action_model.action_type
    params = action_model.parameters
    action_config = scenario.get("actions", {}).get(action_type)
    if action_config is None:
        raise ValueError("Action is not available in this game")
    if action_type in current["completed_actions"] and action_config.get("one_time", False):
        raise ValueError("This action has already been used")

    event_index = (seed + next_turn - 1) % len(scenario["events"])
    if game_id == "soko_market":
        if action_type != "market_plan" or set(params) != {"plan_id"}:
            raise ValueError("Choose one published market plan")
        plan_id = params["plan_id"]
        plan = scenario["plans"].get(plan_id)
        if plan is None:
            raise ValueError("Market plan is unavailable")
        _require_budget(current["cash_credits"], plan["order_quantity"] * scenario["unit_cost"])
        event = scenario["events"][event_index]
        demand = max(
            0,
            min(
                int(scenario["demand_cap"]),
                int(scenario["base_demand"])
                + int(event["demand_delta"])
                + (int(scenario["reference_price"]) - int(plan["price"])) // 2,
            ),
        )
        delivered = max(
            0,
            int(plan["order_quantity"]) - int(event.get("short_delivery_units", 0)),
        )
        available = current["stock_units"] + delivered
        sold = min(available, demand)
        unsold = available - sold
        spoiled = unsold // int(scenario["spoilage_divisor"])
        next_state = {
            **current,
            "current_turn": next_turn,
            "cash_credits": current["cash_credits"]
            - delivered * int(scenario["unit_cost"])
            + sold * int(plan["price"]),
            "stock_units": unsold - spoiled,
            "selling_price": int(plan["price"]),
            "total_sold": current["total_sold"] + sold,
            "total_spoiled": current["total_spoiled"] + spoiled,
            "completed_actions": [*current["completed_actions"], action_type],
        }
        payload = {
            "plan_id": plan_id,
            "demand_units": demand,
            "sold_units": sold,
            "spoiled_units": spoiled,
            "order_quantity": int(plan["order_quantity"]),
            "delivered_units": delivered,
            "unit_cost": int(scenario["unit_cost"]),
            "selling_price": int(plan["price"]),
        }
        event_type = str(event["event_type"])
    elif game_id == "mtoni_fever":
        if action_type not in {
            "install_water_point",
            "add_handwashing",
            "improve_clinic_readiness",
        }:
            raise ValueError("Action is not available in this game")
        if params:
            raise ValueError("This action does not accept parameters")
        cost = int(action_config["cost"])
        _require_budget(current["budget_tokens"], cost)
        next_state = {
            **current,
            "current_turn": next_turn,
            "budget_tokens": current["budget_tokens"] - cost,
        }
        due_effects: list[dict[str, Any]] = []
        for effect in current["pending_effects"]:
            if int(effect["apply_turn"]) <= next_turn:
                field = str(effect["field"])
                next_state[field] = min(100, int(next_state[field]) + int(effect["amount"]))
            else:
                due_effects.append(effect)
        if action_type == "install_water_point":
            due_effects.append(
                {"field": "safe_water_points", "amount": 10, "apply_turn": next_turn + 1}
            )
        elif action_type == "add_handwashing":
            due_effects.append(
                {"field": "handwashing_points", "amount": 10, "apply_turn": next_turn + 1}
            )
        else:
            next_state["clinic_readiness"] = min(100, current["clinic_readiness"] + 10)
        next_state["pending_effects"] = due_effects
        next_state["completed_actions"] = [*current["completed_actions"], action_type]
        event = scenario["events"][event_index]
        next_state["safe_water_points"] = max(
            0,
            min(100, int(next_state["safe_water_points"]) + int(event.get("safe_water_delta", 0))),
        )
        event_type = str(event["event_type"])
        payload = {
            "action_type": action_type,
            "cost_tokens": cost,
            "pending_effects": [
                effect for effect in due_effects if effect["apply_turn"] == next_turn + 1
            ],
            "event_note": event["message"],
            "fictional_index_only": True,
        }
    else:
        if action_type not in {"save_tokens", "approve_request_a", "approve_request_b"}:
            raise ValueError("Action is not available in this game")
        if params:
            raise ValueError("This action does not accept parameters")
        next_state = {**current, "current_turn": next_turn}
        event = scenario["events"][event_index]
        due = sorted(current["scheduled_repayments"], key=lambda payment: int(payment["due_turn"]))
        payment_capacity = int(event.get("payment_capacity", 0))
        received_total = 0
        remaining_due: list[dict[str, Any]] = []
        for payment in due:
            if int(payment["due_turn"]) > next_turn or payment_capacity <= 0:
                remaining_due.append(payment)
                continue
            received = min(int(payment["amount_due"]), payment_capacity)
            payment_capacity -= received
            received_total += received
            amount_left = int(payment["amount_due"]) - received
            if amount_left:
                remaining_due.append({**payment, "amount_due": amount_left})
        next_state["pool_tokens"] = current["pool_tokens"] + received_total
        next_state["outstanding_tokens"] = current["outstanding_tokens"] - received_total
        next_state["repayments_received"] = current["repayments_received"] + received_total
        next_state["scheduled_repayments"] = remaining_due
        next_state["delayed_tokens"] = max(0, int(next_state["outstanding_tokens"]))
        if action_type == "save_tokens":
            amount = int(scenario["save_amount"])
            _require_budget(next_state["pool_tokens"] - current["reserve_tokens"], amount)
            next_state["pool_tokens"] += amount
            next_state["reserve_tokens"] = current["reserve_tokens"] + amount
            payload = {
                "saved_tokens": amount,
                "reserve_tokens": next_state["reserve_tokens"],
                "received_tokens": received_total,
            }
        else:
            request_key = "request_a_tokens" if action_type.endswith("_a") else "request_b_tokens"
            amount = int(scenario[request_key])
            available = next_state["pool_tokens"] - current["reserve_tokens"]
            _require_budget(available, amount)
            next_state["pool_tokens"] -= amount
            fee = math.floor(amount * int(scenario["example_fee_percent"]) / 100)
            amount_due = amount + fee
            next_state["outstanding_tokens"] += amount_due
            next_state["delayed_tokens"] = next_state["outstanding_tokens"]
            next_state["scheduled_repayments"] = [
                *remaining_due,
                {"due_turn": next_turn + 1, "amount_due": amount_due},
            ]
            payload = {
                "request": "A" if action_type.endswith("_a") else "B",
                "approved_tokens": amount,
                "amount_due_tokens": amount_due,
                "fee_tokens": fee,
                "received_tokens": received_total,
                "delayed_tokens": next_state["outstanding_tokens"],
                "reserve_tokens": current["reserve_tokens"],
                "external_event": event["event_type"],
                "fictional_tokens_only": True,
            }
        next_state["completed_actions"] = [*current["completed_actions"], action_type]
        event_type = str(event["event_type"])

    normalized = normalize_state(scenario, next_state)
    event_model = Event(
        event_type=event_type,
        turn_number=next_turn,
        payload=payload,
        engine_version=str(scenario["rules_version"]),
    )
    return {
        "turn": next_turn,
        "accepted": True,
        "action": action_model.model_dump(mode="json"),
        "state": normalized,
        "events": [event_model.model_dump(mode="json")],
        "water_accounting": None,
    }


def _require_budget(available: int, needed: int) -> None:
    if needed < 0 or available < needed:
        raise ValueError("Not enough fictional tokens for this choice")


def validate_action(action: Action, state: dict[str, Any], scenario: dict[str, Any]) -> None:
    """Validate without mutating the supplied state."""
    calculate_next_state(state, action, scenario)
