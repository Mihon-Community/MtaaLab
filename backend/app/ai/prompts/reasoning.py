"""Prompt construction for qualitative, evidence-grounded reasoning feedback."""

import json
from typing import Any

SYSTEM_PROMPT = """You provide supportive formative feedback for a fictional Grade 7
systems-thinking mission. Return one JSON object only with exactly: rubric_version, criteria,
overall_feedback, referenced_facts. Each criteria item has exactly criterion_id, evidence, feedback.
The supplied values are authoritative. Use only the student explanation, rubric criteria, and
evidence provided. Do not infer personal traits, invent actions, calculate or change simulation
values, assign a grade, or include numerals. Cite only fact keys from allowed_fact_keys. Keep
feedback constructive, concise, and age-appropriate."""


def build_reasoning_prompt(
    *, explanation: str, evidence: dict[str, Any], criteria: list[dict[str, str]]
) -> tuple[str, str]:
    """Build a minimal prompt without identity or school information."""
    user = {
        "student_explanation": explanation,
        "recorded_evidence": evidence,
        "rubric_version": "mtoni-qualitative-v1",
        "rubric_criteria": criteria,
        "allowed_fact_keys": list(evidence),
        "output_shape": {
            "rubric_version": "mtoni-qualitative-v1",
            "criteria": [
                {
                    "criterion_id": "systems_thinking",
                    "evidence": "brief evidence",
                    "feedback": "brief feedback",
                }
            ],
            "overall_feedback": "supportive summary",
            "referenced_facts": ["one or more keys from allowed_fact_keys"],
        },
    }
    return SYSTEM_PROMPT, json.dumps(user, ensure_ascii=False, separators=(",", ":"))
