"""Cryptographic helpers for feature-phone links and explicit SMS consent."""

from __future__ import annotations

import hashlib
import hmac
import re

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _normalize_phone(phone_number: str) -> str:
    candidate = phone_number.strip()
    if not re.fullmatch(r"\+?[1-9][0-9]{5,14}", candidate):
        raise ValueError("Phone number must be a valid international number")
    digits = candidate.removeprefix("+")
    return f"+{digits}"


def phone_hmac_reference(phone_number: str) -> str:
    """Produce a keyed, stable lookup digest; fail closed without its secret."""
    key = (settings.phone_hmac_secret or "").strip()
    if len(key) < 32:
        raise ValueError("PHONE_HMAC_SECRET must contain at least 32 characters")
    return hmac.new(
        key.encode(), _normalize_phone(phone_number).encode(), hashlib.sha256
    ).hexdigest()


def encrypt_phone(phone_number: str) -> str:
    """Encrypt an E.164 phone address for opted-in outbound nudges."""
    key = (settings.phone_encryption_key or "").strip().encode()
    if not key:
        raise ValueError("PHONE_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key).encrypt(_normalize_phone(phone_number).encode()).decode()
    except (ValueError, TypeError) as error:
        raise ValueError("PHONE_ENCRYPTION_KEY is invalid") from error


def decrypt_phone(ciphertext: str) -> str:
    """Decrypt only for an authorized outbound operation."""
    key = (settings.phone_encryption_key or "").strip().encode()
    if not key:
        raise ValueError("PHONE_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key).decrypt(ciphertext.encode()).decode()
    except (ValueError, TypeError, InvalidToken) as error:
        raise ValueError("Stored phone address cannot be decrypted") from error
