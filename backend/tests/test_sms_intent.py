"""Strict, privacy-conscious classification tests for natural-language SMS commands."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.nvidia_client import redact_direct_pii
from app.ai.sms_intent import SMSIntentDecision, interpret_sms_intent
from app.config import settings


class FakeNvidiaClient:
    def __init__(self, content: str) -> None:
        self.content = content
        self.call: dict[str, Any] | None = None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.call = kwargs
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.mark.parametrize(
    ("phase", "content", "intent", "index"),
    [
        ("lobby", '{"intent":"start_game","selection_index":2}', "start_game", 2),
        ("turn", '{"intent":"choose_action","selection_index":1}', "choose_action", 1),
        (
            "reflection",
            '{"intent":"answer_reflection","selection_index":3}',
            "answer_reflection",
            3,
        ),
    ],
)
def test_valid_intent_is_restricted_to_current_phase(
    monkeypatch: Any, phase: str, content: str, intent: str, index: int | None
) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
    decision = interpret_sms_intent(
        message="Please do that",
        phase=phase,  # type: ignore[arg-type]
        games=["Mtoni water", "Mama Mboga Market"],
        options=["Repair pipe", "Save water", "Water plan"],
        client=FakeNvidiaClient(content),
    )

    assert decision == SMSIntentDecision(intent=intent, selection_index=index)


@pytest.mark.parametrize(
    ("phase", "content"),
    [
        ("lobby", '{"intent":"choose_action","selection_index":1}'),
        ("hint", '{"intent":"choose_action","selection_index":1}'),
        ("lobby", '{"intent":"start_game","selection_index":8}'),
        ("turn", '{"intent":"choose_action","selection_index":true}'),
        (
            "lobby",
            '{"intent":"start_game","selection_index":1,"action_type":"repair_pipe"}',
        ),
        ("lobby", "not json"),
    ],
)
def test_invalid_or_unsafe_model_output_is_rejected(
    monkeypatch: Any, phase: str, content: str
) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")

    decision = interpret_sms_intent(
        message="Play",
        phase=phase,  # type: ignore[arg-type]
        games=["Mtoni water"],
        options=["Repair pipe"],
        client=FakeNvidiaClient(content),
    )

    assert decision is None


def test_intent_request_is_small_redacted_and_reasoning_is_bounded(
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
    client = FakeNvidiaClient('{"intent":"reply","selection_index":null,"reply_text":"Hello!"}')

    decision = interpret_sms_intent(
        message="I am Private Learner. Please show the games at +254712345678",
        phase="lobby",
        games=["Mtoni water"],
        options=[],
        game_information=[{"index": "1", "title": "Mtoni water", "about": "Plan water resources."}],
        playing_guide="Reply GAMES to list games.",
        client=client,
    )

    assert decision is not None
    assert client.call is not None
    assert client.call["max_tokens"] == 128
    assert client.call["temperature"] == 0.55
    assert "seed" not in client.call
    assert client.call["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}
    prompt = str(client.call["messages"])
    system_prompt = client.call["messages"][0]["content"]
    assert "omit prices and option values" in system_prompt
    assert "Private Learner" not in prompt
    assert "+254712345678" not in prompt
    request_data = json.loads(client.call["messages"][1]["content"])
    assert request_data["preferred_language"] == "en"
    assert "start_game" in request_data["valid_intents"]
    assert "choose_action" not in request_data["valid_intents"]
    assert request_data["game_information"][0]["about"] == "Plan water resources."
    assert request_data["playing_guide"] == "Reply GAMES to list games."
    assert request_data["current_game"] is None


def test_conversational_reply_is_bounded_and_pii_redacted(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
    client = FakeNvidiaClient(
        '{"intent":"reply","selection_index":null,'
        '"reply_text":"Hi! Soko lets you run a small market. Want to try it?"}'
    )

    decision = interpret_sms_intent(
        message="What is Soko?",
        phase="lobby",
        games=["Mama Mboga Market"],
        options=[],
        current_game="Mtoni Water Resilience",
        game_information=[
            {"index": "1", "title": "Mama Mboga Market", "about": "Market planning."}
        ],
        client=client,
    )

    assert decision is not None
    assert decision.intent == "reply"
    assert decision.reply_text == "Hi! Soko lets you run a small market. Want to try it?"
    assert client.call is not None
    request_data = json.loads(client.call["messages"][1]["content"])
    assert request_data["current_game"] == "Mtoni Water Resilience"


def test_verbose_soko_reply_is_compacted_without_losing_how_to_or_start_command(
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
    reply = (
        "Soko (Mama Mboga Market): run a stall for six days. Each day choose stock and price: "
        "Value 5 items at 6 credits, Steady 5 at 8, Premium 10 at 10. Compare demand, sales, "
        "cash, leftovers. PLAY 2 to start."
    )
    decision = interpret_sms_intent(
        message="What is Soko about?",
        phase="lobby",
        games=["Mtoni water", "Mama Mboga Market"],
        options=[],
        game_information=[
            {"index": "2", "title": "Mama Mboga Market", "aliases": "Soko", "about": reply}
        ],
        client=FakeNvidiaClient(
            json.dumps({"intent": "reply", "selection_index": None, "reply_text": reply})
        ),
    )

    assert decision is not None
    assert decision.reply_text is not None
    assert len(decision.reply_text) <= 160
    assert "choose stock and price" in decision.reply_text
    assert "compare demand" in decision.reply_text.casefold()
    assert "PLAY 2 to start" in decision.reply_text
    assert "Premium" not in decision.reply_text


def test_pii_redaction_preserves_ordinary_game_title_wording() -> None:
    assert redact_direct_pii("Text a game name to learn, or PLAY 2 to start.") == (
        "Text a game name to learn, or PLAY 2 to start."
    )
    assert redact_direct_pii("Learner name: Alice Example") == "[redacted]"


@pytest.mark.parametrize(
    "content",
    [
        '{"intent":"reply","selection_index":null}',
        '{"intent":"reply","selection_index":1,"reply_text":"Play Soko."}',
        '{"intent":"reply","selection_index":null,"reply_text":"' + ("x" * 501) + '"}',
    ],
)
def test_invalid_question_reply_is_rejected(monkeypatch: Any, content: str) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")

    decision = interpret_sms_intent(
        message="What is the game?",
        phase="lobby",
        games=["Mtoni water"],
        options=[],
        client=FakeNvidiaClient(content),
    )

    assert decision is None


def test_missing_provider_key_uses_static_fallback(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", None)

    decision = interpret_sms_intent(
        message="I would like the market game",
        phase="lobby",
        games=["Mtoni water", "Mama Mboga Market"],
        options=[],
    )

    assert decision is None
