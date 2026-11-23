"""Pure, bounded USSD menu rendering and input transitions."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

MAX_SCREEN_LENGTH = 160


@dataclass(frozen=True)
class MenuResult:
    """One menu transition; an action is returned for the shared engine to validate."""

    screen: str
    response: str
    action_type: str | None = None
    parameters: dict[str, Any] | None = None
    exit_session: bool = False
    cancel: bool = False


def phone_reference(phone_number: str) -> str:
    """Return the only phone representation that may be stored or logged."""
    return sha256(phone_number.strip().encode("utf-8")).hexdigest()


def callback_request_key(provider_session_id: str, cumulative_text: str) -> str:
    """Hash a provider request so callback text is not persisted in mobile state."""
    value = f"{provider_session_id}\0{cumulative_text}".encode()
    return sha256(value).hexdigest()


def split_cumulative_text(text: str) -> list[str]:
    """Africa's Talking supplies the complete menu path on each callback."""
    if not text:
        return []
    return [segment.strip() for segment in text.split("*")]


def allowed_phone(phone_number: str, configured_phones: str) -> bool:
    """Check an optional comma-separated allowlist without storing phone values."""
    configured = [value.strip() for value in configured_phones.split(",") if value.strip()]
    return not configured or phone_number.strip() in configured


def _value(value: Any) -> str:
    """Format an authoritative state value without doing a simulation calculation."""
    return format(value, "g") if isinstance(value, int | float) else str(value)


def _con(body: str) -> str:
    """Fit a continuation screen inside the provider's 160-character limit."""
    return f"CON {body}"[:MAX_SCREEN_LENGTH]


def _end(body: str) -> str:
    """Fit an ending screen inside the provider's 160-character limit."""
    return f"END {body}"[:MAX_SCREEN_LENGTH]


def allocation_choices(scenario: dict[str, Any]) -> list[tuple[str, str]]:
    """Expose up to three configured scenario allocation policies."""
    policies = scenario.get("allocation_policies", {})
    return [
        (policy_id, str(definition.get("label", policy_id)))
        for policy_id, definition in list(policies.items())[:3]
    ]


def render_menu(
    screen: str,
    state: dict[str, Any],
    scenario: dict[str, Any],
    menu_state: dict[str, Any] | None = None,
) -> str:
    """Render the current short menu from confirmed state and static scenario values."""
    menu_state = menu_state or {}
    if screen == "main":
        body = (
            f"Mtoni turn {state.get('current_turn', 0)}. "
            f"Water {_value(state.get('reservoir_level', 0))}; "
            f"budget {_value(state.get('budget_remaining', 0))}. "
            "1 Repair 2 Conserve 3 Allocate 4 Needs 0 Exit"
        )
        return _con(body)
    if screen == "confirm_repair":
        cost = scenario.get("actions", {}).get("repair_main_pipe", {}).get("cost", 0)
        return _con(f"Repair pipe costs {_value(cost)} credits. 1 Confirm 2 Cancel")
    if screen == "confirm_conservation":
        cost = scenario.get("actions", {}).get("conservation_campaign", {}).get("cost", 0)
        return _con(f"Conservation costs {_value(cost)} credits. 1 Confirm 2 Cancel")
    if screen == "allocation":
        options = allocation_choices(scenario)
        choices = " ".join(f"{index}. {label}" for index, (_, label) in enumerate(options, 1))
        return _con(f"Allocation policy: {choices} 0 Back")
    if screen == "confirm_allocation":
        policy_id = menu_state.get("pending_policy")
        policy = scenario.get("allocation_policies", {}).get(policy_id, {})
        label = policy.get("label", policy_id or "policy")
        cost = scenario.get("actions", {}).get("change_allocation", {}).get("cost", 0)
        return _con(f"Set {label}; cost {_value(cost)} credits. 1 Confirm 2 Cancel")
    if screen == "inspect":
        demand = state.get("demand_by_sector", {})
        needs = " ".join(
            f"{short}: {_value(demand.get(sector, 0))}"
            for short, sector in (
                ("H", "households"),
                ("S", "school"),
                ("C", "clinic"),
                ("F", "farms"),
            )
        )
        return _con(f"Community needs H/S/C/F: {needs}. 0 Back")
    return _con("Invalid choice. 1 Repair 2 Conserve 3 Allocate 4 Needs 0 Exit")


