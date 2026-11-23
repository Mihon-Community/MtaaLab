"""FastAPI authentication dependency for Supabase bearer access tokens."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.repositories import ProfileRepository
from app.db.session import get_db_session
from app.security.jwt import (
    AuthenticationConfigurationError,
    PyJWKClientConnectionError,
    PyJWKClientError,
    verify_supabase_token,
)

bearer_scheme = HTTPBearer(auto_error=False)
ProfileRole = Literal["student", "teacher", "admin"]


@dataclass(frozen=True)
class CurrentUser:
    """Authorization context derived from the database profile row."""

    id: UUID
    role: ProfileRole
    school_id: UUID | None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),  # noqa: B008
    db: Session = Depends(get_db_session),  # noqa: B008
) -> CurrentUser:
    """Validate the JWT, then load authorization fields from `public.profiles`."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A bearer access token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = verify_supabase_token(credentials.credentials)
    except (AuthenticationConfigurationError, PyJWKClientConnectionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication verification is temporarily unavailable",
        ) from exc
    except (PyJWKClientError, jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token subject",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    profile = ProfileRepository(db).get_by_id(user_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active MtaaLab profile is associated with this account",
        )

    role = getattr(profile, "role", None)
    if role not in {"student", "teacher", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The account profile does not have an allowed role",
        )
    return CurrentUser(
        id=profile.id,
        role=role,
        school_id=getattr(profile, "school_id", None),
    )


__all__ = ["CurrentUser", "ProfileRole", "bearer_scheme", "get_current_user"]
