"""Connection factory for the backend's single PostgreSQL access path."""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def normalize_database_url(database_url: str) -> URL:
    """Select psycopg 3 explicitly while preserving credentials out of logs."""
    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    return url


def build_engine(database_url: str) -> Engine:
    """Create a pre-pinged pool and disable prepared statements for transaction pooling."""
    url = normalize_database_url(database_url)
    connect_args = {"prepare_threshold": None} if url.port == 6543 else {}
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return the process-wide database engine, failing clearly if unconfigured."""
    if not settings.supabase_db_url:
        raise RuntimeError("SUPABASE_DB_URL is required for database operations")
    return build_engine(settings.supabase_db_url)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    """Return the process-wide SQLAlchemy session factory."""
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency yielding one request-scoped SQLAlchemy Session."""
    with get_session_factory()() as db:
        try:
            yield db
        finally:
            if db.in_transaction():
                db.rollback()
