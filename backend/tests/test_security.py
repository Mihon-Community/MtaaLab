"""Supabase JWT validation, identity loading, and owner-scoped authorization tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.api import auth
from app.api.dependencies import get_simulation_gateway
from app.config import settings
from app.main import app
from app.security.jwt import verify_supabase_token
from app.simulation.service import SessionNotFoundError, SimulationService

TEST_ISSUER = "https://mtaalab-test.supabase.co/auth/v1"
TEST_SUBJECT = UUID("00000000-0000-4000-8000-000000000102")


class LocalJWKSClient:
    """Return a locally generated public key without network access."""

    def __init__(self, public_key: object) -> None:
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        assert jwt.get_unverified_header(token)["kid"] == "test-signing-key"
        return SimpleNamespace(key=self.public_key)


@pytest.fixture
def signing_material() -> tuple[object, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


def make_token(private_key: object, **overrides: object) -> str:
    claims: dict[str, object] = {
        "iss": TEST_ISSUER,
        "aud": "authenticated",
        "sub": str(TEST_SUBJECT),
        "role": "authenticated",
        "iat": int(datetime.now(UTC).timestamp()),
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
    }
    claims.update(overrides)
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "test-signing-key"},
    )


def auth_config() -> SimpleNamespace:
    return SimpleNamespace(
        supabase_url="https://mtaalab-test.supabase.co",
        supabase_jwks_url=None,
    )


def test_valid_supabase_jwt_is_verified(signing_material: tuple[object, object]) -> None:
    private_key, public_key = signing_material
    claims = verify_supabase_token(
        make_token(private_key),
        config=auth_config(),
        jwks_client=LocalJWKSClient(public_key),
    )
    assert claims["sub"] == str(TEST_SUBJECT)
    assert claims["aud"] == "authenticated"


def test_expired_supabase_jwt_is_rejected(
    signing_material: tuple[object, object],
) -> None:
    private_key, public_key = signing_material
    expired = int((datetime.now(UTC) - timedelta(minutes=1)).timestamp())
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_supabase_token(
            make_token(private_key, exp=expired),
            config=auth_config(),
            jwks_client=LocalJWKSClient(public_key),
        )


def test_wrong_audience_is_rejected(signing_material: tuple[object, object]) -> None:
    private_key, public_key = signing_material
    with pytest.raises(jwt.InvalidAudienceError):
        verify_supabase_token(
            make_token(private_key, aud="anon"),
            config=auth_config(),
            jwks_client=LocalJWKSClient(public_key),
        )


def test_wrong_issuer_is_rejected(signing_material: tuple[object, object]) -> None:
    private_key, public_key = signing_material
    with pytest.raises(jwt.InvalidIssuerError):
        verify_supabase_token(
            make_token(private_key, iss="https://attacker.example/auth/v1"),
            config=auth_config(),
            jwks_client=LocalJWKSClient(public_key),
        )


def test_missing_bearer_token_returns_401() -> None:
    with pytest.raises(HTTPException) as result:
        auth.get_current_user(credentials=None, db=object())
    assert result.value.status_code == 401
    assert result.value.headers == {"WWW-Authenticate": "Bearer"}


def test_current_user_uses_database_profile_for_role(monkeypatch: pytest.MonkeyPatch) -> None:
    class Profile:
        id = TEST_SUBJECT
        role = "student"
        school_id = uuid4()

    class FakeRepository:
        def __init__(self, db: object) -> None:
            self.db = db

        def get_by_id(self, user_id: UUID) -> Profile | None:
            assert user_id == TEST_SUBJECT
            return Profile()

    monkeypatch.setattr(auth, "verify_supabase_token", lambda _token: {"sub": str(TEST_SUBJECT)})
    monkeypatch.setattr(auth, "ProfileRepository", FakeRepository)
    context = auth.get_current_user(
        credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-token"),
        db=object(),
    )
    assert context.id == TEST_SUBJECT
    assert context.role == "student"
    assert context.school_id is not None


def test_student_cannot_access_another_students_session_through_api() -> None:
    user = auth.CurrentUser(id=TEST_SUBJECT, role="student", school_id=uuid4())
    foreign_session = SimpleNamespace(student_id=uuid4())

    class FakeDatabase:
        scalar_calls = 0

        def scalar(self, _query):
            self.scalar_calls += 1
            return foreign_session if self.scalar_calls == 1 else None

    fake_db = FakeDatabase()
    service = SimulationService(fake_db)  # type: ignore[arg-type]
    assert isinstance(service, SimulationService)
    app.dependency_overrides[auth.get_current_user] = lambda: user
    app.dependency_overrides[get_simulation_gateway] = lambda: service
    try:
        response = TestClient(app).get(f"/api/simulations/{uuid4()}/state")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json() == {"detail": "Resource not found"}
    with pytest.raises(SessionNotFoundError):
        service.get_state(uuid4(), user.id)


@pytest.mark.integration
@pytest.mark.skipif(not settings.supabase_db_url, reason="SUPABASE_DB_URL is not configured")
def test_anon_role_cannot_insert_into_rls_protected_tables() -> None:
    """The anon database role cannot write even a synthetic school fixture."""
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import DBAPIError, OperationalError

    assert settings.supabase_db_url
    database_url = make_url(settings.supabase_db_url)
    if database_url.drivername == "postgresql":
        database_url = database_url.set(drivername="postgresql+psycopg")
    engine = create_engine(database_url, pool_pre_ping=True, hide_parameters=True)
    try:
        try:
            with engine.connect() as connection:
                transaction = connection.begin()
                try:
                    connection.exec_driver_sql("SET LOCAL ROLE anon")
                    with pytest.raises(DBAPIError, match="row-level security|permission denied"):
                        connection.execute(
                            text(
                                "INSERT INTO public.schools (name, country, timezone) "
                                "VALUES (:name, :country, :timezone)"
                            ),
                            {
                                "name": f"rls-test-{uuid4()}",
                                "country": "Kenya",
                                "timezone": "Africa/Nairobi",
                            },
                        )
                finally:
                    transaction.rollback()
        except OperationalError:
            pytest.skip("Direct Supabase database connection unavailable; DB-02 unverified")
    finally:
        engine.dispose()
