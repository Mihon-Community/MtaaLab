"""Owner and class-assignment checks for persisted simulation sessions."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.db.models import ClassMembership, ClassModel, SimulationSession


def can_access_session(db: Session, user: CurrentUser, session_row: SimulationSession) -> bool:
    """Return whether this student owns the session or a teacher is assigned to them."""
    if user.role == "student":
        return session_row.student_id == user.id

    if user.role != "teacher" or user.school_id is None:
        return False

    assigned_membership_id = db.scalar(
        select(ClassMembership.id)
        .join(ClassModel, ClassModel.id == ClassMembership.class_id)
        .where(
            ClassMembership.student_id == session_row.student_id,
            ClassMembership.membership_status == "active",
            ClassModel.teacher_id == user.id,
            ClassModel.school_id == user.school_id,
        )
        .limit(1)
    )
    return assigned_membership_id is not None


def get_authorized_session(db: Session, user: CurrentUser, session_id: UUID) -> SimulationSession:
    """Load an authorized session, returning 404 for absent and foreign sessions alike."""
    session_row = db.get(SimulationSession, session_id)
    if session_row is None or not can_access_session(db, user, session_row):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Simulation session not found",
        )
    return session_row


__all__ = ["can_access_session", "get_authorized_session"]