def invalid_choice(
    screen: str, state: dict[str, Any], scenario: dict[str, Any], menu_state: dict[str, Any]
) -> MenuResult:
    """Keep the caller on the same menu after invalid input."""
    current = render_menu(screen, state, scenario, menu_state)
    body = current[4:] if current.startswith("CON ") else current
    return MenuResult(screen=screen, response=_con(f"Invalid choice. {body}"))


def process_input(
    text: str,
    screen: str,
    state: dict[str, Any],
    scenario: dict[str, Any],
    menu_state: dict[str, Any] | None = None,
) -> MenuResult:
    """Interpret only menu choices; all numeric effects remain in the simulation engine."""
    menu_state = dict(menu_state or {})
    choices = split_cumulative_text(text)
    choice = choices[-1] if choices else ""

    if screen == "main":
        if choice == "0":
            return MenuResult(
                screen="ended", response=_end("MtaaLab sandbox demo ended."), exit_session=True
            )
        if choice == "1":
            return MenuResult(
                screen="confirm_repair",
                response=render_menu("confirm_repair", state, scenario, menu_state),
            )
        if choice == "2":
            return MenuResult(
                screen="confirm_conservation",
                response=render_menu("confirm_conservation", state, scenario, menu_state),
            )
        if choice == "3":
            return MenuResult(
                screen="allocation", response=render_menu("allocation", state, scenario)
            )
        if choice == "4":
            return MenuResult(screen="inspect", response=render_menu("inspect", state, scenario))
        if not choices:
            return MenuResult(screen="main", response=render_menu("main", state, scenario))
        return invalid_choice(screen, state, scenario, menu_state)

    if screen in {"confirm_repair", "confirm_conservation", "confirm_allocation"}:
        if choice == "2":
            return MenuResult(
                screen="main",
                response=render_menu("main", state, scenario),
                cancel=True,
            )
        if choice != "1":
            return invalid_choice(screen, state, scenario, menu_state)
        if screen == "confirm_repair":
            return MenuResult(
                screen="main", response="", action_type="repair_main_pipe", parameters={}
            )
        if screen == "confirm_conservation":
            return MenuResult(
                screen="main",
                response="",
                action_type="conservation_campaign",
                parameters={"household_reduction_ratio": 0.1},
            )
        return MenuResult(
            screen="main",
            response="",
            action_type="change_allocation",
            parameters={"policy_id": menu_state.get("pending_policy")},
        )

    if screen == "allocation":
        options = allocation_choices(scenario)
        if choice == "0":
            return MenuResult(
                screen="main", response=render_menu("main", state, scenario), cancel=True
            )
        if not choice.isdigit() or not 1 <= int(choice) <= len(options):
            return invalid_choice(screen, state, scenario, menu_state)
        policy_id, _ = options[int(choice) - 1]
        next_state = {**menu_state, "pending_policy": policy_id}
        return MenuResult(
            screen="confirm_allocation",
            response=render_menu("confirm_allocation", state, scenario, next_state),
            parameters={"policy_id": policy_id},
        )

    if screen == "inspect":
        if choice == "0":
            return MenuResult(
                screen="main", response=render_menu("main", state, scenario), cancel=True
            )
        return invalid_choice(screen, state, scenario, menu_state)

    return invalid_choice("main", state, scenario, menu_state)


def completion_message(state: dict[str, Any]) -> str:
    """Return a short non-identifying summary for the terminal USSD screen."""
    return _end(
        f"Mission complete. Turn {state.get('current_turn', 0)}; "
        f"water {_value(state.get('reservoir_level', 0))}; "
        f"budget {_value(state.get('budget_remaining', 0))}. Sandbox demo."
    )


def recorded_message(state: dict[str, Any]) -> str:
    """Tell the learner the committed turn before showing the next menu."""
    return _con(
        f"Decision recorded at turn {state.get('current_turn', 0)}. "
        f"Water {_value(state.get('reservoir_level', 0))}; "
        f"budget {_value(state.get('budget_remaining', 0))}. "
        "1 Repair 2 Conserve 3 Allocate 4 Needs 0 Exit"
    )
