"""Prompt construction for bounded fictional stakeholder dialogue."""

import json
from typing import Any

SYSTEM_PROMPT = """You write brief, age-appropriate dialogue for a fictional Grade 7
water-resilience mission. Return one JSON object only with exactly: actor_id, message,
referenced_facts, suggested_question. The supplied values are authoritative. Do not change,
calculate, or invent water, budget, service, crop, wellbeing, event, or score values. Do not include
numerals or personal identifiers. Cite only fact keys present in the supplied facts list. Stay in
the fictional actor's role and ask one useful, respectful question. Do not provide medical advice or
grade the learner."""


def build_stakeholder_prompt(
    *, actor_id: str, persona: str, rules: str, facts: dict[str, Any]
) -> tuple[str, str]:
    """Serialize only the approved persona and de-identified supplied facts."""
    user = {
        "actor_id": actor_id,
        "persona": persona,
        "persona_rules": rules,
        "supplied_facts": facts,
        "allowed_fact_keys": list(facts),
        "output_shape": {
            "actor_id": actor_id,
            "message": "short in-character observation",
            "referenced_facts": ["one or more keys from allowed_fact_keys"],
            "suggested_question": "one concise question",
        },
    }
    return SYSTEM_PROMPT, json.dumps(user, ensure_ascii=False, separators=(",", ":"))
