"""Assignment-scoped mission lookup query checks."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

from sqlalchemy.dialects import postgresql

from app.db.repositories import MissionRepository

USER_ID = UUID("20000000-0000-4000-8000-000000000020")
SCHOOL_ID = UUID("10000000-0000-4000-8000-000000000001")
MISSION_ID = UUID("40000000-0000-4000-8000-000000000001")


class FakeSession:
    def __init__(self, profile: SimpleNamespace) -> None:
        self.profile = profile
        self.statement = None

    def get(self, model, key):
        assert model.__name__ == "Profile"
        assert key == USER_ID
        return self.profile

    def scalars(self, statement):
        self.statement = statement
        return []

    def scalar(self, statement):
        self.statement = statement
        return None


def _sql(session: FakeSession) -> str:
    assert session.statement is not None
    return str(session.statement.compile(dialect=postgresql.dialect())).lower()


def test_student_mission_query_requires_active_class_membership() -> None:
    session = FakeSession(SimpleNamespace(id=USER_ID, role="student", school_id=SCHOOL_ID))

    assert MissionRepository(session).list_published(USER_ID) == []
    statement = _sql(session)

    assert "mission_assignments" in statement
    assert "class_memberships.student_id" in statement
    assert "class_memberships.membership_status" in statement
    assert "classes.school_id" in statement
    assert "'active'" in str(session.statement.compile().params.values()).lower()


def test_teacher_mission_query_is_limited_to_owned_school_classes() -> None:
    session = FakeSession(SimpleNamespace(id=USER_ID, role="teacher", school_id=SCHOOL_ID))

    assert MissionRepository(session).list_published(USER_ID) == []
    statement = _sql(session)

    assert "mission_assignments" in statement
    assert "classes.teacher_id" in statement
    assert "classes.school_id" in statement


def test_admin_mission_query_is_limited_to_their_school() -> None:
    session = FakeSession(SimpleNamespace(id=USER_ID, role="admin", school_id=SCHOOL_ID))

    assert MissionRepository(session).list_published(USER_ID) == []
    statement = _sql(session)

    assert "mission_assignments" in statement
    assert "classes.school_id" in statement
    assert "classes.teacher_id" not in statement


def test_mission_detail_requires_assignment_before_loading_published_record() -> None:
    session = FakeSession(SimpleNamespace(id=USER_ID, role="student", school_id=SCHOOL_ID))

    assert MissionRepository(session).get_published_for_user(MISSION_ID, USER_ID) is None
    statement = _sql(session)
    assert "mission_assignments.mission_id" in statement
