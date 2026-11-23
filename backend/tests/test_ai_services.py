"""Mocked NVIDIA service tests for grounding, validation, and fallbacks."""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.debrief_service import create_debrief
from app.ai.reasoning_evaluator import evaluate_reasoning
from app.ai.schemas import Debrief
from app.ai.stakeholder_service import stakeholder_dialogue
from app.config import settings


class FakeNvidiaClient:
    """Small fake for the OpenAI-compatible chat-completions interface."""

    def __init__(self, content: str | None = None, error: Exception | None = None) -> None:
        self.content = content
        self.error = error
        self.call: dict[str, Any] | None = None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.call = kwargs
        if self.error is not None:
            raise self.error
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def enable_fake_key(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")


def test_ai_01_malformed_json_uses_static_fallback(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    recorded: list[dict[str, Any]] = []

    result = stakeholder_dialogue(
        {"reservoir_level": 30},
        "clinic_nurse",
        client=FakeNvidiaClient("not valid json"),
        record_interaction=lambda **item: recorded.append(item),
    )

    assert result.status == "ai_unavailable"
    assert result.source == "fallback"
    assert result.validation_status == "fallback_invalid_json"
    assert result.output.actor_id == "clinic_nurse"
    assert result.output.referenced_facts == []
    assert len(recorded) == 1
    assert "prompt" not in recorded[0]
    assert "hidden_reasoning" not in recorded[0]


def test_ai_02_unsupported_fact_is_rejected_to_fallback(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    content = (
        '{"actor_id":"farmer","message":"Our crops need careful choices.",'
        '"referenced_facts":["secret_student_score"],'
        '"suggested_question":"Which need should we discuss?"}'
    )

    result = stakeholder_dialogue(
        {"demand_by_sector": {"farms": 15}},
        "farmer",
        client=FakeNvidiaClient(content),
    )

    assert result.status == "ai_unavailable"
    assert result.validation_status == "fallback_unsupported_fact"
    assert result.output.actor_id == "farmer"
    assert result.output.referenced_facts == []


def test_ai_03_timeout_falls_back_without_mutating_state(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    state = {"current_turn": 1, "reservoir_level": 41, "budget_remaining": 85}
    before = deepcopy(state)

    result = stakeholder_dialogue(
        state,
        "head_teacher",
        client=FakeNvidiaClient(error=TimeoutError()),
    )

    assert result.status == "ai_unavailable"
    assert result.validation_status == "fallback_timeout"
    assert state == before


def test_numeric_state_output_is_never_accepted(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    content = (
        '{"actor_id":"clinic_nurse","message":"Reservoir is now 20.",'
        '"referenced_facts":["reservoir_level"],'
        '"suggested_question":"How will you protect the clinic?"}'
    )

    result = stakeholder_dialogue(
        {"reservoir_level": 20},
        "clinic_nurse",
        client=FakeNvidiaClient(content),
    )

    assert result.status == "ai_unavailable"
    assert result.validation_status == "fallback_numeric_or_state_change"


def test_stakeholder_prompt_redacts_personal_information(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    client = FakeNvidiaClient(
        '{"actor_id":"clinic_nurse","message":"A reliable plan matters to us.",'
        '"referenced_facts":["reservoir_level"],'
        '"suggested_question":"How will you protect essential care?"}'
    )

    result = stakeholder_dialogue(
        {
            "reservoir_level": 35,
            "student_name": "Private Student",
            "phone_number": "+254712345678",
            "school_id": "school-private-id",
        },
        "clinic_nurse",
        client=client,
    )

    assert result.status == "available"
    assert client.call is not None
    prompt = str(client.call["messages"])
    assert "Private Student" not in prompt
    assert "+254712345678" not in prompt
    assert "school-private-id" not in prompt
    assert "reservoir_level" in prompt


def test_stakeholder_calls_use_bounded_model_settings(monkeypatch: Any) -> None:
    enable_fake_key(monkeypatch)
    client = FakeNvidiaClient(
        '{"actor_id":"farmer","message":"Careful choices matter to our crops.",'
        '"referenced_facts":[],"suggested_question":"Which needs should we compare?"}'
    )

    stakeholder_dialogue({}, "farmer", client=client)

    assert client.call is not None
    assert client.call["model"] == settings.nvidia_model
    assert client.call["temperature"] == 0.3
    assert client.call["max_tokens"] == 350


def test_missing_key_returns_fallback_without_client(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", None)

    result = stakeholder_dialogue({"reservoir_level": 50}, "head_teacher")

    assert result.status == "ai_unavailable"
    assert result.source == "fallback"
    assert result.validation_status == "fallback_missing_api_key"


def test_reasoning_assessment_has_qualitative_fallback(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", None)

    result = evaluate_reasoning(
        "I considered the needs and the saved results.",
        {"turn": 2, "action": "change_allocation"},
    )

    assert result.status == "ai_unavailable"
    assert result.output.criteria
    assert result.output.referenced_facts == []
    assert all("score" not in item.model_dump() for item in result.output.criteria)


def test_debrief_fallback_uses_only_recorded_history(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "nvidia_api_key", None)
    history = [
        {
            "turn": 1,
            "action": {"action_type": "repair_main_pipe"},
            "events": [{"event_type": "weekly_water_report"}],
            "state": {"reservoir_level": 44},
        }
    ]

    result = create_debrief(history)

    assert result.status == "ai_unavailable"
    assert isinstance(result.output, Debrief)
    assert "Repair main leaking pipe" in result.output.trade_offs[0]
    assert "confirmed outcome" in result.output.summary
    assert result.output.referenced_facts == []


@pytest.mark.nvidia
@pytest.mark.skipif(not settings.nvidia_api_key, reason="NVIDIA_API_KEY is not configured")
def test_optional_live_nvidia_smoke_returns_validated_output_or_safe_fallback() -> None:
    """Exercise one bounded live call without sending identifying learner information."""
    result = stakeholder_dialogue(
        {"turn": 1, "reservoir_level": 50, "service_levels": {"clinic": 0.8}},
        "clinic_nurse",
    )

    assert result.output.actor_id == "clinic_nurse"
    assert result.status in {"available", "ai_unavailable"}
