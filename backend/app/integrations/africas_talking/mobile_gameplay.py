"""Versioned, low-bandwidth play for linked learners over SMS and USSD."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.ai.sms_intent import SMSPhase, interpret_sms_intent
from app.api.schemas import USSDCallbackRequest
from app.integrations.africas_talking.menu_state import (
    callback_request_key,
    phone_reference,
    split_cumulative_text,
)
from app.integrations.africas_talking.mobile_privacy import phone_hmac_reference
from app.integrations.africas_talking.sms_service import send_sms
from app.simulation.gateway import SimulationGateway
from app.simulation.mission_order import mission_order_key
from app.simulation.service import load_scenario
from app.simulation.world_state import Action

MOBILE_TTL = timedelta(days=30)
USSD_TTL = timedelta(seconds=180)


def _state(value: Any) -> dict[str, Any]:
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else dict(value)


def _phone_ref(phone: str) -> str:
    try:
        return phone_hmac_reference(phone)
    except ValueError:
        return phone_reference(phone)


def _student(store: Any, phone: str, ref: str) -> UUID | None:
    linked_lookup = getattr(store, "get_linked_student_id", None)
    linked = linked_lookup(ref) if linked_lookup else None
    if linked is not None:
        return linked
    legacy_lookup = getattr(store, "get_demo_student_id", None)
    return legacy_lookup(phone_reference(phone)) if legacy_lookup else None


def _games(store: Any, student_id: UUID) -> list[Any]:
    loader = getattr(store, "get_published_missions", None)
    if loader:
        return sorted(list(loader(student_id)), key=lambda game: mission_order_key(game.title))
    legacy_id = getattr(store, "get_mtoni_mission_id", lambda _student: None)(student_id)
    return [type("MissionChoice", (), {"id": legacy_id, "title": "Mtoni water resilience"})()]


def _scenario(store: Any, session_id: UUID) -> dict[str, Any]:
    loader = getattr(store, "get_scenario_for_session", None)
    if loader:
        scenario = loader(session_id)
        if scenario is not None:
            return scenario
    return load_scenario()


def _sms_intent_context(
    *, mobile: Any, store: Any, student_id: UUID
) -> tuple[SMSPhase, list[str], list[str]]:
    """Provide only the current screen's public choice labels to the intent parser."""
    state = mobile.state if mobile is not None and isinstance(mobile.state, dict) else {}
    screen = state.get("screen")
    session_id = getattr(mobile, "session_id", None)
    if not session_id:
        return "lobby", [], []
    session = store.get_simulation_session(session_id)
    if session is None or session.student_id != student_id:
        return "lobby", [], []
    scenario = _scenario(store, session_id)
    if screen == "turn":
        choices = _choice_rows(scenario, str(state.get("language", "en")))
        return "turn", [label for _, _, label in choices], []
    if screen == "reflection":
        reflection = scenario.get("reflection_choices", {})
        codes = list(reflection)
        labels = [
            str(reflection[code].get("label", code))
            if isinstance(reflection[code], dict)
            else str(code)
            for code in codes
        ]
        return "reflection", labels, codes
    if screen == "hint":
        return "hint", [], []
    return "lobby", [], []


def _is_direct_sms_command(command: str) -> bool:
    """Keep exact, documented commands off the model path."""
    direct = {
        "GAMES",
        "MICHEZO",
        "PLAY",
        "START",
        "CONTINUE",
        "ENDELEA",
        "STATUS",
        "MAENDELEO",
        "MENU",
        "HINT",
        "DOKEZO",
    }
    if command in direct or command.isdigit():
        return True
    if command.startswith(("PLAY ", "CHEZA ")):
        pieces = command.split()
        return len(pieces) == 2 and pieces[1].isdigit()
    if command.startswith(("WHY ", "KWA NINI ")):
        pieces = command.split(maxsplit=1)
        return len(pieces) == 2 and pieces[1].isdigit()
    return False


def _exact_game_index(command: str, games: list[Any]) -> int | None:
    """Match short game names directly; longer natural phrasing goes through NVIDIA."""
    text = " ".join(command.casefold().strip().split())
    for index, game in enumerate(games, start=1):
        title = str(getattr(game, "title", "Game"))
        lowered = title.casefold()
        aliases = {lowered}
        if "mama mboga" in lowered or "soko" in lowered:
            aliases.update({"soko", "market", "market game"})
        elif "fever" in lowered:
            aliases.update({"fever", "fever response"})
        elif "chama" in lowered:
            aliases.update({"chama", "trust circle"})
        elif "mtoni" in lowered or "water" in lowered:
            aliases.update({"mtoni", "water game", "mtoni water"})
        if text in aliases:
            return index
    return None


def _sms_game_information(games: list[Any]) -> list[dict[str, str]]:
    """Build a short, factual SMS guide from the four published game concepts."""
    result = []
    for index, game in enumerate(games, start=1):
        title = str(getattr(game, "title", "Game"))
        lowered = title.casefold()
        if "mama mboga" in lowered or "soko" in lowered:
            description = (
                "Also called Soko. Run a small market; choose stock and a selling price, "
                "then compare cash, demand, leftovers and spoilage."
            )
        elif "fever" in lowered:
            description = (
                "Often called Fever. Plan water access, handwashing and clinic readiness; "
                "some improvements take a turn to appear."
            )
        elif "chama" in lowered:
            description = (
                "Manage the Chama savings-group reserve, requests and repayments. "
                "No real money moves."
            )
        elif "mtoni" in lowered or "water" in lowered:
            description = (
                "Plan community water repairs, conservation, allocation, storage and irrigation."
            )
        else:
            description = (
                "A classroom simulation. Choose a listed action and compare saved results."
            )
        result.append({"index": str(index), "title": title[:100], "about": description})
    return result


_SMS_PLAYING_GUIDE = (
    "Text GAMES to list assigned games. PLAY n or a game name starts one. "
    "Each turn, choose a shown number or describe the choice. WHY1-3 are reflection options; "
    "CONTINUE resumes."
)


def _is_sms_greeting(command: str) -> bool:
    normalized = command.strip(" .,!?;:")
    greetings = {
        "HI",
        "HELLO",
        "HEY",
        "HI THERE",
        "HELLO THERE",
        "HEY THERE",
        "JAMBO",
        "HABARI",
        "HABARI GANI",
    }
    return normalized in greetings


