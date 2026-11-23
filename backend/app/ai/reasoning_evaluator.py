"""Reasoning evaluation scores evidence against a teacher-defined rubric; TODO(owner): implement."""

from app.ai.schemas import ReasoningAssessment


def evaluate_reasoning(explanation: str, evidence: dict[str, object]) -> ReasoningAssessment:
    """Return bounded, Pydantic-validated reasoning feedback or fallback."""
    raise NotImplementedError
