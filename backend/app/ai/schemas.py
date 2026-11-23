"""Strict output contracts for NVIDIA tasks; these shapes contain no simulation controls."""

from pydantic import BaseModel, ConfigDict, Field


class AIOutput(BaseModel):
    """Reject extra model fields, including invented numeric state changes."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class StakeholderDialogue(AIOutput):
    """Short, persona-grounded dialogue tied to supplied state facts."""

    actor_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=600)
    referenced_facts: list[str] = Field(max_length=8)
    suggested_question: str = Field(max_length=240)


class CriterionFeedback(AIOutput):
    """Qualitative evidence for a teacher-defined learning criterion."""

    criterion_id: str = Field(min_length=1, max_length=80)
    evidence: str = Field(min_length=1, max_length=500)
    feedback: str = Field(min_length=1, max_length=400)


class ReasoningAssessment(AIOutput):
    """Qualitative, evidence-linked assessment; never an official student grade."""

    rubric_version: str = Field(min_length=1, max_length=80)
    criteria: list[CriterionFeedback] = Field(min_length=1, max_length=8)
    overall_feedback: str = Field(min_length=1, max_length=1000)
    referenced_facts: list[str] = Field(max_length=12)


class Debrief(AIOutput):
    """Factual reflection using only persisted outcomes and approved facts."""

    summary: str = Field(min_length=1, max_length=1000)
    trade_offs: list[str] = Field(max_length=5)
    replay_suggestion: str = Field(min_length=1, max_length=400)
    referenced_facts: list[str] = Field(max_length=12)
