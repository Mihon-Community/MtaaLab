"""Small repository objects keep SQL queries explicit and parameterized."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import false, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    AIInteraction,
    ClassMembership,
    ClassModel,
    DeliveryLog,
    Mission,
    MissionAssignment,
    MobileSession,
    Profile,
    SandboxPhoneMapping,
    ScenarioVersion,
    SimulationDecision,
    SimulationEvent,
    SimulationSession,
    WorldStateSnapshot,
)


class ProfileRepository:
    """Look up the minimal profile fields needed for application authorization."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, user_id: UUID) -> Profile | None:
        return self.session.get(Profile, user_id)


class MissionRepository:
    """Read published mission metadata and its immutable selected scenario version."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def _class_ids_for_user(self, user_id: UUID):
        profile = self.session.get(Profile, user_id)
        if profile is None or profile.school_id is None:
            return select(ClassModel.id).where(false())
        if profile.role == "student":
            return (
                select(ClassMembership.class_id)
                .join(ClassModel, ClassModel.id == ClassMembership.class_id)
                .where(
                    ClassMembership.student_id == user_id,
                    ClassMembership.membership_status == "active",
                    ClassModel.school_id == profile.school_id,
                )
                .distinct()
            )
        if profile.role == "teacher":
            return select(ClassModel.id).where(
                ClassModel.teacher_id == user_id,
                ClassModel.school_id == profile.school_id,
            )
        if profile.role == "admin":
            return select(ClassModel.id).where(ClassModel.school_id == profile.school_id)
        return select(ClassModel.id).where(false())

    def _assigned_mission_ids(self, user_id: UUID):
        class_ids = self._class_ids_for_user(user_id)
        return select(MissionAssignment.mission_id).where(MissionAssignment.class_id.in_(class_ids))

    def list_published(self, user_id: UUID) -> list[Mission]:
        """List published missions assigned to one of the caller's school classes."""
        query = (
            select(Mission)
            .where(
                Mission.status == "published",
                Mission.published_version_id.is_not(None),
                Mission.id.in_(self._assigned_mission_ids(user_id)),
            )
            .order_by(Mission.title)
        )
        return list(self.session.scalars(query))

    def get_published(self, mission_id: UUID) -> tuple[Mission, ScenarioVersion] | None:
        mission = self.session.scalar(
            select(Mission).where(
                Mission.id == mission_id,
                Mission.status == "published",
                Mission.published_version_id.is_not(None),
            )
        )
        if mission is None or mission.published_version_id is None:
            return None
        version = self.session.get(ScenarioVersion, mission.published_version_id)
        if version is None or version.mission_id != mission.id:
            return None
        return mission, version

    def get_published_for_user(
        self, mission_id: UUID, user_id: UUID
    ) -> tuple[Mission, ScenarioVersion] | None:
        """Return a published mission only when assigned to the caller's class."""
        is_assigned = self.session.scalar(
            select(MissionAssignment.id)
            .where(
                MissionAssignment.mission_id == mission_id,
                MissionAssignment.class_id.in_(self._class_ids_for_user(user_id)),
            )
            .limit(1)
        )
        if is_assigned is None:
            return None
        return self.get_published(mission_id)


class SimulationRepository:
    """Queries used by atomic simulation operations."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_session(
        self, session_id: UUID, *, for_update: bool = False
    ) -> SimulationSession | None:
        query = select(SimulationSession).where(SimulationSession.id == session_id)
        if for_update:
            query = query.with_for_update()
        return self.session.scalar(query)

    def get_active_session_for_student(self, student_id: UUID) -> SimulationSession | None:
        """Find the learner's most recently started active simulation session."""
        query = (
            select(SimulationSession)
            .where(
                SimulationSession.student_id == student_id,
                SimulationSession.status == "active",
            )
            .order_by(SimulationSession.started_at.desc(), SimulationSession.id.desc())
            .limit(1)
        )
        return self.session.scalar(query)

    def get_decision_by_key(
        self, session_id: UUID, idempotency_key: str
    ) -> SimulationDecision | None:
        return self.session.scalar(
            select(SimulationDecision).where(
                SimulationDecision.session_id == session_id,
                SimulationDecision.idempotency_key == idempotency_key,
            )
        )

    def get_replay_by_key(
        self, parent_session_id: UUID, idempotency_key: str
    ) -> SimulationSession | None:
        return self.session.scalar(
            select(SimulationSession).where(
                SimulationSession.parent_session_id == parent_session_id,
                SimulationSession.creation_idempotency_key == idempotency_key,
            )
        )

    def get_created_by_key(
        self, student_id: UUID, mission_version_id: UUID, idempotency_key: str
    ) -> SimulationSession | None:
        """Find an original session created by the same learner/key pair."""
        return self.session.scalar(
            select(SimulationSession).where(
                SimulationSession.student_id == student_id,
                SimulationSession.mission_version_id == mission_version_id,
                SimulationSession.parent_session_id.is_(None),
                SimulationSession.creation_idempotency_key == idempotency_key,
            )
        )

    def get_snapshot(self, session_id: UUID, turn_number: int) -> WorldStateSnapshot | None:
        return self.session.scalar(
            select(WorldStateSnapshot).where(
                WorldStateSnapshot.session_id == session_id,
                WorldStateSnapshot.turn_number == turn_number,
            )
        )

    def events_for_turn(self, session_id: UUID, turn_number: int) -> list[SimulationEvent]:
        query = (
            select(SimulationEvent)
            .where(
                SimulationEvent.session_id == session_id,
                SimulationEvent.turn_number == turn_number,
            )
            .order_by(SimulationEvent.created_at, SimulationEvent.id)
        )
        return list(self.session.scalars(query))

    def snapshots(self, session_id: UUID, limit: int, offset: int) -> list[WorldStateSnapshot]:
        query = (
            select(WorldStateSnapshot)
            .where(WorldStateSnapshot.session_id == session_id)
            .order_by(WorldStateSnapshot.turn_number)
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(query))

    def is_assigned_teacher(self, user_id: UUID, student_id: UUID) -> bool:
        teacher = aliased(Profile)
        query = (
            select(ClassMembership.id)
            .join(ClassModel, ClassModel.id == ClassMembership.class_id)
            .join(Profile, Profile.id == ClassMembership.student_id)
            .join(teacher, teacher.id == ClassModel.teacher_id)
            .where(
                ClassMembership.student_id == student_id,
                ClassMembership.membership_status == "active",
                ClassModel.teacher_id == user_id,
                teacher.role == "teacher",
                teacher.school_id == Profile.school_id,
                ClassModel.school_id == Profile.school_id,
            )
            .limit(1)
        )
        return self.session.scalar(query) is not None


