"""Public Africa's Talking callbacks with bounded validation and retry safety."""

from __future__ import annotations

import logging
import re
from hashlib import sha256
from typing import TypeVar

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ValidationError

from app.api.dependencies import get_simulation_gateway
from app.api.schemas import (
    SMSStatusCallbackRequest,
    USSDCallbackRequest,
    WebhookAckResponse,
)
from app.config import settings
from app.integrations.africas_talking.menu_state import allowed_phone, phone_reference
from app.integrations.africas_talking.ussd_callback import (
    WebhookStore,
    get_webhook_store,
    process_ussd_callback,
)
from app.security.webhook_rate_limit import enforce_webhook_rate_limit
from app.simulation.gateway import SimulationGateway

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks/africastalking", tags=["Africa's Talking"])
PayloadT = TypeVar("PayloadT", bound=BaseModel)
MAX_FORM_BYTES = 4096


async def _parse_form(
    request: Request,
    model: type[PayloadT],
    *,
    required_fields: set[str],
    allowed_fields: set[str],
) -> PayloadT:
    """Parse only bounded URL-encoded forms and map every validation error to HTTP 400."""
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise HTTPException(status_code=400, detail="Invalid callback fields")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_FORM_BYTES:
                raise HTTPException(status_code=400, detail="Invalid callback fields")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid callback fields") from error
    try:
        form = await request.form(max_fields=len(allowed_fields))
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid callback fields") from error

    items = list(form.multi_items())
    keys = [key for key, _ in items]
    fields = set(keys)
    if (
        len(keys) != len(fields)
        or not required_fields.issubset(fields)
        or not fields.issubset(allowed_fields)
    ):
        raise HTTPException(status_code=400, detail="Invalid callback fields")
    try:
        return model.model_validate(dict(items))
    except ValidationError as error:
        raise HTTPException(status_code=400, detail="Invalid callback fields") from error


def _caller_host(request: Request) -> str:
    client = request.client
    return client.host[:128] if client and client.host else "unknown-client"


def _safe_status(value: str) -> str:
    status_value = value.strip().lower()
    allowed = {
        "accepted",
        "delivered",
        "failed",
        "queued",
        "rejected",
        "sent",
        "success",
        "undelivered",
    }
    return status_value if status_value in allowed else "unknown"


def _safe_error_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = " ".join(value.strip().lower().split())
    known = {
        "blacklisted": "blacklisted",
        "delivery failure": "delivery_failure",
        "failed": "delivery_failure",
        "insufficient balance": "insufficient_balance",
        "invalid phone number": "invalid_phone_number",
        "invalid recipient": "invalid_recipient",
        "network error": "network_error",
        "service unavailable": "service_unavailable",
    }
    if normalized in known:
        return known[normalized]
    if re.fullmatch(r"(?:err|at|http)[_-]?[a-z0-9]{2,16}", normalized, flags=re.I):
        return re.sub(r"[^A-Za-z0-9_.-]", "_", normalized)[:64].lower()
    if re.fullmatch(r"[0-9]{3}", normalized):
        return f"provider_{normalized}"
    return None


def _safe_provider_id(value: str) -> str:
    """Keep logs single-line and bounded while retaining the provider identifier."""
    safe = re.sub(r"[^A-Za-z0-9_.:-]", "_", value)[:128]
    return safe or "unknown"


@router.post("/ussd", response_class=PlainTextResponse)
async def africastalking_ussd_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    store: WebhookStore = Depends(get_webhook_store),  # noqa: B008
    gateway: SimulationGateway = Depends(get_simulation_gateway),  # noqa: B008
) -> PlainTextResponse:
    """Continue or end one provider USSD screen; decisions use the shared engine."""
    callback = await _parse_form(
        request,
        USSDCallbackRequest,
        required_fields={"sessionId", "serviceCode", "phoneNumber", "text", "networkCode"},
        allowed_fields={"sessionId", "serviceCode", "phoneNumber", "text", "networkCode"},
    )
    phone_ref = phone_reference(callback.phone_number)
    enforce_webhook_rate_limit(
        f"client:{_caller_host(request)}",
        f"phone-ref:{phone_ref}",
    )

    configured_service_code = settings.at_ussd_service_code.strip()
    if configured_service_code and callback.service_code != configured_service_code:
        raise HTTPException(status_code=403, detail="Service code mismatch")

    if not allowed_phone(callback.phone_number, settings.at_allowed_phones):
        return PlainTextResponse("END This number is not allowed for the sandbox demo.")

    try:
        outcome = process_ussd_callback(
            callback,
            store=store,
            gateway=gateway,
            background_tasks=background_tasks,
            configured_phones=settings.at_allowed_phones,
        )
        return PlainTextResponse(outcome.response)
    except HTTPException:
        raise
    except Exception as error:
        logger.error(
            "Africa's Talking USSD callback failed",
            extra={"error_code": type(error).__name__},
        )
        return PlainTextResponse("END Sorry, something went wrong.")


@router.post("/sms-status", response_model=WebhookAckResponse)
async def africastalking_sms_status_callback(
    request: Request,
    store: WebhookStore = Depends(get_webhook_store),  # noqa: B008
) -> WebhookAckResponse:
    """Upsert an SMS delivery status by provider message ID."""
    callback = await _parse_form(
        request,
        SMSStatusCallbackRequest,
        required_fields={"id", "status"},
        allowed_fields={"id", "status", "phoneNumber", "networkCode", "failureReason"},
    )
    message_ref = sha256(callback.provider_message_id.encode("utf-8")).hexdigest()
    recipient_ref = phone_reference(callback.phone_number) if callback.phone_number else message_ref
    enforce_webhook_rate_limit(
        f"client:{_caller_host(request)}",
        f"phone-ref:{recipient_ref}",
    )

    status_value = _safe_status(callback.status)
    error_code = _safe_error_code(callback.failure_reason)
    try:
        store.save_sms_status(
            provider_message_id=callback.provider_message_id,
            status=status_value,
            recipient_ref=recipient_ref,
            error_code=error_code,
        )
    except Exception as error:
        logger.error(
            "Africa's Talking SMS status persistence failed",
            extra={"error_code": type(error).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to record callback",
        ) from error

    logger.info(
        "Africa's Talking SMS status recorded",
        extra={
            "provider_message_id": _safe_provider_id(callback.provider_message_id),
            "status": status_value,
            "error_code": error_code,
        },
    )
    return WebhookAckResponse(status="accepted")
