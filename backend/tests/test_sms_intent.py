"""Strict, privacy-conscious classification tests for natural-language SMS commands."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

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
        ("lobby", '{"intent":"list_games","selection_index":null}', "list_games", None),
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
    client = FakeNvidiaClient('{"intent":"list_games","selection_index":null}')

    decision = interpret_sms_intent(
        message="I am Private Learner. Please show the games at +254712345678",
        phase="lobby",
        games=["Mtoni water"],
        options=[],
        client=client,
    )

    assert decision is not None
    assert client.call is not None
    assert client.call["max_tokens"] == 128
    assert client.call["temperature"] == 0.2
    assert client.call["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}
    prompt = str(client.call["messages"])
    assert "Private Learner" not in prompt
    assert "+254712345678" not in prompt
    request_data = json.loads(client.call["messages"][1]["content"])
    assert "start_game" in request_data["valid_intents"]
    assert "choose_action" not in request_data["valid_intents"]


def test_missing_provider_key_uses_static_fallback(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", None)

    decision = interpret_sms_intent(
        message="I would like the market game",
        phase="lobby",
        games=["Mtoni water", "Mama Mboga Market"],
        options=[],
    )

    assert decision is None
