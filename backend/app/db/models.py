"""SQLAlchemy mappings for the Supabase PostgreSQL schema."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """Base metadata for the version-controlled Supabase schema."""


class School(Base):
    __tablename__ = "schools"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    timezone: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    school_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.schools.id")
    )
    grade_level: Mapped[str | None] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(Text, nullable=False, default="en")
    accessibility_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClassModel(Base):
    __tablename__ = "classes"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    school_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.schools.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    grade_level: Mapped[str] = mapped_column(Text, nullable=False)
    teacher_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClassMembership(Base):
    __tablename__ = "class_memberships"
    __table_args__ = (UniqueConstraint("class_id", "student_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    class_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.classes.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False
    )
    membership_status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Mission(Base):
    __tablename__ = "missions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    grade_band: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    published_version_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.scenario_versions.id")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MissionAssignment(Base):
    __tablename__ = "mission_assignments"
    __table_args__ = (
        UniqueConstraint(
            "class_id", "mission_id", name="mission_assignments_class_id_mission_id_key"
        ),
        Index("mission_assignments_mission_id_idx", "mission_id"),
        Index("mission_assignments_assigned_by_idx", "assigned_by"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    class_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.classes.id", ondelete="CASCADE"), nullable=False
    )
    mission_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.missions.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SandboxPhoneMapping(Base):
    __tablename__ = "sandbox_phone_mappings"
    __table_args__ = (
        CheckConstraint(
            "phone_ref ~ '^[a-f0-9]{64}$'", name="sandbox_phone_mappings_phone_ref_check"
        ),
        Index("sandbox_phone_mappings_student_id_idx", "student_id"),
    )

    phone_ref: Mapped[str] = mapped_column(Text, primary_key=True)
    student_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ScenarioVersion(Base):
    __tablename__ = "scenario_versions"
    __table_args__ = (UniqueConstraint("mission_id", "version"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    mission_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.missions.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    initial_state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    rules_version: Mapped[str] = mapped_column(Text, nullable=False)
    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    approved_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SimulationSession(Base):
    __tablename__ = "simulation_sessions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    student_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.profiles.id"), nullable=False
    )
    mission_version_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.scenario_versions.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    current_turn: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    parent_session_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("public.simulation_sessions.id")
    )
    creation_idempotency_key: Mapped[str | None] = mapped_column(Text)


class SimulationDecision(Base):
    __tablename__ = "simulation_decisions"
    __table_args__ = (
        UniqueConstraint("session_id", "idempotency_key"),
        UniqueConstraint("session_id", "turn_number"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    action_type: Mapped[str] = mapped_column(Text, nullable=False)
    validated_parameters: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    idempotency_key: Mapped[str] = mapped_column(Text, nullable=False)
    expected_turn: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SimulationEvent(Base):
    __tablename__ = "simulation_events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    engine_version: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorldStateSnapshot(Base):
    __tablename__ = "world_state_snapshots"
    __table_args__ = (UniqueConstraint("session_id", "turn_number"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    state_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIInteraction(Base):
    __tablename__ = "ai_interactions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    task_type: Mapped[str] = mapped_column(Text, nullable=False)
    model_id: Mapped[str] = mapped_column(Text, nullable=False)
    output: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    validation_status: Mapped[str] = mapped_column(Text, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LearningAssessment(Base):
    __tablename__ = "learning_assessments"
    __table_args__ = (
        Index(
            "learning_assessments_session_rubric_version_uidx",
            "session_id",
            "rubric_version",
            unique=True,
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    rubric_version: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    feedback: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    teacher_review_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MobileSession(Base):
    __tablename__ = "mobile_sessions"
    __table_args__ = (
        UniqueConstraint("provider_session_id", name="mobile_sessions_provider_session_id_key"),
        Index("mobile_sessions_session_expiry_idx", "session_id", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    provider_session_id: Mapped[str] = mapped_column(Text, nullable=False)
    phone_ref: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_menu: Mapped[str] = mapped_column(Text, nullable=False)
    state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_request_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeliveryLog(Base):
    __tablename__ = "delivery_logs"
    __table_args__ = (
        Index(
            "delivery_logs_provider_message_id_uidx",
            "provider_message_id",
            unique=True,
            postgresql_where=text("provider_message_id IS NOT NULL"),
        ),
        Index("delivery_logs_session_idx", "session_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    session_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("public.simulation_sessions.id", ondelete="SET NULL"),
    )
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    recipient_ref: Mapped[str] = mapped_column(Text, nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    error_code: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
