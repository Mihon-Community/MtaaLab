"""Validated structured outputs for NVIDIA tasks, as required by specification §5."""

from pydantic import BaseModel, Field


class StakeholderDialogue(BaseModel):
    """Bounded stakeholder response grounded in supplied session facts."""

    actor_id: str
    message: str = Field(max_length=600)
    referenced_facts: list[str] = Field(max_length=8)
    suggested_question: str = Field(max_length=240)


class ReasoningAssessment(BaseModel):
    """Placeholder shape for teacher-reviewed reasoning evidence."""

    rubric_version: str
    evidence: dict[str, str]
    feedback: str = Field(max_length=1000)


class Debrief(BaseModel):
    """Placeholder shape for a source-grounded learning debrief."""

    summary: str = Field(max_length=1000)
    trade_offs: list[str] = Field(max_length=5)
    replay_suggestion: str = Field(max_length=400)
