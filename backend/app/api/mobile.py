"""Teacher-issued, pseudonymous access for feature-phone learners."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.schemas import (
    MobileJoinCodeRequest,
    MobileJoinCodeResponse,
    MobileRosterClass,
    MobileRosterLearner,
    MobileRosterResponse,
)
from app.config import settings
from app.db.models import ClassMembership, ClassModel, MobileJoinCode, Profile
from app.db.session import get_db_session

router = APIRouter(prefix="/api/mobile", tags=["mobile access"])
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_TTL = timedelta(days=7)


@router.get("/classes", response_model=MobileRosterResponse)
def list_mobile_roster(
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db_session),  # noqa: B008
) -> MobileRosterResponse:
    """List only the caller's school-scoped classes and active student roster."""
    if user.role not in {"teacher", "admin"} or user.school_id is None:
        raise HTTPException(status_code=403, detail="A school teacher account is required")

    query = (
        select(ClassModel.id, ClassModel.name, Profile.id, Profile.display_name)
        .join(ClassMembership, ClassMembership.class_id == ClassModel.id)
        .join(Profile, Profile.id == ClassMembership.student_id)
        .where(
            ClassModel.school_id == user.school_id,
            ClassMembership.membership_status == "active",
            Profile.school_id == user.school_id,
            Profile.role == "student",
        )
    )
    if user.role == "teacher":
        query = query.where(ClassModel.teacher_id == user.id)

    grouped: dict[UUID, MobileRosterClass] = {}
    for class_id, class_name, student_id, display_name in db.execute(
        query.order_by(ClassModel.name, Profile.display_name, Profile.id)
    ).all():
        roster_class = grouped.setdefault(
            class_id,
            MobileRosterClass(class_id=class_id, name=class_name, learners=[]),
        )
        roster_class.learners.append(
            MobileRosterLearner(student_id=student_id, display_name=display_name)
        )
    return MobileRosterResponse(classes=list(grouped.values()))


def _digest_code(code: str) -> str:
    pepper = (settings.mobile_join_code_pepper or "").strip()
    if len(pepper) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mobile join codes are not configured",
        )
    return hmac.new(pepper.encode(), code.encode("ascii"), hashlib.sha256).hexdigest()


@router.post("/join-codes", response_model=MobileJoinCodeResponse, status_code=201)
def create_join_code(
    request: MobileJoinCodeRequest,
    user: CurrentUser = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db_session),  # noqa: B008
) -> MobileJoinCodeResponse:
    """Issue one short-lived code for a learner already enrolled in a class."""
    if user.role not in {"teacher", "admin"} or user.school_id is None:
        raise HTTPException(status_code=403, detail="A school teacher account is required")

    class_query = select(ClassModel).where(
        ClassModel.id == request.class_id,
        ClassModel.school_id == user.school_id,
    )
    if user.role == "teacher":
        class_query = class_query.where(ClassModel.teacher_id == user.id)
    selected_class = db.scalar(class_query)
    if selected_class is None:
        raise HTTPException(status_code=404, detail="Class not found")

    learner_is_member = db.scalar(
        select(ClassMembership.id)
        .join(Profile, Profile.id == ClassMembership.student_id)
        .where(
            ClassMembership.class_id == selected_class.id,
            ClassMembership.student_id == request.student_id,
            ClassMembership.membership_status == "active",
            Profile.role == "student",
            Profile.school_id == user.school_id,
        )
        .limit(1)
    )
    if learner_is_member is None:
        raise HTTPException(status_code=404, detail="Learner not found in this class")

    code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(10))
    expires_at = datetime.now(UTC) + _CODE_TTL
    db.add(
        MobileJoinCode(
            id=uuid4(),
            class_id=selected_class.id,
            student_id=request.student_id,
            code_digest=_digest_code(code),
            created_by=user.id,
            expires_at=expires_at,
        )
    )
    db.commit()
    return MobileJoinCodeResponse(
        join_code=code,
        expires_at=expires_at.isoformat(),
        message="Give this one-time code to the learner. It is shown only once.",
    )
