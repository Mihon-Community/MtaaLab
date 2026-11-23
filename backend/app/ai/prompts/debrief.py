"""Prompt construction for source-grounded after-action reflection."""

import json
from typing import Any

SYSTEM_PROMPT = """You summarize a completed fictional water-resilience simulation for a Grade 7
learner. Return one JSON object only with exactly: summary, trade_offs, replay_suggestion,
referenced_facts. The recorded values and events are authoritative. Do not invent actions or
outcomes, calculate or change simulation values, or include numerals. Discuss only evidence
explicitly present in the input. Cite only fact keys listed in allowed_fact_keys. Keep the tone
supportive and the language concise."""


def build_debrief_prompt(
    *, history: list[dict[str, Any]], learning_objectives: list[str]
) -> tuple[str, str]:
    """Build a minimal de-identified prompt from persisted history only."""
    user = {
        "recorded_history": history,
        "learning_objectives": learning_objectives,
        "allowed_fact_keys": _flatten_keys(history),
        "output_shape": {
            "summary": "brief factual summary",
            "trade_offs": ["recorded trade-off"],
            "replay_suggestion": "one evidence-based alternative to compare",
            "referenced_facts": ["one or more keys from allowed_fact_keys"],
        },
    }
    return SYSTEM_PROMPT, json.dumps(user, ensure_ascii=False, separators=(",", ":"))


def _flatten_keys(value: Any, prefix: str = "") -> list[str]:
    keys: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            keys.append(path)
            keys.extend(_flatten_keys(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            keys.extend(_flatten_keys(item, f"{prefix}[{index}]"))
    return keys
