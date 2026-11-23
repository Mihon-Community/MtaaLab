"""Explicit request and response contracts for the documented HTTP API."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.simulation.world_state import Event, WaterAccounting, WorldState


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(APIModel):
    status: Literal["ok"]


class MissionListItem(APIModel):
    id: UUID
    title: str
    description: str
    subject: str
    grade_band: str
    scenario_version: int


class MissionListResponse(APIModel):
    missions: list[MissionListItem]


class MissionDetailResponse(MissionListItem):
    learning_objectives: list[str]
    scenario_id: str
    rules_version: str
    turn_duration: dict[str, Any]
    number_of_turns: int
    units: dict[str, str]
    action_catalogue: list[dict[str, Any]]
    allocation_policies: list[dict[str, Any]]


class CreateSimulationRequest(APIModel):
    mission_id: UUID


class SessionCreatedResponse(APIModel):
    session_id: UUID
    mission_id: UUID
    turn: int = Field(ge=0)
    status: str
    state: WorldState


class SessionStateResponse(APIModel):
    session_id: UUID
    turn: int = Field(ge=0)
    status: str
    state: WorldState


class DecisionRequest(APIModel):
    action_type: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)
    expected_turn: int = Field(ge=0)


class DecisionResponse(APIModel):
    session_id: UUID
    turn: int = Field(ge=1)
    accepted: Literal[True] = True
    state: WorldState
    events: list[Event]
    water_accounting: WaterAccounting
    ai_feedback_status: Literal["pending", "available", "ai_unavailable"] = "pending"


class AdvanceRequest(APIModel):
    expected_turn: int = Field(ge=0)


class HistoryEntry(APIModel):
    turn: int = Field(ge=0)
    action: dict[str, Any] | None = None
    events: list[Event] = Field(default_factory=list)
    state: WorldState
    state_hash: str | None = None
    ai_feedback_status: str | None = None


class HistoryResponse(APIModel):
    session_id: UUID
    entries: list[HistoryEntry]
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)
    total: int = Field(ge=0)


class ReplayRequest(APIModel):
    label: str | None = Field(default=None, max_length=80)


class ReplayResponse(SessionCreatedResponse):
    parent_session_id: UUID


class DebriefRequest(APIModel):
    student_explanation: str | None = Field(default=None, max_length=2000)


class DebriefResponse(APIModel):
    session_id: UUID
    debrief: dict[str, Any]
    source: Literal["nvidia", "fallback"]
    ai_feedback_status: Literal["available", "ai_unavailable"]


class ReportResponse(APIModel):
    session_id: UUID
    mission_id: UUID
    status: str
    current_turn: int = Field(ge=0)
    outcomes: dict[str, Any]
    decisions: list[dict[str, Any]]
    events: list[Event]
    assessment: dict[str, Any] | None = None


class ErrorResponse(APIModel):
    detail: str


class USSDCallbackRequest(APIModel):
    sessionId: str = Field(min_length=1, max_length=128)
    serviceCode: str = Field(min_length=1, max_length=64)
    phoneNumber: str = Field(min_length=1, max_length=32)
    text: str = Field(max_length=500)


class SMSStatusCallbackRequest(APIModel):
    id: str = Field(min_length=1, max_length=128)
    status: str = Field(min_length=1, max_length=64)
    phoneNumber: str | None = Field(default=None, max_length=32)
    networkCode: str | None = Field(default=None, max_length=64)
    failureReason: str | None = Field(default=None, max_length=160)