class SandboxPhoneMappingRepository:
    """Resolve only the application's one-way sandbox phone reference."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_student_id(self, phone_ref: str) -> UUID | None:
        """Return the synthetic learner ID for a lowercase SHA-256 phone digest."""
        if re.fullmatch(r"[a-f0-9]{64}", phone_ref) is None:
            return None
        return self.session.scalar(
            select(SandboxPhoneMapping.student_id).where(SandboxPhoneMapping.phone_ref == phone_ref)
        )


class MobileSessionRepository:
    """Read and update provider session state without persisting callback text."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_provider_session_id(
        self, provider_session_id: str, *, for_update: bool = False
    ) -> MobileSession | None:
        query = select(MobileSession).where(
            MobileSession.provider_session_id == provider_session_id
        )
        if for_update:
            query = query.with_for_update()
        return self.session.scalar(query)

    def upsert(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID,
        current_menu: str,
        state: dict[str, Any],
        expires_at: datetime,
        last_request_key: str | None,
    ) -> MobileSession:
        """Insert callback state or update it while keeping its identity immutable."""
        if re.fullmatch(r"[a-f0-9]{64}", phone_ref) is None:
            raise ValueError("phone_ref must be a lowercase SHA-256 digest")
        statement = (
            pg_insert(MobileSession)
            .values(
                provider_session_id=provider_session_id,
                phone_ref=phone_ref,
                session_id=session_id,
                current_menu=current_menu,
                state=state,
                expires_at=expires_at,
                last_request_key=last_request_key,
            )
            .on_conflict_do_update(
                constraint="mobile_sessions_provider_session_id_key",
                set_={
                    "current_menu": current_menu,
                    "state": state,
                    "expires_at": expires_at,
                    "last_request_key": last_request_key,
                },
            )
            .returning(MobileSession)
        )
        return self.session.scalars(statement).one()


class DeliveryLogRepository:
    """Upsert SMS delivery status by provider ID and retain only a digest recipient ref."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_status(
        self,
        *,
        provider_message_id: str,
        status: str,
        recipient_ref: str,
        error_code: str | None = None,
        session_id: UUID | None = None,
        channel: str = "sms",
    ) -> DeliveryLog:
        """Persist provider status without accepting an unhashed phone number."""
        if re.fullmatch(r"[a-f0-9]{64}", recipient_ref) is None:
            raise ValueError("recipient_ref must be a lowercase SHA-256 digest")
        safe_error_code = (
            error_code if error_code and re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", error_code) else None
        )
        statement = (
            pg_insert(DeliveryLog)
            .values(
                session_id=session_id,
                channel=channel,
                recipient_ref=recipient_ref,
                provider_message_id=provider_message_id,
                status=status,
                error_code=safe_error_code,
            )
            .on_conflict_do_update(
                index_elements=[DeliveryLog.provider_message_id],
                index_where=DeliveryLog.provider_message_id.is_not(None),
                set_={
                    "status": status,
                    "error_code": safe_error_code,
                    "recipient_ref": recipient_ref,
                    "session_id": session_id,
                    "channel": channel,
                },
            )
            .returning(DeliveryLog)
        )
        return self.session.scalars(statement).one()

    def record_send_result(
        self,
        *,
        recipient_ref: str,
        status: str,
        provider_message_id: str | None = None,
        error_code: str | None = None,
        session_id: UUID | None = None,
    ) -> DeliveryLog:
        """Record an outbound SMS outcome using only a one-way recipient reference."""
        if re.fullmatch(r"[a-f0-9]{64}", recipient_ref) is None:
            raise ValueError("recipient_ref must be a lowercase SHA-256 digest")
        if provider_message_id:
            return self.upsert_status(
                provider_message_id=provider_message_id,
                status=status,
                recipient_ref=recipient_ref,
                error_code=error_code,
                session_id=session_id,
            )
        safe_error_code = (
            error_code if error_code and re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", error_code) else None
        )
        row = DeliveryLog(
            session_id=session_id,
            channel="sms",
            recipient_ref=recipient_ref,
            provider_message_id=None,
            status=status,
            error_code=safe_error_code,
        )
        self.session.add(row)
        self.session.flush()
        return row


class AIInteractionRepository:
    """Persist validated outputs only; callers must never pass prompt text or hidden reasoning."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def add(
        self,
        *,
        session_id: UUID,
        task_type: str,
        model_id: str,
        output: dict[str, Any],
        validation_status: str,
        latency_ms: int | None,
    ) -> AIInteraction:
        row = AIInteraction(
            id=uuid4(),
            session_id=session_id,
            task_type=task_type,
            model_id=model_id,
            output=output,
            validation_status=validation_status,
            latency_ms=latency_ms,
        )
        self.session.add(row)
        return row
