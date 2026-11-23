"""Supabase access-token verification using the project's public JWKS endpoint."""

from __future__ import annotations

from functools import lru_cache
from typing import Any
from urllib.parse import urlsplit

import jwt
from jwt import PyJWKClient, PyJWKClientConnectionError, PyJWKClientError
from pydantic_settings import BaseSettings

from app.config import settings

ALLOWED_ALGORITHMS = ("ES256", "RS256", "EdDSA")
EXPECTED_AUDIENCE = "authenticated"
JWKS_CACHE_SECONDS = 300
JWKS_TIMEOUT_SECONDS = 5


class AuthenticationConfigurationError(RuntimeError):
    """Raised when the server cannot derive a safe Supabase JWT configuration."""


def resolve_jwks_url(config: BaseSettings = settings) -> str:
    """Return a configured JWKS URL or derive it from SUPABASE_URL."""
    configured = getattr(config, "supabase_jwks_url", None)
    project_url = getattr(config, "supabase_url", None)
    if configured:
        jwks_url = str(configured).strip()
    elif project_url:
        base = str(project_url).rstrip("/")
        suffix = "/.well-known/jwks.json"
        jwks_url = f"{base}{suffix}" if base.endswith("/auth/v1") else f"{base}/auth/v1{suffix}"
    else:
        raise AuthenticationConfigurationError("Supabase JWKS URL is not configured")

    parsed = urlsplit(jwks_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise AuthenticationConfigurationError("Supabase JWKS URL must use HTTPS")
    return jwks_url


def resolve_issuer(config: BaseSettings = settings) -> str:
    """Return the canonical Supabase Auth issuer for the configured project."""
    project_url = getattr(config, "supabase_url", None)
    if project_url:
        base = str(project_url).rstrip("/")
        return base if base.endswith("/auth/v1") else f"{base}/auth/v1"

    # Supporting only a JWKS URL is useful for deployments that configure that
    # value directly. The issuer is the path prefix before Supabase's JWKS suffix.
    jwks_url = resolve_jwks_url(config)
    suffix = "/.well-known/jwks.json"
    if not jwks_url.endswith(suffix):
        raise AuthenticationConfigurationError("Cannot derive issuer from JWKS URL")
    return jwks_url[: -len(suffix)].rstrip("/")


@lru_cache(maxsize=8)
def get_jwks_client(jwks_url: str) -> PyJWKClient:
    """Cache a bounded-timeout JWKS client per project URL."""
    return PyJWKClient(
        jwks_url,
        cache_keys=True,
        max_cached_keys=16,
        cache_jwk_set=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def verify_supabase_token(
    token: str,
    *,
    config: BaseSettings = settings,
    jwks_client: PyJWKClient | Any | None = None,
) -> dict[str, Any]:
    """Verify signature and required Supabase claims; HS256 is deliberately rejected.

    Supabase projects using only the legacy shared HS256 secret do not expose public
    JWKS keys. This implementation intentionally rejects HS256 instead of keeping a
    shared signing secret in the backend process.
    """
    jwks_url = resolve_jwks_url(config)
    issuer = resolve_issuer(config)
    client = jwks_client or get_jwks_client(jwks_url)
    signing_key = client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=list(ALLOWED_ALGORITHMS),
        audience=EXPECTED_AUDIENCE,
        issuer=issuer,
        options={"require": ["exp", "iss", "aud", "sub", "role"]},
    )
    if claims.get("role") != EXPECTED_AUDIENCE:
        raise jwt.InvalidTokenError("JWT role is not authenticated")
    return claims


__all__ = [
    "ALLOWED_ALGORITHMS",
    "AuthenticationConfigurationError",
    "EXPECTED_AUDIENCE",
    "get_jwks_client",
    "resolve_issuer",
    "resolve_jwks_url",
    "verify_supabase_token",
    "PyJWKClientConnectionError",
    "PyJWKClientError",
]
