"""Sandbox SMS delivery with lazy SDK initialization and digest-only logging."""

from __future__ import annotations

import logging
import re
import threading
from hashlib import sha256
from typing import Any
from uuid import UUID

from app.api.schemas import SmsResult
from app.config import settings

logger = logging.getLogger(__name__)
_init_lock = threading.Lock()
_warning_lock = threading.Lock()
_missing_key_warning_emitted = False


def _warn_missing_key_once() -> None:
    global _missing_key_warning_emitted
    with _warning_lock:
        if not _missing_key_warning_emitted:
            logger.warning("Africa's Talking SMS is not configured")
            _missing_key_warning_emitted = True


def _safe_error_code(value: Any) -> str | None:
    """Keep only a known error label or strict provider-code token."""
    if value is None:
        return None
    candidate = str(value).strip()
    normalized = candidate.lower()
    known = {
        "failed": "provider_rejected",
        "invalid phone number": "invalid_phone_number",
        "invalid_phone_number": "invalid_phone_number",
        "invalid recipient": "invalid_recipient",
        "invalid_recipient": "invalid_recipient",
        "insufficient balance": "insufficient_balance",
        "insufficient_balance": "insufficient_balance",
        "network error": "network_error",
        "network_error": "network_error",
        "service unavailable": "service_unavailable",
        "service_unavailable": "service_unavailable",
        "rejected": "provider_rejected",
        "provider_rejected": "provider_rejected",
    }
    if normalized in known:
        return known[normalized]
    if re.fullmatch(r"(?:err|at|http)[_-]?[a-z0-9]{2,16}|[0-9]{3}", candidate, flags=re.I):
        return candidate.lower()
    return None


def _safe_provider_message_id(value: Any) -> str | None:
    """Bound provider IDs and remove whitespace/control characters before exposure."""
    if value is None:
        return None
    safe = re.sub(r"[^A-Za-z0-9_.:-]", "_", str(value))[:128]
    return safe or None


def _safe_sms_text(message: str) -> str:
    """Remove common direct identifiers and enforce the single-segment SMS limit."""
    value = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "", message, flags=re.I)
    value = re.sub(r"\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b", "", value, flags=re.I)
    value = re.sub(r"\+?\d[\d\s().-]{6,}\d", "", value)
    value = re.sub(r"\bgrade\s+\w+\b", "", value, flags=re.I)
    value = " ".join(value.split())
    return value if len(value) <= 160 else f"{value[:157].rstrip()}..."


def _persist_delivery(
    *,
    result: SmsResult,
    recipient_ref: str,
    session_id: UUID | None,
) -> None:
    """Persist provider outcome using a new request-independent SQLAlchemy session."""
    try:
        from app.db.repositories import DeliveryLogRepository
        from app.db.session import get_session_factory

        with get_session_factory()() as db:
            DeliveryLogRepository(db).record_send_result(
                status=result.status,
                recipient_ref=recipient_ref,
                provider_message_id=result.provider_message_id,
                error_code=result.error_code,
                session_id=session_id,
            )
            db.commit()
    except Exception as error:
        logger.error(
            "Africa's Talking delivery log persistence failed",
            extra={"error_code": type(error).__name__},
        )


def _provider_result(response: Any) -> SmsResult:
    """Translate the SDK response into the small public result contract."""
    if not isinstance(response, dict):
        return SmsResult(status="failed", error_code="invalid_provider_response")
    data = response.get("SMSMessageData")
    recipients = data.get("Recipients") if isinstance(data, dict) else None
    if not isinstance(recipients, list) or not recipients or not isinstance(recipients[0], dict):
        return SmsResult(status="failed", error_code="invalid_provider_response")

    recipient = recipients[0]
    message_id = _safe_provider_message_id(recipient.get("messageId"))
    code = str(recipient.get("statusCode") or "")
    provider_status = str(recipient.get("status") or "").strip().lower()
    if message_id and (code in {"100", "101", "102"} or provider_status in {"success", "queued"}):
        return SmsResult(status="sent", provider_message_id=message_id)
    return SmsResult(
        status="failed",
        provider_message_id=message_id,
        error_code=_safe_error_code(code or provider_status) or "provider_rejected",
    )


def send_sms(
    recipient: str,
    message: str,
    *,
    session_id: UUID | None = None,
    recipient_ref: str | None = None,
) -> SmsResult:
    """Send one short sandbox SMS; never initialize the SDK at import time."""
    phone = recipient.strip()
    safe_recipient_ref = recipient_ref or sha256(phone.encode("utf-8")).hexdigest()
    if not phone or len(phone) > 32:
        result = SmsResult(status="failed", error_code="invalid_recipient")
        _persist_delivery(result=result, recipient_ref=safe_recipient_ref, session_id=session_id)
        return result

    safe_message = _safe_sms_text(message)
    if not safe_message:
        result = SmsResult(status="failed", error_code="empty_message")
        _persist_delivery(result=result, recipient_ref=safe_recipient_ref, session_id=session_id)
        return result

    api_key = settings.at_api_key
    if not api_key:
        _warn_missing_key_once()
        result = SmsResult(status="not_configured")
        _persist_delivery(result=result, recipient_ref=safe_recipient_ref, session_id=session_id)
        return result

    try:
        with _init_lock:
            import africastalking

            africastalking.initialize(settings.at_username or "sandbox", api_key)
            sms = africastalking.SMS
        response = sms.send(safe_message, [phone])
        result = _provider_result(response)
    except Exception as error:
        result = SmsResult(
            status="failed",
            error_code=_safe_error_code(type(error).__name__) or "provider_error",
        )

    logger.info(
        "Africa's Talking SMS attempt finished",
        extra={
            "provider_message_id": result.provider_message_id,
            "status": result.status,
            "error_code": result.error_code,
        },
    )
    _persist_delivery(result=result, recipient_ref=safe_recipient_ref, session_id=session_id)
    return result


def send_mission_sms(
    recipient: str,
    mission: str = "Mtoni",
    summary: str = "Your decisions are saved. Review the report when online.",
    *,
    session_id: UUID | None = None,
    recipient_ref: str | None = None,
) -> SmsResult:
    """Send a concise mission-completion summary without grades or learner IDs."""
    mission_name = mission.strip().lower()
    safe_mission = "Mtoni" if mission_name in {"mtoni", "mtoni water resilience"} else "Mtoni"
    safe_summary = _safe_sms_text(summary)
    message = _safe_sms_text(f"MtaaLab: {safe_mission} complete. {safe_summary}")
    return send_sms(
        recipient,
        message,
        session_id=session_id,
        recipient_ref=recipient_ref,
    )
