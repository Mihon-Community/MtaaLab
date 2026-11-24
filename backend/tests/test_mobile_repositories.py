"""Database repository contract tests for callback state and delivery idempotency."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy.dialects import postgresql

from app.db.repositories import (
    DeliveryLogRepository,
    MobileSessionRepository,
    SandboxPhoneMappingRepository,
)

PHONE_REF = "a" * 64
STUDENT_ID = UUID("20000000-0000-4000-8000-000000000020")
SESSION_ID = UUID("10000000-0000-4000-8000-000000000010")


class FakeScalarResult:
    def __init__(self, row=None) -> None:
        self.row = row

    def one(self):
        return self.row


class FakeSession:
    def __init__(self, *, scalar_result=None, returned_row=None) -> None:
        self.scalar_result = scalar_result
        self.returned_row = returned_row
        self.statement = None
        self.added = []

    def scalar(self, statement):
        self.statement = statement
        return self.scalar_result

    def scalars(self, statement):
        self.statement = statement
        return FakeScalarResult(self.returned_row)

    def add(self, row):
        self.added.append(row)

    def flush(self):
        return None


def test_sandbox_mapping_lookup_accepts_only_sha256_reference() -> None:
    session = FakeSession(scalar_result=STUDENT_ID)
    repository = SandboxPhoneMappingRepository(session)

    assert repository.get_student_id(PHONE_REF) == STUDENT_ID
    assert "sandbox_phone_mappings.phone_ref" in str(
        session.statement.compile(dialect=postgresql.dialect())
    )

    untouched = FakeSession()
    assert SandboxPhoneMappingRepository(untouched).get_student_id("+254700000000") is None
    assert untouched.statement is None


def test_mobile_session_can_be_locked_and_upsert_preserves_owner_identity() -> None:
    row = SimpleNamespace(provider_session_id="provider-1")
    session = FakeSession(scalar_result=row, returned_row=row)
    repository = MobileSessionRepository(session)

    assert repository.get_by_provider_session_id("provider-1", for_update=True) is row
    assert "FOR UPDATE" in str(session.statement.compile(dialect=postgresql.dialect()))

    saved = repository.upsert(
        provider_session_id="provider-1",
        phone_ref=PHONE_REF,
        session_id=SESSION_ID,
        current_menu="confirm",
        state={"last_response": "CON Continue"},
        expires_at=datetime.now(UTC),
        last_request_key="request-hash",
    )
    statement = str(session.statement.compile(dialect=postgresql.dialect()))

    assert saved is row
    assert "ON CONFLICT ON CONSTRAINT mobile_sessions_provider_session_id_key" in statement
    assert "SET current_menu" in statement
    assert "phone_ref = excluded.phone_ref" not in statement
    assert "session_id = excluded.session_id" not in statement


def test_sms_replay_explicitly_replaces_its_simulation_session() -> None:
    session = FakeSession(returned_row=SimpleNamespace(provider_session_id="sms:ref"))

    MobileSessionRepository(session).upsert(
        provider_session_id="sms:ref",
        phone_ref=PHONE_REF,
        session_id=SESSION_ID,
        current_menu="main",
        state={"screen": "main"},
        expires_at=datetime.now(UTC),
        last_request_key="request-hash",
        replace_session_id=True,
    )

    statement = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "SET session_id =" in statement
    assert "current_menu =" in statement
    assert "phone_ref = excluded.phone_ref" not in statement


def test_mobile_session_rejects_raw_phone_values() -> None:
    session = FakeSession()

    with pytest.raises(ValueError, match="SHA-256"):
        MobileSessionRepository(session).upsert(
            provider_session_id="provider-1",
            phone_ref="+254700000000",
            session_id=SESSION_ID,
            current_menu="main",
            state={},
            expires_at=datetime.now(UTC),
            last_request_key=None,
        )

    assert session.statement is None


def test_delivery_callback_uses_partial_unique_upsert_and_sanitizes_error_code() -> None:
    row = SimpleNamespace(status="Delivered")
    session = FakeSession(returned_row=row)

    saved = DeliveryLogRepository(session).upsert_status(
        provider_message_id="provider-message-1",
        status="Delivered",
        recipient_ref=PHONE_REF,
        error_code="Failure detail with +254700000000",
        session_id=SESSION_ID,
    )
    compiled = session.statement.compile(dialect=postgresql.dialect())
    statement = str(compiled)

    assert saved is row
    assert "ON CONFLICT (provider_message_id) WHERE provider_message_id IS NOT NULL" in statement
    assert "error_code" in compiled.params
    assert compiled.params["error_code"] is None


def test_delivery_repository_rejects_unhashed_phone_values() -> None:
    session = FakeSession()

    with pytest.raises(ValueError, match="SHA-256"):
        DeliveryLogRepository(session).upsert_status(
            provider_message_id="provider-message-1",
            status="Delivered",
            recipient_ref="+254700000000",
        )

    assert session.statement is None


def test_outbound_send_result_stores_only_recipient_digest() -> None:
    session = FakeSession()
    row = DeliveryLogRepository(session).record_send_result(
        recipient_ref=PHONE_REF,
        status="not_configured",
        error_code="api_key_missing",
    )

    assert row in session.added
    assert row.recipient_ref == PHONE_REF
    assert row.provider_message_id is None
    assert row.error_code == "api_key_missing"