def _sms_intent_fallback(phase: SMSPhase, language: str, *, greeting: bool = False) -> str:
    if greeting:
        return (
            "Habari! Naweza kukusaidia kuchagua mchezo. Tuma MICHEZO kuona michezo iliyowekwa."
            if language == "sw"
            else "Hi! I can help you choose a game. Text GAMES to see what's available."
        )
    if language == "sw":
        return {
            "lobby": "Sijaelewa. Tuma MICHEZO au jina la mchezo, kama Soko.",
            "turn": "Sijaelewa. Chagua namba au eleza hatua unayotaka.",
            "reflection": "Eleza sababu yako, au tuma WHY 1, WHY 2 au WHY 3.",
            "hint": "Tuma DOKEZO kupata kidokezo, au ENDELEA kucheza.",
        }[phase]
    return {
        "lobby": "I didn't catch that. Text GAMES or send a game name, like Soko.",
        "turn": "I didn't catch that. Choose a number or describe the action you want.",
        "reflection": "Tell me why you chose it, or reply WHY 1, WHY 2 or WHY 3.",
        "hint": "Text HINT for a clue or CONTINUE to play.",
    }[phase]


def _mission_title(store: Any, session_id: UUID) -> str:
    getter = getattr(store, "get_simulation_session", None)
    session = getter(session_id) if getter else None
    scenario = _scenario(store, session_id)
    if session is not None:
        version = getattr(session, "mission_version", None)
        mission = getattr(version, "mission", None) if version else None
        if mission is not None:
            return str(mission.title)
    return str(scenario.get("title", "MtaaLab game"))


def _active_session(
    store: Any,
    gateway: SimulationGateway,
    student_id: UUID,
    mission_id: UUID | None = None,
    *,
    idempotency_key: str,
) -> tuple[UUID, dict[str, Any], str] | None:
    lookup = getattr(store, "get_active_session_for_mission", None)
    session = lookup(student_id, mission_id) if lookup and mission_id else None
    if session is None and mission_id is None:
        lookup = getattr(store, "get_active_session", None)
        session = lookup(student_id) if lookup else None
    if session is not None:
        current = getattr(session, "current_state", None) or getattr(session, "state", {})
        return session.id, _state(current), str(session.status)
    if mission_id is None:
        return None
    created = gateway.get_or_create_session(mission_id, student_id, idempotency_key=idempotency_key)
    return created["session_id"], _state(created["state"]), str(created["status"])


def _save(
    store: Any,
    *,
    provider_id: str,
    ref: str,
    session_id: UUID | None,
    state: dict[str, Any],
    request_key: str,
    now: datetime,
    ttl: timedelta,
) -> None:
    store.save_mobile(
        provider_session_id=provider_id,
        phone_ref=ref,
        session_id=session_id,
        current_menu=str(state.get("screen", "main")),
        state=state,
        expires_at=now + ttl,
        last_request_key=request_key,
        replace_session_id=True,
    )


def _remember(state: dict[str, Any], request_key: str, response: str) -> dict[str, Any]:
    recent = list(state.get("recent_requests", []))
    return {
        **state,
        "recent_requests": [*recent, {"key": request_key, "response": response}][-8:],
    }


def _save_sms_conversation_reply(
    *,
    store: Any,
    provider_id: str,
    phone_ref: str,
    mobile: Any,
    language: str,
    request_key: str,
    response: str,
) -> None:
    """Cache generated text for callback retries without storing the learner's message."""
    if not callable(getattr(store, "save_mobile", None)):
        return
    state = _state(mobile.state) if mobile is not None else {}
    state.setdefault("mobile_v2", True)
    state.setdefault("screen", "lobby")
    state["language"] = language
    _save(
        store,
        provider_id=provider_id,
        ref=phone_ref,
        session_id=getattr(mobile, "session_id", None),
        state=_remember(state, request_key, response),
        request_key=request_key,
        now=datetime.now(UTC),
        ttl=MOBILE_TTL,
    )


def _find_active(
    store: Any, gateway: SimulationGateway, student_id: UUID
) -> tuple[UUID, dict[str, Any], str] | None:
    lookup = getattr(store, "get_active_session", None)
    session = lookup(student_id) if lookup else None
    if session is None:
        return None
    current = getattr(session, "current_state", None) or getattr(session, "state", {})
    return session.id, _state(current), str(session.status)


def _active_for_mobile(
    store: Any,
    gateway: SimulationGateway,
    student_id: UUID,
    mobile: Any,
) -> tuple[UUID, dict[str, Any], str] | None:
    """Prefer the phone's selected run, then fall back to the learner's latest active run."""
    session_id = getattr(mobile, "session_id", None)
    getter = getattr(store, "get_simulation_session", None)
    session = getter(session_id) if session_id is not None and getter else None
    if session is not None and session.student_id == student_id and session.status == "active":
        current = getattr(session, "current_state", None) or getattr(session, "state", {})
        return session.id, _state(current), str(session.status)
    return _find_active(store, gateway, student_id)


def _choice_rows(scenario: dict[str, Any], language: str) -> list[tuple[str, dict[str, Any], str]]:
    scenario_id = scenario.get("scenario_id")
    if scenario_id == "soko_market":
        plan_labels = {
            "value": "Bei nafuu",
            "steady": "Bei ya kati",
            "premium": "Bei juu",
        }
        return [
            (
                "market_plan",
                {"plan_id": plan_id},
                (
                    f"{plan_labels.get(plan_id, plan_id)}: agiza "
                    f"{plan.get('order_quantity', 0)} bei {plan.get('price', 0)}"
                    if language == "sw"
                    else (
                        f"{plan.get('label', plan_id)}: order "
                        f"{plan.get('order_quantity', 0)} at "
                        f"{plan.get('price', 0)} credits"
                    )
                ),
            )
            for plan_id, plan in scenario.get("plans", {}).items()
        ][:3]
    if scenario_id == "mtoni_fever":
        keys = ["install_water_point", "add_handwashing", "improve_clinic_readiness"]
        translated = ["Panga kituo cha maji", "Ongeza sehemu ya kunawa", "Imarisha kliniki"]
        english = ["Plan water point", "Add handwashing", "Improve clinic readiness"]
        return [
            (
                key,
                {},
                translated[index] if language == "sw" else english[index],
            )
            for index, key in enumerate(keys)
        ]
    if scenario_id == "chama_circle":
        keys = ["save_tokens", "approve_request_a", "approve_request_b"]
        translated = ["Ongeza akiba", "Kubali ombi A", "Kubali ombi B"]
        english = ["Add to group reserve", "Approve request A", "Approve request B"]
        return [
            (
                key,
                {},
                translated[index] if language == "sw" else english[index],
            )
            for index, key in enumerate(keys)
        ]
    if scenario_id == "mtoni":
        options = [
            ("repair_main_pipe", {}, "Rekebisha bomba" if language == "sw" else "Repair pipe"),
            (
                "conservation_campaign",
                {"household_reduction_ratio": 0.1},
                "Hifadhi maji" if language == "sw" else "Save water",
            ),
            (
                "change_allocation",
                {"policy_id": "balanced"},
                "Panga mgao" if language == "sw" else "Water plan",
            ),
            (
                "install_storage",
                {"capacity_increase": 10},
                "Hifadhi" if language == "sw" else "Add storage",
            ),
            (
                "efficient_irrigation",
                {"farm_reduction_ratio": 0.1},
                "Umwagiliaji" if language == "sw" else "Irrigation",
            ),
        ]
        return options
    return [
        (name, {}, str(definition.get("label", name)))
        for name, definition in scenario.get("actions", {}).items()
    ][:5]


