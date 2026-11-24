"""Feature-phone linking and shared SMS/USSD gameplay coverage."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.api.schemas import USSDCallbackRequest
from app.integrations.africas_talking.menu_state import phone_reference
from app.integrations.africas_talking.mobile_gameplay import (
    _turn_menu,
    process_mobile_sms,
    process_mobile_ussd,
)
from app.integrations.africas_talking.mobile_privacy import phone_hmac_reference
from app.simulation import portfolio_engine
from app.simulation.engine import calculate_next_state
from app.simulation.service import load_scenario
from app.simulation.world_state import Action

PHONE = "+254700000111"
HMAC_KEY = "unit-test-phone-hmac-key-at-least-32-chars"


class FakeMobileStore:
    def __init__(self) -> None:
        self.student_id = uuid4()
        self.mission = SimpleNamespace(id=uuid4(), title="Mtoni water resilience")
        self.scenario = load_scenario()
        self.missions = [
            self.mission,
            SimpleNamespace(id=uuid4(), title="Mama Mboga Market"),
            SimpleNamespace(id=uuid4(), title="Mtoni Fever Response"),
            SimpleNamespace(id=uuid4(), title="Chama Trust Circle"),
        ]
        self.scenarios = {
            self.missions[0].id: self.scenario,
            self.missions[1].id: portfolio_engine.load_scenario("soko-market-v1"),
            self.missions[2].id: portfolio_engine.load_scenario("mtoni-fever-v1"),
            self.missions[3].id: portfolio_engine.load_scenario("chama-circle-v1"),
        }
        self.link = None
        self.mobile: dict[str, SimpleNamespace] = {}
        self.sessions: dict[UUID, SimpleNamespace] = {}
        self.reflections: list[tuple[UUID, UUID, int, str]] = []
        self.join_code = "ABCDEF2345"
        self.consent: list[bool] = []

    def get_linked_student_id(self, phone_ref: str) -> UUID | None:
        if self.link is not None and phone_ref == phone_hmac_reference(PHONE):
            return self.student_id
        return None

    def get_demo_student_id(self, phone_ref: str) -> UUID | None:
        return self.student_id if phone_ref == phone_reference(PHONE) else None

    def get_channel_link(self, _phone_ref: str) -> SimpleNamespace | None:
        return self.link

    def redeem_join_code(self, code: str, _phone_ref: str) -> UUID | None:
        if code.upper() != self.join_code:
            return None
        self.link = SimpleNamespace(preferred_language="en", student_id=self.student_id)
        return self.student_id

    def set_preferred_language(self, _phone_ref: str, language: str) -> None:
        if self.link is not None:
            self.link.preferred_language = language

    def set_sms_consent(self, _phone_ref: str, _phone: str, *, opted_in: bool) -> bool:
        self.consent.append(opted_in)
        return self.link is not None

    def get_published_missions(self, _student_id: UUID) -> list[SimpleNamespace]:
        return list(self.missions)

    def get_scenario_for_session(self, session_id: UUID) -> dict[str, object]:
        return self.scenarios[self.sessions[session_id].mission_id]

    def get_mobile(self, provider_session_id: str) -> SimpleNamespace | None:
        return self.mobile.get(provider_session_id)

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID | None,
        current_menu: str,
        state: dict[str, object],
        expires_at: object,
        last_request_key: str,
        replace_session_id: bool = False,
    ) -> None:
        previous = self.mobile.get(provider_session_id)
        if previous is not None and not replace_session_id:
            assert previous.session_id == session_id
        self.mobile[provider_session_id] = SimpleNamespace(
            provider_session_id=provider_session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu=current_menu,
            state=state,
            expires_at=expires_at,
            last_request_key=last_request_key,
        )

    def get_simulation_session(self, session_id: UUID | None) -> SimpleNamespace | None:
        return self.sessions.get(session_id) if session_id else None

    def get_active_session_for_mission(
        self, student_id: UUID, mission_id: UUID
    ) -> SimpleNamespace | None:
        return next(
            (
                session
                for session in reversed(list(self.sessions.values()))
                if session.student_id == student_id
                and session.mission_id == mission_id
                and session.status == "active"
            ),
            None,
        )

    def get_active_session(self, student_id: UUID) -> SimpleNamespace | None:
        return next(
            (
                session
                for session in reversed(list(self.sessions.values()))
                if session.student_id == student_id and session.status == "active"
            ),
            None,
        )


class FakeMobileGateway:
    def __init__(self, store: FakeMobileStore) -> None:
        self.store = store
        self.decision_keys: set[str] = set()

    def get_or_create_session(
        self, mission_id: UUID, student_id: UUID, idempotency_key: str
    ) -> dict[str, object]:
        existing = self.store.get_active_session_for_mission(student_id, mission_id)
        if existing is not None:
            return {
                "session_id": existing.id,
                "state": existing.current_state,
                "status": existing.status,
            }
        session_id = uuid4()
        session = SimpleNamespace(
            id=session_id,
            mission_id=mission_id,
            student_id=student_id,
            status="active",
            current_state=dict(self.store.scenarios[mission_id]["initial_state"]),
        )
        self.store.sessions[session_id] = session
        return {"session_id": session_id, "state": session.current_state, "status": "active"}

    def submit_decision(
        self, session_id: UUID, student_id: UUID, action: Action, idempotency_key: str
    ) -> SimpleNamespace:
        session = self.store.sessions[session_id]
        assert session.student_id == student_id
        if idempotency_key not in self.decision_keys:
            scenario = self.store.scenarios[session.mission_id]
            result = calculate_next_state(session.current_state, action, scenario)
            session.current_state = result["state"]
            if result["turn"] >= scenario["number_of_turns"]:
                session.status = "completed"
            self.decision_keys.add(idempotency_key)
        return SimpleNamespace(
            turn=session.current_state["current_turn"],
            state=SimpleNamespace(model_dump=lambda mode="json": dict(session.current_state)),
        )

    def record_reflection(
        self, session_id: UUID, student_id: UUID, turn_number: int, answer_code: str
    ) -> None:
        self.store.reflections.append((session_id, student_id, turn_number, answer_code))


def test_join_sms_play_reflection_and_shared_ussd_progress(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)

    def unexpected_ai_call(**_kwargs: object) -> None:
        raise AssertionError("exact SMS commands must bypass NVIDIA")

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        unexpected_ai_call,
    )
    store = FakeMobileStore()
    gateway = FakeMobileGateway(store)

    linked = process_mobile_sms(
        phone_number=PHONE,
        message="JOIN ABCDEF2345",
        provider_message_id="sms-join-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert "Phone linked" in linked
    games = process_mobile_sms(
        phone_number=PHONE,
        message="GAMES",
        provider_message_id="sms-games-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert games == (
        "Games: 1 Mtoni (water); 2 Soko (market); 3 Fever (prevention); "
        "4 Chama (savings). Text a title for how-to; PLAY n starts."
    )
    start = process_mobile_sms(
        phone_number=PHONE,
        message="PLAY 1",
        provider_message_id="sms-play-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert "Mtoni" in start
    assert "Choose: 1 Repair pipe; 2 Save water" in start
    assert len(start) <= 160
    decision = process_mobile_sms(
        phone_number=PHONE,
        message="1",
        provider_message_id="sms-turn-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert "WHY 1" in decision
    duplicate = process_mobile_sms(
        phone_number=PHONE,
        message="1",
        provider_message_id="sms-turn-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert duplicate == decision
    assert len(gateway.decision_keys) == 1

    observed: dict[str, object] = {}
    greeting_ai_calls = 0

    def interpret_greeting(**kwargs: object) -> SimpleNamespace:
        nonlocal greeting_ai_calls
        greeting_ai_calls += 1
        observed.update(kwargs)
        return SimpleNamespace(
            intent="reply",
            selection_index=None,
            reply_text=(
                "Hi! Mtoni is about community water. Soko runs a market, Fever plans clinic "
                "access, and Chama manages group savings. Which sounds fun?"
            ),
        )

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        interpret_greeting,
    )
    greeting = process_mobile_sms(
        phone_number=PHONE,
        message="hello",
        provider_message_id="sms-hello-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert greeting.startswith("Hi! Mtoni is about community water.")
    assert "Which sounds fun?" in greeting
    assert len(greeting) <= 160
    assert observed["phase"] == "reflection"
    assert len(observed["game_information"]) == 4
    assert observed["current_game"] == "Mtoni water resilience"
    assert len(gateway.decision_keys) == 1
    replayed_greeting = process_mobile_sms(
        phone_number=PHONE,
        message="hello",
        provider_message_id="sms-hello-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert replayed_greeting == greeting
    assert greeting_ai_calls == 1

    process_mobile_sms(
        phone_number=PHONE,
        message="why1",
        provider_message_id="sms-why-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert store.reflections == [(next(iter(store.sessions)), store.student_id, 1, "1")]

    callback = USSDCallbackRequest(
        sessionId="ussd-after-sms",
        serviceCode="*123#",
        phoneNumber=PHONE,
        text="",
        networkCode="639",
    )
    assert process_mobile_ussd(callback, store=store, gateway=gateway).startswith("CON")
    callback = callback.model_copy(update={"text": "1"})
    resumed = process_mobile_ussd(callback, store=store, gateway=gateway)
    assert resumed.startswith("CON Mtoni Water, turn 2/6.")


def test_sms_join_handles_multiline_text(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    gateway = FakeMobileGateway(store)

    response = process_mobile_sms(
        phone_number=PHONE,
        message="JOIN ABCDEF2345\nGAMES PLAY 1",
        provider_message_id="sms-join-multiline",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert "Phone linked" in response
    assert "Next: send GAMES" in response
    assert "Then: send PLAY n" in response
    assert store.link is not None
    assert store.sessions == {}


def test_sms_natural_language_selects_only_a_listed_game(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)
    observed: dict[str, object] = {}

    def interpret(**kwargs: object) -> SimpleNamespace:
        observed.update(kwargs)
        return SimpleNamespace(intent="start_game", selection_index=2)

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent", interpret
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message="I want to try the market game",
        provider_message_id="sms-natural-game-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert response.startswith("Soko, turn 1/6.")
    assert observed["phase"] == "lobby"
    assert observed["games"] == [game.title for game in store.missions]
    assert len(store.sessions) == 1
    assert next(iter(store.sessions.values())).mission_id == store.missions[1].id


def test_sms_uses_model_reply_for_free_form_game_questions(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)
    observed: dict[str, object] = {}

    def interpret(**kwargs: object) -> SimpleNamespace:
        observed.update(kwargs)
        return SimpleNamespace(
            intent="reply",
            selection_index=None,
            reply_text=(
                "Run a market stall for six days: choose each day's stock and price plan, then "
                "compare sales, cash, leftovers and spoilage. Text PLAY 2 to start."
            ),
        )

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent", interpret
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message="What is Soko about?",
        provider_message_id="sms-game-question-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert response.startswith("Run a market stall for six days")
    assert "stock and price plan" in response
    assert "Text PLAY 2 to start." in response
    assert len(response) <= 160
    assert any(item["title"] == "Mama Mboga Market" for item in observed["game_information"])
    assert any("Soko" in item["aliases"] for item in observed["game_information"])
    assert "Text a game title to learn what you do" in observed["playing_guide"]
    assert store.sessions == {}


def test_lobby_greeting_that_omits_the_games_gets_a_welcome_catalog(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)

    def shallow_greeting(**_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            intent="reply",
            selection_index=None,
            reply_text="Hello! Which game would you like to explore?",
        )

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        shallow_greeting,
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message="hello",
        provider_message_id="sms-lobby-hello",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert response.startswith("Hi!")
    assert "Mtoni: manage shared water" in response
    assert "Soko: run a market stall" in response
    assert "Fever: plan prevention" in response
    assert "Chama: manage savings" in response
    assert "PLAY n starts" in response
    assert len(response) <= 160
    assert store.sessions == {}


@pytest.mark.parametrize(
    ("message", "expected_parts"),
    [
        ("mtoni", ("community water", "repairs", "PLAY 1")),
        ("soko", ("market stall", "stock and price plan", "PLAY 2")),
        ("What is Soko about?", ("market stall", "stock and price plan", "PLAY 2")),
        ("fever", ("clinic readiness", "No illness is simulated", "PLAY 3")),
        ("chama", ("fictional savings group", "No real money", "PLAY 4")),
    ],
)
def test_game_explanation_gets_a_real_how_to_even_if_model_reply_is_shallow(
    monkeypatch, message: str, expected_parts: tuple[str, ...]
) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)

    def shallow_model_reply(**_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            intent="reply",
            selection_index=None,
            reply_text="That is a game. Type PLAY to start.",
        )

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        shallow_model_reply,
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message=message,
        provider_message_id=f"sms-howto-{message}",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    for part in expected_parts:
        assert part in response
    assert len(response) <= 160
    assert store.sessions == {}


def test_play_game_by_name_switches_from_an_active_turn(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)
    process_mobile_sms(
        phone_number=PHONE,
        message="PLAY 1",
        provider_message_id="sms-switch-start-mtoni",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    def unexpected_ai_call(**_kwargs: object) -> None:
        raise AssertionError("explicit PLAY <name> should be resolved before NVIDIA")

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        unexpected_ai_call,
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message="play fever",
        provider_message_id="sms-switch-to-fever",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert response.startswith("Fever, turn 1/6.")
    assert "Choose:" in response
    assert "didn't catch" not in response
    assert len(store.sessions) == 2
    assert any(session.mission_id == store.missions[2].id for session in store.sessions.values())


def test_sms_natural_language_maps_to_one_valid_game_choice(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)
    started = process_mobile_sms(
        phone_number=PHONE,
        message="PLAY 1",
        provider_message_id="sms-natural-action-start",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )
    assert started.startswith("Mtoni Water, turn 1/6.")
    observed: dict[str, object] = {}

    def interpret(**kwargs: object) -> SimpleNamespace:
        observed.update(kwargs)
        return SimpleNamespace(intent="choose_action", selection_index=2)

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent", interpret
    )
    response = process_mobile_sms(
        phone_number=PHONE,
        message="I want to save water",
        provider_message_id="sms-natural-action-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert "Turn saved 1" in response
    assert observed["phase"] == "turn"
    assert observed["options"] == [
        "Repair pipe",
        "Save water",
        "Water plan",
        "Add storage",
        "Irrigation",
    ]
    assert len(gateway.decision_keys) == 1

    reflection_call: dict[str, object] = {}

    def interpret_reflection(**kwargs: object) -> SimpleNamespace:
        reflection_call.update(kwargs)
        return SimpleNamespace(intent="answer_reflection", selection_index=3)

    monkeypatch.setattr(
        "app.integrations.africas_talking.mobile_gameplay.interpret_sms_intent",
        interpret_reflection,
    )
    hint = process_mobile_sms(
        phone_number=PHONE,
        message="I am not sure why that happened",
        provider_message_id="sms-natural-reflection-1",
        received_at=None,
        link_id=None,
        store=store,
        gateway=gateway,
    )

    assert hint.startswith("Hint 1:")
    assert reflection_call["phase"] == "reflection"
    assert store.reflections == [(next(iter(store.sessions)), store.student_id, 1, "3")]


def test_ussd_shows_games_first_and_each_number_opens_its_matching_game(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    store.link = SimpleNamespace(preferred_language="en", student_id=store.student_id)
    gateway = FakeMobileGateway(store)
    expected = [
        "Mtoni Water, turn 1/6. Water: 60; budget: 100. Choose: 1 Repair pipe; "
        "2 Save water; 3 Water plan; 4 Add storage; 5 Irrigation; 0 Menu.",
        "Soko, turn 1/6. Cash: 100; stock: 10. Choose plan: 1 Value: order 5 at 6 "
        "credits; 2 Steady: order 5 at 8 credits; 3 Premium: order 10 at 10 credits; "
        "0 Menu.",
        "Fever, turn 1/6. Budget 100; water: 60; handwashing: 20; clinic: 20. Choose: "
        "1 Plan water point; 2 Add handwashing; 3 Improve clinic readiness; 0 Menu.",
        "Chama, turn 1/6. Pool: 100; reserve: 20. Choose: 1 Add to group reserve; "
        "2 Approve request A; 3 Approve request B; 0 Menu.",
    ]

    for number, game_screen in enumerate(expected, start=1):
        callback = USSDCallbackRequest(
            sessionId=f"portfolio-{number}",
            serviceCode="*123#",
            phoneNumber=PHONE,
            text="",
            networkCode="639",
        )
        game_list = process_mobile_ussd(callback, store=store, gateway=gateway)
        assert game_list == (
            "CON Choose game\n1 Mtoni water resilience\n2 Mama Mboga Market\n"
            "3 Mtoni Fever Response\n4 Chama Trust Circle\n0 Back"
        )

        selected = process_mobile_ussd(
            callback.model_copy(update={"text": str(number)}), store=store, gateway=gateway
        )
        assert selected == f"CON {game_screen}"
        assert len(selected) <= 160

    for mission in store.missions:
        scenario = store.scenarios[mission.id]
        swahili_menu = _turn_menu(mission.title, scenario, scenario["initial_state"], language="sw")
        assert len(swahili_menu) <= 156
        assert "zamu 1/6" in swahili_menu
        assert swahili_menu.endswith("0 Menyu.")


def test_legacy_ussd_session_reopens_on_game_list_instead_of_mtoni_turn_menu(monkeypatch) -> None:
    from datetime import UTC, datetime, timedelta

    from app.config import settings
    from app.integrations.africas_talking.menu_state import phone_reference

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    store = FakeMobileStore()
    gateway = FakeMobileGateway(store)
    callback = USSDCallbackRequest(
        sessionId="legacy-ussd",
        serviceCode="*123#",
        phoneNumber=PHONE,
        text="",
        networkCode="639",
    )
    store.mobile["legacy-ussd"] = SimpleNamespace(
        provider_session_id="legacy-ussd",
        phone_ref=phone_reference(PHONE),
        session_id=None,
        current_menu="main",
        state={"screen": "main", "language": "en"},
        expires_at=datetime.now(UTC) + timedelta(minutes=2),
        last_request_key="old-menu-request",
    )

    response = process_mobile_ussd(callback, store=store, gateway=gateway)

    assert response.startswith("CON Choose game")
    assert "Choose an action" not in response
    assert store.mobile["legacy-ussd"].current_menu == "games"


def test_hmac_phone_reference_normalizes_plus_prefix(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "phone_hmac_secret", HMAC_KEY)
    assert phone_hmac_reference("254700000111") == phone_hmac_reference(PHONE)
