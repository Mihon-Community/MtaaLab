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
    recommended: bool = False
    recommendation_reason: str | None = None
    last_session_id: UUID | None = None
    last_session_status: str | None = None
    current_turn: int = Field(default=0, ge=0)


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
    plans: dict[str, Any] = Field(default_factory=dict)
    reflection_choices: dict[str, dict[str, str]] = Field(default_factory=dict)
    hint_ladder: dict[str, list[str]] = Field(default_factory=dict)


class MobileJoinCodeRequest(APIModel):
    class_id: UUID
    student_id: UUID


class MobileJoinCodeResponse(APIModel):
    join_code: str
    expires_at: str
    message: str


class MobileRosterLearner(APIModel):
    student_id: UUID
    display_name: str


class MobileRosterClass(APIModel):
    class_id: UUID
    name: str
    learners: list[MobileRosterLearner]


class MobileRosterResponse(APIModel):
    classes: list[MobileRosterClass]


class CreateSimulationRequest(APIModel):
    mission_id: UUID


class SessionCreatedResponse(APIModel):
    session_id: UUID
    mission_id: UUID
    turn: int = Field(ge=0)
    status: str
    scenario_id: str = "mtoni"
    state: dict[str, Any] | WorldState


class SessionStateResponse(APIModel):
    session_id: UUID
    turn: int = Field(ge=0)
    status: str
    scenario_id: str = "mtoni"
    state: dict[str, Any] | WorldState


class DecisionRequest(APIModel):
    action_type: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)
    expected_turn: int = Field(ge=0)


class DecisionResponse(APIModel):
    session_id: UUID
    turn: int = Field(ge=1)
    accepted: Literal[True] = True
    state: dict[str, Any] | WorldState
    events: list[Event]
    water_accounting: WaterAccounting | None = None
    ai_feedback_status: Literal["pending", "available", "ai_unavailable", "not_requested"] = (
        "pending"
    )


class AdvanceRequest(APIModel):
    expected_turn: int = Field(ge=0)


class HistoryEntry(APIModel):
    turn: int = Field(ge=0)
    action: dict[str, Any] | None = None
    events: list[Event] = Field(default_factory=list)
    state: dict[str, Any] | WorldState
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


class ReflectionRequest(APIModel):
    turn_number: int = Field(ge=1)
    answer_code: Literal["1", "2", "3"]


class ReflectionResponse(APIModel):
    session_id: UUID
    turn_number: int = Field(ge=1)
    answer_code: Literal["1", "2", "3"]
    misconception_tag: str = Field(min_length=1, max_length=80)
    accepted: Literal[True] = True
    idempotent_replay: bool = False


class ReflectionStatusResponse(APIModel):
    reflection: ReflectionResponse | None = None


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
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session_id: str = Field(alias="sessionId", min_length=1, max_length=128)
    service_code: str = Field(alias="serviceCode", min_length=1, max_length=64)
    phone_number: str = Field(alias="phoneNumber", min_length=1, max_length=32)
    text: str = Field(default="", max_length=500)
    network_code: str = Field(alias="networkCode", max_length=64)


class SMSStatusCallbackRequest(APIModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    provider_message_id: str = Field(alias="id", min_length=1, max_length=128)
    status: str = Field(min_length=1, max_length=64)
    phone_number: str | None = Field(default=None, alias="phoneNumber", max_length=32)
    network_code: str | None = Field(default=None, alias="networkCode", max_length=64)
    failure_reason: str | None = Field(default=None, alias="failureReason", max_length=160)
    retry_count: str | None = Field(default=None, alias="retryCount", max_length=16)


class IncomingSMSCallbackRequest(APIModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    sender: str = Field(alias="from", min_length=6, max_length=32)
    text: str = Field(max_length=500)
    recipient: str | None = Field(default=None, alias="to", max_length=64)
    provider_message_id: str | None = Field(default=None, alias="id", max_length=128)
    link_id: str | None = Field(default=None, alias="linkId", max_length=128)
    date: str | None = Field(default=None, max_length=64)
    network_code: str | None = Field(default=None, alias="networkCode", max_length=64)
    retry_count: str | None = Field(default=None, alias="retryCount", max_length=16)


class USSDMenuResponse(APIModel):
    message: str = Field(min_length=5, max_length=160, pattern=r"^(CON|END) ")


class SmsResult(APIModel):
    status: Literal["sent", "failed", "not_configured"]
    provider_message_id: str | None = Field(default=None, max_length=128)
    error_code: str | None = Field(default=None, max_length=64)


class WebhookAckResponse(APIModel):
    status: Literal["accepted"] = "accepted"