def _turn_menu(title: str, scenario: dict[str, Any], state: dict[str, Any], language: str) -> str:
    choices = _choice_rows(scenario, language)
    labels = [f"{index} {label}" for index, (_, _, label) in enumerate(choices, 1)]
    total = scenario.get("number_of_turns", 6)
    turn = min(int(state.get("current_turn", 0)) + 1, int(total))
    scenario_id = scenario.get("scenario_id")
    if scenario_id == "soko_market":
        values = (
            f"Pesa: {state.get('cash_credits', 0)}; bidhaa: {state.get('stock_units', 0)}"
            if language == "sw"
            else f"Cash: {state.get('cash_credits', 0)}; stock: {state.get('stock_units', 0)}"
        )
    elif scenario.get("scenario_id") == "mtoni_fever":
        values = (
            f"Bajeti {state.get('budget_tokens', 0)}; maji "
            f"{state.get('safe_water_points', 0)}; unawaji "
            f"{state.get('handwashing_points', 0)}; kliniki "
            f"{state.get('clinic_readiness', 0)}"
            if language == "sw"
            else f"Budget {state.get('budget_tokens', 0)}; water: "
            f"{state.get('safe_water_points', 0)}; handwashing: "
            f"{state.get('handwashing_points', 0)}; clinic: "
            f"{state.get('clinic_readiness', 0)}"
        )
    elif scenario.get("scenario_id") == "chama_circle":
        values = (
            f"Mfuko: {state.get('pool_tokens', 0)}; akiba: {state.get('reserve_tokens', 0)}"
            if language == "sw"
            else f"Pool: {state.get('pool_tokens', 0)}; reserve: {state.get('reserve_tokens', 0)}"
        )
    else:
        values = (
            f"Maji: {state.get('reservoir_level', 0)}; bajeti: {state.get('budget_remaining', 0)}"
            if language == "sw"
            else (
                f"Water: {state.get('reservoir_level', 0)}; budget: "
                f"{state.get('budget_remaining', 0)}"
            )
        )
    if language == "sw":
        title = {
            "soko_market": "Soko la mboga",
            "mtoni_fever": "Mtoni Homa",
            "chama_circle": "Chama",
            "mtoni": "Mtoni Maji",
        }.get(str(scenario_id), title[:18])
        prompt = "Chagua"
        menu = "0 Menyu"
        body = f"{title}, zamu {turn}/{total}. {values}. {prompt}: {'; '.join(labels)}; {menu}."
    else:
        title = {
            "soko_market": "Soko",
            "mtoni_fever": "Fever",
            "chama_circle": "Chama",
            "mtoni": "Mtoni Water",
        }.get(str(scenario_id), title[:18])
        prompt = "Choose plan" if scenario_id == "soko_market" else "Choose"
        menu = "0 Menu"
        body = f"{title}, turn {turn}/{total}. {values}. {prompt}: {'; '.join(labels)}; {menu}."
    return body[:156]


def _games_message(games: list[Any], language: str, prefix: str = "") -> str:
    names = [str(getattr(game, "title", "Game")) for game in games]
    short_names = []
    for name in names:
        lowered = name.casefold()
        if "chama" in lowered:
            short_names.append("Chama")
        elif "mama mboga" in lowered:
            short_names.append("Soko")
        elif "fever" in lowered:
            short_names.append("Mtoni Homa" if language == "sw" else "Fever")
        elif "mtoni" in lowered or "water" in lowered:
            short_names.append("Mtoni Maji" if language == "sw" else "Mtoni water")
        else:
            short_names.append(name[:18])
    values = [f"{index} {name}" for index, name in enumerate(short_names, 1)]
    if not values:
        return (
            "Hakuna mchezo uliowekwa. Mwombe mwalimu akupe mchezo."
            if language == "sw"
            else "No games are assigned yet. Ask your teacher to assign one."
        )
    head = "Michezo:" if language == "sw" else "Games:"
    command = "Tuma CHEZA n kuchagua." if language == "sw" else "Reply PLAY n to choose."
    response = f"{head} {'; '.join(values)}. {command}"
    return f"{prefix.strip()} {response}".strip()[:160]


def _reflect_prompt(scenario: dict[str, Any], language: str) -> str:
    if language == "sw":
        labels = {
            "soko_market": ["Oda nyingi", "Bei hubadili mahitaji", "Nahitaji dokezo"],
            "mtoni_fever": ["Athari huchelewa", "Nilitarajia haraka", "Nahitaji dokezo"],
            "chama_circle": ["Akiba husaidia", "Akiba haiwezi kopeshwa", "Nahitaji dokezo"],
            "mtoni": ["Maji hayakutosha", "Mgao ulibadili matokeo", "Nahitaji dokezo"],
        }.get(str(scenario.get("scenario_id")), ["Sababu 1", "Sababu 2", "Nahitaji dokezo"])
        choices = [f"{index} {label}" for index, label in enumerate(labels, 1)]
    else:
        labels = scenario.get("reflection_choices", {})
        choices = [f"{code} {str(item.get('label', 'Why?'))[:24]}" for code, item in labels.items()]
    prompt = "Sababu:" if language == "sw" else "Why?"
    menu = "0 Menyu" if language == "sw" else "0 Menu"
    return f"{prompt} {'; '.join(choices)}; {menu}."[:156]


def _hint_text(scenario: dict[str, Any], language: str, level: int) -> str:
    ladders = scenario.get("hint_ladder", {})
    hints = ladders.get(language) or ladders.get("en") or []
    if not hints:
        return "Compare the last confirmed event with the saved values."
    return str(hints[min(max(level, 1), len(hints)) - 1])


def _record_reflection(
    gateway: SimulationGateway, session_id: UUID, student_id: UUID, turn: int, answer: str
) -> None:
    recorder = getattr(gateway, "record_reflection", None)
    if recorder:
        recorder(session_id, student_id, turn, answer)


