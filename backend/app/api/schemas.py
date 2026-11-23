"""Shared API request/response shapes from specification §9; values are placeholders only."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DecisionRequest(BaseModel):
    action_type: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    expected_turn: int = Field(ge=0)


class SimulationState(BaseModel):
    reservoir_level: float
    budget_remaining: float
    # TODO(owner): complete with scenario-defined service and wellbeing indicators.


class DecisionResponse(BaseModel):
    session_id: UUID
    turn: int
    accepted: bool
    state: SimulationState
    events: list[dict[str, Any]]
    ai_feedback_status: str


class DialogueResponse(BaseModel):
    actor_id: str
    message: str
    referenced_facts: list[str]
    suggested_question: str
