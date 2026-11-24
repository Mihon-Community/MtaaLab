"""Qualitative formative feedback that never makes numeric or high-stakes judgments."""

from __future__ import annotations

from typing import Any

from app.ai.nvidia_client import (
    AIResult,
    RecordInteraction,
    flatten_fact_keys,
    redact_direct_pii,
    run_validated_task,
)
from app.ai.prompts.reasoning import build_reasoning_prompt
from app.ai.schemas import CriterionFeedback, ReasoningAssessment
from app.learning.rubrics import current_reasoning_rubric

_REASONING_RUBRIC = current_reasoning_rubric()
RUBRIC_VERSION = _REASONING_RUBRIC.version
RUBRIC_CRITERIA = [
    {"criterion_id": criterion.criterion_id, "description": criterion.description}
    for criterion in _REASONING_RUBRIC.criteria
]


def evaluate_reasoning(
    explanation: str,
    evidence: dict[str, object],
    *,
    client: Any | None = None,
    record_interaction: RecordInteraction | None = None,
) -> AIResult[ReasoningAssessment]:
    """Return validated qualitative evidence or a safe formative fallback."""
    safe_explanation = str(redact_direct_pii(explanation))[:2000]
    safe_evidence = redact_direct_pii(evidence)
    system_prompt, user_prompt = build_reasoning_prompt(
        explanation=safe_explanation,
        evidence=safe_evidence,
        criteria=RUBRIC_CRITERIA,
    )

    def validate_payload(payload: dict[str, Any]) -> None:
        if payload.get("rubric_version") != RUBRIC_VERSION:
            raise ValueError("unsupported_rubric")
        criterion_ids = {item["criterion_id"] for item in RUBRIC_CRITERIA}
        criteria = payload.get("criteria")
        if not isinstance(criteria, list) or any(
            not isinstance(item, dict) or item.get("criterion_id") not in criterion_ids
            for item in criteria
        ):
            raise ValueError("unsupported_criterion")

    return run_validated_task(
        task_type="reasoning_assessment",
        output_schema=ReasoningAssessment,
        fallback=_fallback_assessment(),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        available_facts=flatten_fact_keys(safe_evidence),
        client=client,
        record_interaction=record_interaction,
        validate_payload=validate_payload,
    )


def _fallback_assessment() -> ReasoningAssessment:
    return ReasoningAssessment(
        rubric_version=RUBRIC_VERSION,
        criteria=[
            CriterionFeedback(
                criterion_id="systems_thinking",
                evidence="Your explanation is available for review alongside the recorded mission.",
                feedback="Try connecting one community need to a recorded change in the system.",
            ),
            CriterionFeedback(
                criterion_id="evidence_use",
                evidence="The simulation history contains the evidence for your decisions.",
                feedback="Point to a recorded result that supports your explanation.",
            ),
            CriterionFeedback(
                criterion_id="trade_off_reasoning",
                evidence="The mission records decisions affecting several community needs.",
                feedback="Compare two needs and explain how your plan balanced them.",
            ),
        ],
        overall_feedback=(
            "Use the recorded mission evidence to explain how your choices affected the community. "
            "This is formative feedback, not an official grade."
        ),
        referenced_facts=[],
    )