def _apply_choice(
    *,
    store: Any,
    gateway: SimulationGateway,
    student_id: UUID,
    session_id: UUID,
    state: dict[str, Any],
    choice: str,
    request_key: str,
    provider: str,
    language: str = "en",
) -> tuple[dict[str, Any], str, bool]:
    scenario = _scenario(store, session_id)
    rows = _choice_rows(scenario, "en")
    if not choice.isdigit() or not 1 <= int(choice) <= len(rows):
        invalid = (
            "Chaguo si sahihi. Tuma namba au MENYU."
            if language == "sw"
            else "Invalid choice. Reply with a listed number or MENU."
        )
        return state, invalid, False
    action_type, parameters, _label = rows[int(choice) - 1]
    action = Action(
        action_type=action_type,
        parameters=parameters,
        expected_turn=int(state.get("current_turn", 0)),
    )
    result = gateway.submit_decision(
        session_id, student_id, action, f"mobile:{provider}:{request_key}"
    )
    next_state = _state(result.state)
    scenario = _scenario(store, session_id)
    if result.turn >= int(scenario.get("number_of_turns", 6)):
        complete = "Mchezo umekamilika" if language == "sw" else "Game complete"
        replay = "Tuma CHEZA n kucheza tena." if language == "sw" else "Reply PLAY n to replay."
        return (
            next_state,
            f"{complete}. {_state_summary(scenario, next_state, language)}. {replay}"[:160],
            True,
        )
    if scenario.get("reflection_choices"):
        turn_label = "Uamuzi umehifadhiwa" if language == "sw" else "Turn saved"
        why = "Jibu KWA NINI 1, 2 au 3." if language == "sw" else "Reply WHY 1, WHY 2 or WHY 3."
        suffix = f" {why}" if provider == "sms" else ""
        return (
            next_state,
            f"{turn_label} {result.turn}. "
            f"{_state_summary(scenario, next_state, language)}.{suffix}"[:160],
            False,
        )
    turn_label = "Uamuzi umehifadhiwa" if language == "sw" else "Turn saved"
    return (
        next_state,
        f"{turn_label} {result.turn}. "
        f"{_state_summary(scenario, next_state, language)}. Reply MENU."[:160],
        False,
    )


def _state_summary(scenario: dict[str, Any], state: dict[str, Any], language: str = "en") -> str:
    if language == "sw":
        if scenario.get("scenario_id") == "soko_market":
            return f"Pesa: {state.get('cash_credits', 0)}; mauzo: {state.get('total_sold', 0)}"
        if scenario.get("scenario_id") == "mtoni_fever":
            return (
                f"Bajeti: {state.get('budget_tokens', 0)}; maji: "
                f"{state.get('safe_water_points', 0)}"
            )
        if scenario.get("scenario_id") == "chama_circle":
            return f"Mfuko: {state.get('pool_tokens', 0)}; akiba: {state.get('reserve_tokens', 0)}"
        return (
            f"Maji: {state.get('reservoir_level', 0)}; bajeti: {state.get('budget_remaining', 0)}"
        )
    if scenario.get("scenario_id") == "soko_market":
        return f"Cash: {state.get('cash_credits', 0)}; sold: {state.get('total_sold', 0)}"
    if scenario.get("scenario_id") == "mtoni_fever":
        return (
            f"Budget: {state.get('budget_tokens', 0)}; water: {state.get('safe_water_points', 0)}"
        )
    if scenario.get("scenario_id") == "chama_circle":
        return f"Pool: {state.get('pool_tokens', 0)}; reserve: {state.get('reserve_tokens', 0)}"
    return f"Water: {state.get('reservoir_level', 0)}; budget: {state.get('budget_remaining', 0)}"


