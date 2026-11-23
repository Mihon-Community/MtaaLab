"""Small repository objects keep SQL queries explicit and parameterized."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    AIInteraction,
    ClassMembership,
    ClassModel,
    Mission,
    Profile,
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

    def list_published(self) -> list[Mission]:
        query = select(Mission).where(Mission.status == "published").order_by(Mission.title)
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
