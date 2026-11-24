"""Teacher-only roster scope and one-time learner code issuance."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.auth import CurrentUser
from app.api.mobile import create_join_code, list_mobile_roster
from app.api.schemas import MobileJoinCodeRequest


class FakeDatabase:
    def __init__(self, *, scalar_values=None, rows=None) -> None:
        self.scalar_values = list(scalar_values or [])
        self.rows = list(rows or [])
        self.added = []
        self.committed = False

    def scalar(self, _query):
        return self.scalar_values.pop(0) if self.scalar_values else None

    def execute(self, _query):
        return SimpleNamespace(all=lambda: self.rows)

    def add(self, value) -> None:
        self.added.append(value)

    def commit(self) -> None:
        self.committed = True


def test_teacher_can_issue_single_use_code_to_active_class_learner(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "mobile_join_code_pepper", "test-mobile-code-pepper-at-least-32")
    teacher_id, school_id, class_id, student_id = (uuid4() for _ in range(4))
    selected_class = SimpleNamespace(id=class_id)
    db = FakeDatabase(scalar_values=[selected_class, uuid4()])

    response = create_join_code(
        MobileJoinCodeRequest(class_id=class_id, student_id=student_id),
        user=CurrentUser(id=teacher_id, role="teacher", school_id=school_id),
        db=db,
    )

    assert len(response.join_code) == 10
    assert response.expires_at
    assert db.committed
    assert len(db.added) == 1
    assert db.added[0].student_id == student_id
    assert db.added[0].class_id == class_id
    assert response.join_code not in db.added[0].code_digest


def test_non_teacher_cannot_read_mobile_roster_or_issue_a_code() -> None:
    school_id, student_id = uuid4(), uuid4()
    student = CurrentUser(id=student_id, role="student", school_id=school_id)
    with pytest.raises(HTTPException) as roster_error:
        list_mobile_roster(student, FakeDatabase())
    assert roster_error.value.status_code == 403

    with pytest.raises(HTTPException) as issue_error:
        create_join_code(
            MobileJoinCodeRequest(class_id=uuid4(), student_id=uuid4()),
            user=student,
            db=FakeDatabase(),
        )
    assert issue_error.value.status_code == 403


def test_roster_returns_only_selected_school_rows() -> None:
    school_class, student_id = uuid4(), uuid4()
    db = FakeDatabase(rows=[(school_class, "Science club", student_id, "Learner 12")])
    result = list_mobile_roster(CurrentUser(id=uuid4(), role="teacher", school_id=uuid4()), db)
    assert len(result.classes) == 1
    assert result.classes[0].class_id == school_class
    assert result.classes[0].learners[0].student_id == student_id