def process_mobile_sms(
    *,
    phone_number: str,
    message: str,
    provider_message_id: str | None,
    received_at: str | None,
    link_id: str | None,
    store: Any,
    gateway: SimulationGateway,
) -> str:
    """Route one SMS command with explicit opt-in and one-segment static text."""
    ref = _phone_ref(phone_number)
    mobile_id = f"sms:{ref}"
    mobile = store.get_mobile(mobile_id)
    link_getter = getattr(store, "get_channel_link", None)
    channel_link = link_getter(ref) if link_getter else None
    language = str(
        (mobile.state if mobile and isinstance(mobile.state, dict) else {}).get(
            "language", getattr(channel_link, "preferred_language", "en")
        )
    )
    command = " ".join(message.strip().upper().split())
    source = provider_message_id or f"{received_at or ''}\0{link_id or ''}\0{command}"
    request_key = callback_request_key(mobile_id, source)
    if mobile is not None and isinstance(mobile.state, dict):
        duplicate = next(
            (
                item.get("response")
                for item in reversed(mobile.state.get("recent_requests", []))
                if isinstance(item, dict) and item.get("key") == request_key
            ),
            None,
        )
        if isinstance(duplicate, str):
            return duplicate
    if command in {"STOP", "ACHA"}:
        setter = getattr(store, "set_sms_consent", None)
        if setter:
            setter(ref, phone_number, opted_in=False)
        if language == "sw":
            return "Vikumbusho vimesimamishwa. Tuma ANZA UJUMBE kuvianzisha. Michezo bado ipo."
        return "Nudges stopped. Reply OPT IN to restart. Games remain available."
    if command == "START":
        return (
            "Tuma ANZA UJUMBE kuruhusu vikumbusho."
            if language == "sw"
            else "Text OPT IN to enable reminders."
        )
    if command.startswith(("JOIN ", "JIUNGE ")):
        # A learner may paste JOIN and follow-up commands into one multiline SMS.
        # Redeem only the one-time code token; later commands are not run here.
        parts = command.split(maxsplit=2)
        code = parts[1]
        redeem = getattr(store, "redeem_join_code", None)
        student = redeem(code, ref) if redeem else None
        if student is None:
            return "Code invalid or expired. Ask your teacher for a new learner code."
        if command.startswith("JIUNGE "):
            language = "sw"
            setter = getattr(store, "set_preferred_language", None)
            if setter:
                setter(ref, language)
        return (
            "Namba imeunganishwa.\nTuma MICHEZO kuchagua.\nKisha tuma CHEZA n.\n"
            "ANZA UJUMBE: vikumbusho."
            if language == "sw"
            else "Phone linked.\nNext: send GAMES.\nThen: send PLAY n.\nOPT IN enables reminders."
        )
    student_id = _student(store, phone_number, ref)
    if student_id is None:
        return "Text JOIN followed by your one-time learner code. Reply HELP for commands."
    if command in {"OPT IN", "ANZA UJUMBE"}:
        setter = getattr(store, "set_sms_consent", None)
        if not setter or not setter(ref, phone_number, opted_in=True):
            return "Link your learner code first. No reminder consent was saved."
        return (
            "Vikumbusho vimewashwa. Hadi 4 kwa mwezi, 09:00-20:00 EAT. Tuma ACHA wakati wowote."
            if language == "sw"
            else "Reminders on. Max 4 per month, 09:00-20:00 EAT. Reply STOP anytime."
        )

    if command in {"LANG EN", "LANGUAGE EN", "LUGHA EN"}:
        language = "en"
    elif command in {"LANG SW", "LANGUAGE SW", "LUGHA SW"}:
        language = "sw"
    if command.startswith(("LANG ", "LANGUAGE ", "LUGHA ")):
        setter = getattr(store, "set_preferred_language", None)
        if setter:
            setter(ref, language)
        response = "Lugha: Kiswahili." if language == "sw" else "Language: English."
        if mobile is not None and isinstance(mobile.state, dict):
            _save(
                store,
                provider_id=mobile_id,
                ref=ref,
                session_id=mobile.session_id,
                state=_remember({**mobile.state, "language": language}, request_key, response),
                request_key=request_key,
                now=datetime.now(UTC),
                ttl=MOBILE_TTL,
            )
        return response

    if command in {"MICHEZO", "CHEZA", "ENDELEA", "MAENDELEO", "MSAADA"}:
        language = "sw"
        setter = getattr(store, "set_preferred_language", None)
        if setter:
            setter(ref, language)
        if mobile is not None and isinstance(mobile.state, dict):
            _save(
                store,
                provider_id=mobile_id,
                ref=ref,
                session_id=mobile.session_id,
                state={**mobile.state, "language": language},
                request_key=request_key,
                now=datetime.now(UTC),
                ttl=MOBILE_TTL,
            )
            mobile = store.get_mobile(mobile_id)
    if mobile is not None and isinstance(mobile.state, dict) and mobile.state.get("mobile_v2"):
        language = str(mobile.state.get("language", language))
    games = _games(store, student_id)
    phase, options, reflection_codes = _sms_intent_context(
        mobile=mobile, store=store, student_id=student_id
    )
    compact_reflection = {f"WHY{number}": f"WHY {number}" for number in ("1", "2", "3")}
    compact_reflection.update({f"WHY-{number}": f"WHY {number}" for number in ("1", "2", "3")})
    compact_reflection.update(
        {f"KWA NINI{number}": f"KWA NINI {number}" for number in ("1", "2", "3")}
    )
    command = compact_reflection.get(command, command)
    if phase == "lobby" and command.isdigit():
        # In a game list, replying with its number is the natural SMS equivalent of PLAY n.
        command = f"PLAY {command}"
    elif phase == "reflection" and command.isdigit():
        command = f"WHY {command}"
    elif phase == "reflection" and command in {"HINT", "DOKEZO"}:
        command = "WHY 3"
    if phase == "lobby" and not _is_direct_sms_command(command):
        game_index = _exact_game_index(command, games)
        if game_index is not None:
            command = f"PLAY {game_index}"
        else:
            decision = interpret_sms_intent(
                message=message,
                phase=phase,
                games=[str(getattr(game, "title", "Game")) for game in games],
                options=[],
                language=language,
                game_information=_sms_game_information(games),
                playing_guide=_SMS_PLAYING_GUIDE,
                current_game=(
                    _mission_title(store, mobile.session_id)
                    if mobile is not None and mobile.session_id
                    else None
                ),
            )
            if decision is None or decision.intent == "unknown":
                response = _sms_intent_fallback(phase, language, greeting=_is_sms_greeting(command))
                _save_sms_conversation_reply(
                    store=store,
                    provider_id=mobile_id,
                    phone_ref=ref,
                    mobile=mobile,
                    language=language,
                    request_key=request_key,
                    response=response,
                )
                return response
            if decision.intent == "reply":
                response = decision.reply_text or _sms_intent_fallback(phase, language)
                _save_sms_conversation_reply(
                    store=store,
                    provider_id=mobile_id,
                    phone_ref=ref,
                    mobile=mobile,
                    language=language,
                    request_key=request_key,
                    response=response,
                )
                return response
            command = {
                "start_game": f"PLAY {decision.selection_index}",
                "continue_game": "CONTINUE",
            }.get(decision.intent, command)
    elif phase != "lobby" and not _is_direct_sms_command(command):
        scenario = _scenario(store, mobile.session_id) if mobile.session_id else {}
        decision = interpret_sms_intent(
            message=message,
            phase=phase,
            games=[str(getattr(game, "title", "Game")) for game in games],
            options=options,
            language=language,
            game_information=_sms_game_information(games),
            playing_guide=_SMS_PLAYING_GUIDE,
            current_game=(
                _mission_title(store, mobile.session_id)
                if mobile is not None and mobile.session_id
                else None
            ),
        )
        if decision is None or decision.intent == "unknown":
            response = _sms_intent_fallback(phase, language, greeting=_is_sms_greeting(command))
            _save_sms_conversation_reply(
                store=store,
                provider_id=mobile_id,
                phone_ref=ref,
                mobile=mobile,
                language=language,
                request_key=request_key,
                response=response,
            )
            return response
        if decision.intent == "reply":
            response = decision.reply_text or _sms_intent_fallback(phase, language)
            _save_sms_conversation_reply(
                store=store,
                provider_id=mobile_id,
                phone_ref=ref,
                mobile=mobile,
                language=language,
                request_key=request_key,
                response=response,
            )
            return response
        if decision.intent == "choose_action":
            command = str(decision.selection_index)
        elif decision.intent == "answer_reflection":
            command = f"WHY {reflection_codes[decision.selection_index - 1]}"
        elif decision.intent == "hint" and phase == "turn":
            hint_level = 1
            response = (
                f"Dokezo {hint_level}: {_hint_text(scenario, language, hint_level)} Tuma ENDELEA."
                if language == "sw"
                else (
                    f"Hint {hint_level}: {_hint_text(scenario, language, hint_level)} "
                    "Reply CONTINUE."
                )
            )
            _save(
                store,
                provider_id=mobile_id,
                ref=ref,
                session_id=mobile.session_id,
                state=_remember(
                    {**mobile.state, "screen": "hint", "hint_level": hint_level},
                    request_key,
                    response,
                ),
                request_key=request_key,
                now=datetime.now(UTC),
                ttl=MOBILE_TTL,
            )
            return response[:160]
        elif decision.intent == "hint" and phase == "reflection":
            command = "WHY 3"
        else:
            command = {
                "start_game": f"PLAY {decision.selection_index}",
                "continue_game": "CONTINUE",
                "hint": "HINT",
            }.get(decision.intent, command)
    if command in {"GAMES", "MICHEZO", "PLAY", "START"}:
        return _games_message(games, language)
    if command.startswith(("PLAY ", "CHEZA ")):
        pieces = command.split()
        if len(pieces) != 2 or not pieces[1].isdigit() or not 1 <= int(pieces[1]) <= len(games):
            return _games_message(games, language, "Use PLAY number. ")
        mission = games[int(pieces[1]) - 1]
        outcome = _active_session(
            store, gateway, student_id, mission.id, idempotency_key=f"sms-play:{request_key}"
        )
        if outcome is None:
            return "Could not start this game. Try again or text HELP."
        session_id, state, run_status = outcome
        scenario = _scenario(store, session_id)
        title = str(getattr(mission, "title", scenario.get("title", "MtaaLab")))
        body = (
            _turn_menu(title, scenario, state, language)
            if run_status == "active"
            else "Game complete. Reply PLAY n to replay."
        )
        _save(
            store,
            provider_id=mobile_id,
            ref=ref,
            session_id=session_id,
            state={"mobile_v2": True, "screen": "turn", "language": language},
            request_key=request_key,
            now=datetime.now(UTC),
            ttl=MOBILE_TTL,
        )
        return body[:160]
    if command in {"CONTINUE", "ENDELEA", "STATUS", "MAENDELEO"}:
        if mobile is not None and isinstance(mobile.state, dict):
            screen = mobile.state.get("screen")
            if screen == "reflection":
                return (
                    "Jibu WHY 1, WHY 2 au WHY 3 kabla ya zamu inayofuata."
                    if language == "sw"
                    else "Reply WHY 1, WHY 2 or WHY 3 before the next turn."
                )
        active = _active_for_mobile(store, gateway, student_id, mobile)
        if active is None:
            return _games_message(games, language, "No active game. ")
        session_id, state, run_status = active
        scenario = _scenario(store, session_id)
        title = _mission_title(store, session_id)
        if run_status == "completed":
            return f"{title} complete at turn {state.get('current_turn', 0)}. Reply GAMES."
        _save(
            store,
            provider_id=mobile_id,
            ref=ref,
            session_id=session_id,
            state={"mobile_v2": True, "screen": "turn", "language": language},
            request_key=request_key,
            now=datetime.now(UTC),
            ttl=MOBILE_TTL,
        )
        return _turn_menu(title, scenario, state, language)

    if mobile is None or not isinstance(mobile.state, dict) or not mobile.state.get("mobile_v2"):
        return "Text GAMES to choose, PLAY 1 to start, or CONTINUE to resume."
    if mobile.session_id is None:
        return _games_message(games, language)
    session = store.get_simulation_session(mobile.session_id)
    if session is None or session.student_id != student_id:
        return "Saved game unavailable. Text GAMES to start another."
    confirmed = getattr(session, "current_state", None) or getattr(session, "state", {})
    state = _state(confirmed)
    scenario = _scenario(store, mobile.session_id)
    if command in {"MENU", "GAMES"}:
        return _games_message(games, language)
    if mobile.state.get("screen") == "turn" and command in {"HINT", "DOKEZO"}:
        response = (
            f"Dokezo 1: {_hint_text(scenario, language, 1)} Tuma ENDELEA."
            if language == "sw"
            else f"Hint 1: {_hint_text(scenario, language, 1)} Reply CONTINUE."
        )
        _save(
            store,
            provider_id=mobile_id,
            ref=ref,
            session_id=mobile.session_id,
            state=_remember(
                {**mobile.state, "screen": "hint", "hint_level": 1}, request_key, response
            ),
            request_key=request_key,
            now=datetime.now(UTC),
            ttl=MOBILE_TTL,
        )
        return response[:160]
    if mobile.state.get("screen") == "reflection":
        answer = command.removeprefix("WHY ").removeprefix("KWA NINI ").strip()
        if answer not in scenario.get("reflection_choices", {}):
            return "Reply WHY 1, WHY 2 or WHY 3 to explain the last turn."
        _record_reflection(
            gateway, mobile.session_id, student_id, int(state.get("current_turn", 0)), answer
        )
        if answer == "3":
            response = (
                f"Dokezo 1: {_hint_text(scenario, language, 1)} Tuma DOKEZO au ENDELEA."
                if language == "sw"
                else f"Hint 1: {_hint_text(scenario, language, 1)} Reply HINT or CONTINUE."
            )
            _save(
                store,
                provider_id=mobile_id,
                ref=ref,
                session_id=mobile.session_id,
                state=_remember(
                    {**mobile.state, "screen": "hint", "hint_level": 1}, request_key, response
                ),
                request_key=request_key,
                now=datetime.now(UTC),
                ttl=MOBILE_TTL,
            )
            return response[:160]
        response = _turn_menu(_mission_title(store, mobile.session_id), scenario, state, language)
        _save(
            store,
            provider_id=mobile_id,
            ref=ref,
            session_id=mobile.session_id,
            state=_remember({**mobile.state, "screen": "turn"}, request_key, response),
            request_key=request_key,
            now=datetime.now(UTC),
            ttl=MOBILE_TTL,
        )
        return response
    if mobile.state.get("screen") == "hint":
        if command in {"HINT", "DOKEZO"}:
            level = min(3, int(mobile.state.get("hint_level", 1)) + 1)
            response = (
                f"Dokezo {level}: {_hint_text(scenario, language, level)} Tuma ENDELEA."
                if language == "sw"
                else f"Hint {level}: {_hint_text(scenario, language, level)} Reply CONTINUE."
            )
            _save(
                store,
                provider_id=mobile_id,
                ref=ref,
                session_id=mobile.session_id,
                state=_remember({**mobile.state, "hint_level": level}, request_key, response),
                request_key=request_key,
                now=datetime.now(UTC),
                ttl=MOBILE_TTL,
            )
            return response[:160]
        return (
            "Tuma DOKEZO kwa kidokezo kingine au ENDELEA."
            if language == "sw"
            else "Reply HINT for another clue or CONTINUE to play."
        )
    try:
        next_state, response, completed = _apply_choice(
            store=store,
            gateway=gateway,
            student_id=student_id,
            session_id=mobile.session_id,
            state=state,
            choice=command,
            request_key=request_key,
            provider="sms",
            language=language,
        )
    except (ValueError, LookupError, RuntimeError):
        return "Choice unavailable. Text CONTINUE to load the saved game."
    next_screen = (
        "completed"
        if completed
        else ("reflection" if scenario.get("reflection_choices") else "turn")
    )
    response = response[:160]
    _save(
        store,
        provider_id=mobile_id,
        ref=ref,
        session_id=mobile.session_id,
        state=_remember({**mobile.state, "screen": next_screen}, request_key, response),
        request_key=request_key,
        now=datetime.now(UTC),
        ttl=MOBILE_TTL,
    )
    return response


