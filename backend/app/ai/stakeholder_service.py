"""Grounded fictional dialogue with an approved static fallback."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.ai.nvidia_client import (
    AIResult,
    RecordInteraction,
    configured_model,
    flatten_fact_keys,
    record_result,
    redact_direct_pii,
    run_validated_task,
)
from app.ai.prompts.stakeholder import build_stakeholder_prompt
from app.ai.schemas import StakeholderDialogue

_SCENARIO_PATH = Path(__file__).resolve().parents[1] / "simulation" / "scenarios" / "mtoni_v1.json"
_FALLBACKS = {
    "clinic_nurse": (
        "A reliable water plan matters to our clinic. "
        "How will you balance essential care with other community needs?",
        "How will your plan protect essential care?",
    ),
    "farmer": (
        "Our crops depend on careful water choices. "
        "What trade-off do you want the community to discuss?",
        "Which trade-off should the community consider?",
    ),
    "head_teacher": (
        "The school needs a dependable plan for learners. "
        "What evidence will help you compare priorities?",
        "What evidence will help you compare priorities?",
    ),
}


def stakeholder_dialogue(
    state_summary: dict[str, object],
    actor_id: str,
    *,
    supplied_facts: list[str] | None = None,
    client: Any | None = None,
    record_interaction: RecordInteraction | None = None,
) -> AIResult[StakeholderDialogue]:
    """Return validated dialogue grounded only in this de-identified state snapshot."""
    scenario = json.loads(_SCENARIO_PATH.read_text(encoding="utf-8"))
    actors = {actor["actor_id"]: actor for actor in scenario["approved_actors"]}
    selected = actors.get(actor_id)
    if selected is None:
        selected = actors["head_teacher"]
        dialogue = _fallback(selected["actor_id"])
        result = AIResult(
            output=dialogue,
            status="ai_unavailable",
            source="fallback",
            model_id=_configured_model(),
            latency_ms=0,
            validation_status="fallback_unapproved_actor",
        )
        record_result(record_interaction, task_type="stakeholder_dialogue", result=result)
        return result

    safe_state = redact_direct_pii(state_summary)
    facts = _flatten_fact_values(safe_state)
    if supplied_facts is not None:
        allowed = set(supplied_facts)
        facts = {key: value for key, value in facts.items() if key in allowed}
    system_prompt, user_prompt = build_stakeholder_prompt(
        actor_id=actor_id,
        persona=selected["persona"],
        rules=selected["rules"],
        facts=facts,
    )

    def validate_actor(payload: dict[str, Any]) -> None:
        if payload.get("actor_id") != actor_id:
            raise ValueError("unsupported_actor")

    return run_validated_task(
        task_type="stakeholder_dialogue",
        output_schema=StakeholderDialogue,
        fallback=_fallback(actor_id),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        available_facts=flatten_fact_keys(facts),
        client=client,
        record_interaction=record_interaction,
        validate_payload=validate_actor,
    )


def _fallback(actor_id: str) -> StakeholderDialogue:
    message, question = _FALLBACKS[actor_id]
    return StakeholderDialogue(
        actor_id=actor_id,
        message=message,
        referenced_facts=[],
        suggested_question=question,
    )


def _configured_model() -> str:
    return configured_model()


def _flatten_fact_values(value: Any, prefix: str = "") -> dict[str, Any]:
    facts: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            facts.update(_flatten_fact_values(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            facts.update(_flatten_fact_values(item, f"{prefix}[{index}]"))
    elif prefix:
        facts[prefix] = value
    return facts