def process_mobile_ussd(
    callback: USSDCallbackRequest,
    *,
    store: Any,
    gateway: SimulationGateway,
    force_start: bool = False,
    background_tasks: Any | None = None,
) -> str:
    """Bounded USSD state machine for language, join code, discovery, play and resume."""
    mobile = store.get_mobile(callback.session_id)
    candidate_refs = {_phone_ref(callback.phone_number), phone_reference(callback.phone_number)}
    if mobile is not None and mobile.phone_ref not in candidate_refs:
        return "END Session unavailable."
    ref = mobile.phone_ref if mobile is not None else _phone_ref(callback.phone_number)
    text = callback.text
    segments = split_cumulative_text(text)
    choice = segments[-1] if segments else ""
    request_key = callback_request_key(callback.session_id, text)
    now = datetime.now(UTC)
    if mobile is not None and isinstance(mobile.state, dict):
        for recent in mobile.state.get("recent_requests", []):
            if isinstance(recent, dict) and recent.get("key") == request_key:
                return str(recent.get("response", "END Please try again."))
    state_data = dict(mobile.state) if mobile and isinstance(mobile.state, dict) else {}
    student_id = _student(store, callback.phone_number, ref)
    if force_start:
        language = str(state_data.get("language", "en"))
        state_data = {"mobile_v2": True, "screen": "games", "language": language}
        response = (
            _games_ussd(_games(store, student_id), language)
            if student_id
            else "CON Link your learner code first."
        )
        _persist_ussd(
            store,
            callback,
            ref,
            mobile.session_id if mobile else None,
            state_data,
            response,
            request_key,
            now,
        )
        return response
    expired = mobile is not None and mobile.expires_at <= now
    if expired and student_id is not None:
        language = str(state_data.get("language", "en"))
        state_data = {"mobile_v2": True, "screen": "games", "language": language}
        response = _games_ussd(_games(store, student_id), language)
        _persist_ussd(store, callback, ref, None, state_data, response, request_key, now)
        return response
    elif not student_id:
        screen = state_data.get("screen", "language")
        if screen == "language":
            if not segments:
                response = "CON MtaaLab\n1 English\n2 Kiswahili"
            elif choice in {"1", "2"}:
                lang = "en" if choice == "1" else "sw"
                state_data = {"mobile_v2": True, "screen": "join", "language": lang}
                response = (
                    "CON Enter your one-time learner code"
                    if lang == "en"
                    else "CON Weka msimbo wa mwanafunzi"
                )
            else:
                response = "CON Choose language\n1 English\n2 Kiswahili"
        else:
            code = choice.strip().upper()
            redeem = getattr(store, "redeem_join_code", None)
            student_id = redeem(code, ref) if redeem and code else None
            if student_id is None:
                response = "CON Code invalid. Enter learner code or 0 to restart."
                if choice == "0":
                    state_data = {"mobile_v2": True, "screen": "language", "language": "en"}
            else:
                setter = getattr(store, "set_preferred_language", None)
                if setter:
                    setter(ref, str(state_data.get("language", "en")))
                state_data = {
                    "mobile_v2": True,
                    "screen": "games",
                    "language": state_data.get("language", "en"),
                }
                response = _games_ussd(_games(store, student_id), state_data["language"])
        _persist_ussd(store, callback, ref, None, state_data, response, request_key, now)
        return response

    if not state_data.get("mobile_v2"):
        link_getter = getattr(store, "get_channel_link", None)
        link = link_getter(ref) if link_getter else None
        language = str(getattr(link, "preferred_language", "en"))
        state_data = {"mobile_v2": True, "screen": "games", "language": language}
        response = _games_ussd(_games(store, student_id), language)
        _persist_ussd(
            store,
            callback,
            ref,
            None,
            state_data,
            response,
            request_key,
            now,
        )
        return response

    link_getter = getattr(store, "get_channel_link", None)
    channel_link = link_getter(ref) if link_getter else None
    language = str(state_data.get("language", getattr(channel_link, "preferred_language", "en")))
    screen = str(state_data.get("screen", "main"))
    session_id = mobile.session_id if mobile is not None else None
    response = ""
    if screen == "main":
        if not segments or choice == "00":
            response = _main_menu(language)
        elif choice == "1":
            active = _active_for_mobile(store, gateway, student_id, mobile)
            if active is None:
                state_data["screen"] = "games"
                response = _games_ussd(_games(store, student_id), language)
            else:
                session_id, current, status = active
                if status == "completed":
                    state_data["screen"] = "completed"
                    response = (
                        "CON Last game is complete.\n1 Choose a game\n0 Menu"
                        if language == "en"
                        else "CON Mchezo umekamilika.\n1 Chagua mchezo\n0 Menyu"
                    )
                else:
                    scenario = _scenario(store, session_id)
                    response = "CON " + _turn_menu(
                        _mission_title(store, session_id), scenario, current, language
                    )
                    state_data["screen"] = "turn"
        elif choice == "2":
            state_data["screen"] = "games"
            response = _games_ussd(_games(store, student_id), language)
        elif choice == "3":
            active = _active_for_mobile(store, gateway, student_id, mobile)
            response = _progress(active, store, language)
        elif choice == "4":
            response = (
                "CON GAMES/PLAY n; CONTINUE; WHY 1-3; STOP turns off reminders."
                if language == "en"
                else "CON MICHEZO/CHEZA n; ENDELEA; WHY 1-3; ACHA ujumbe."
            )
        elif choice == "0":
            response = (
                "END MtaaLab. Your saved turns remain."
                if language == "en"
                else "END MtaaLab. Maamuzi yako yamehifadhiwa."
            )
        else:
            response = _main_menu(language)
    elif screen.startswith("games"):
        games = _games(store, student_id)
        if choice in {"0", "00"}:
            state_data["screen"] = "main"
            response = _main_menu(language)
        elif not choice.isdigit() or not 1 <= int(choice) <= len(games):
            response = _games_ussd(games, language)
        else:
            mission = games[int(choice) - 1]
            outcome = _active_session(
                store,
                gateway,
                student_id,
                mission.id,
                idempotency_key=f"ussd-play:{callback.session_id}:{request_key}",
            )
            if outcome is None:
                response = "CON Could not start. 0 Menu"
            else:
                session_id, current, run_status = outcome
                scenario = _scenario(store, session_id)
                state_data["screen"] = "turn"
                response = "CON " + _turn_menu(str(mission.title), scenario, current, language)
    elif screen == "turn":
        if session_id is None:
            active = _active_for_mobile(store, gateway, student_id, mobile)
            session_id = active[0] if active else None
        if session_id is None:
            state_data["screen"] = "games"
            response = _games_ussd(_games(store, student_id), language)
        elif choice in {"0", "00"}:
            state_data["screen"] = "main"
            response = _main_menu(language)
        else:
            session = store.get_simulation_session(session_id)
            current = _state(
                getattr(session, "current_state", None) or getattr(session, "state", {})
            )
            try:
                updated, result_text, completed = _apply_choice(
                    store=store,
                    gateway=gateway,
                    student_id=student_id,
                    session_id=session_id,
                    state=current,
                    choice=choice,
                    request_key=request_key,
                    provider="ussd",
                    language=language,
                )
            except (ValueError, LookupError, RuntimeError):
                updated, result_text, completed = current, "Choice unavailable. Try again.", False
            scenario = _scenario(store, session_id)
            if completed:
                response = "END " + result_text[:154]
                state_data["screen"] = "completed"
                if background_tasks is not None:
                    title = _mission_title(store, session_id)
                    summary = f"MtaaLab: {title} complete. Your decisions are saved."
                    background_tasks.add_task(
                        send_sms,
                        callback.phone_number,
                        summary[:160],
                        session_id=session_id,
                        recipient_ref=ref,
                    )
            elif scenario.get("reflection_choices"):
                state_data["screen"] = "reflection"
                state_data["reflection_turn"] = int(updated.get("current_turn", 0))
                response = "CON " + result_text[:55] + "\n" + _reflect_prompt(scenario, language)
            else:
                response = "CON " + result_text[:154]
    elif screen == "reflection":
        if choice in {"0", "00"}:
            state_data["screen"] = "main"
            response = _main_menu(language)
        elif choice not in {"1", "2", "3"} or session_id is None:
            scenario = _scenario(store, session_id) if session_id else load_scenario()
            response = "CON " + _reflect_prompt(scenario, language)
        else:
            _record_reflection(
                gateway, session_id, student_id, int(state_data.get("reflection_turn", 0)), choice
            )
            scenario = _scenario(store, session_id)
            if choice == "3":
                state_data["screen"] = "hint"
                state_data["hint_level"] = 1
                response = (f"CON Hint 1: {_hint_text(scenario, language, 1)}\n1 Continue\n2 More")[
                    :160
                ]
            else:
                state_data["screen"] = "turn"
                session = store.get_simulation_session(session_id)
                current = _state(
                    getattr(session, "current_state", None) or getattr(session, "state", {})
                )
                response = "CON " + _turn_menu(
                    _mission_title(store, session_id), scenario, current, language
                )
    elif screen == "hint":
        level = int(state_data.get("hint_level", 1))
        if choice == "1":
            state_data["screen"] = "turn"
            session = store.get_simulation_session(session_id) if session_id else None
            current = _state(
                getattr(session, "current_state", None) or getattr(session, "state", {})
            )
            scenario = _scenario(store, session_id) if session_id else load_scenario()
            title = _mission_title(store, session_id) if session_id else "Mtoni"
            response = "CON " + _turn_menu(title, scenario, current, language)
        elif choice == "2" and level < 3:
            level += 1
            state_data["hint_level"] = level
            scenario = _scenario(store, session_id) if session_id else load_scenario()
            response = f"CON Hint {level}: {_hint_text(scenario, language, level)}\n1 Continue"
            if level < 3:
                response += "\n2 More"
        elif choice in {"0", "00"}:
            state_data["screen"] = "main"
            response = _main_menu(language)
        else:
            scenario = _scenario(store, session_id) if session_id else load_scenario()
            response = f"CON Hint {level}: {_hint_text(scenario, language, level)}\n1 Continue"
            if level < 3:
                response += "\n2 More"
    elif screen == "completed":
        if choice == "1":
            state_data["screen"] = "games"
            response = _games_ussd(_games(store, student_id), language)
        else:
            state_data["screen"] = "main"
            response = _main_menu(language)
    else:
        state_data["screen"] = "main"
        response = _main_menu(language)
    _persist_ussd(store, callback, ref, session_id, state_data, response, request_key, now)
    return response[:160]


def _main_menu(language: str) -> str:
    if language == "sw":
        return "CON MtaaLab\n1 Endelea\n2 Michezo\n3 Maendeleo\n4 Msaada\n0 Toka"
    return "CON MtaaLab\n1 Continue\n2 Games\n3 Progress\n4 Help\n0 Exit"


def _games_ussd(games: list[Any], language: str) -> str:
    labels = []
    for index, game in enumerate(games[:5], 1):
        name = str(getattr(game, "title", "Game"))
        lowered = name.casefold()
        if language == "sw" and "mama mboga" in lowered:
            short = "Soko la Mboga"
        elif language == "sw" and "chama" in lowered:
            short = "Chama Trust"
        elif language == "sw" and "fever" in lowered:
            short = "Mtoni Homa"
        elif language == "sw" and "mtoni" in lowered:
            short = "Mtoni Maji"
        else:
            short = name[:32]
        labels.append(f"{index} {short}")
    title = "Chagua mchezo" if language == "sw" else "Choose game"
    back = "Rudi" if language == "sw" else "Back"
    return ("CON " + title + "\n" + "\n".join(labels) + f"\n0 {back}")[:160]


def _progress(active: tuple[UUID, dict[str, Any], str] | None, store: Any, language: str) -> str:
    if active is None:
        return (
            "CON No active game.\n1 Choose game\n0 Menu"
            if language == "en"
            else "CON Hakuna mchezo unaoendelea.\n1 Chagua\n0 Menyu"
        )
    session_id, state, status = active
    title = _mission_title(store, session_id)[:20]
    turn = state.get("current_turn", 0)
    text = (
        f"{title} zamu {turn}. {status}.\n1 Endelea\n0 Menyu"
        if language == "sw"
        else f"{title} {turn}. {status}.\n1 Continue\n0 Menu"
    )
    return ("CON " + text)[:160]


def _persist_ussd(
    store: Any,
    callback: USSDCallbackRequest,
    ref: str,
    session_id: UUID | None,
    state: dict[str, Any],
    response: str,
    request_key: str,
    now: datetime,
) -> None:
    recent = list(state.get("recent_requests", []))
    state["recent_requests"] = [*recent, {"key": request_key, "response": response}][-8:]
    state["last_response"] = response
    _save(
        store,
        provider_id=callback.session_id,
        ref=ref,
        session_id=session_id,
        state=state,
        request_key=request_key,
        now=now,
        ttl=USSD_TTL,
    )
