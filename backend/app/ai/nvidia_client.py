"""Small, bounded OpenAI-compatible client for the configured NVIDIA NIM endpoint."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Generic, Literal, TypeVar

from openai import OpenAI
from pydantic import ValidationError

from app.config import settings

T = TypeVar("T")
RecordInteraction = Callable[..., None]
_NUMBER_WORDS = (
    "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|"
    "fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|"
    "fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|"
    "half|quarter|twice|double|triple"
)
_NUMBER_PHRASE = rf"(?:{_NUMBER_WORDS})(?:[\s-]+(?:{_NUMBER_WORDS}))*"
_NUMBERED_QUANTITY = re.compile(
    rf"\b{_NUMBER_PHRASE}\s+(?:water\s+)?(?:units?|credits?|lit(?:er|re)s?|gallons?|"
    r"percent(?:age)?|weeks?|turns?|households?|families|people)\b",
    re.IGNORECASE,
)
_NUMERIC_STATE_CLAIM = re.compile(
    rf"\b(?:reservoir(?:\s+level)?|water|budget|crop(?:\s+health)?|wellbeing|"
    rf"service(?:\s+level)?|demand|leakage|storage|withdrawal|overflow)\b"
    rf"[^.!?]{{0,60}}\b(?:fell|dropped|rose|increased|decreased|changed|reached|"
    rf"remains?|is|was|now|by|to|at)\s+(?:by\s+|to\s+|at\s+)?{_NUMBER_PHRASE}\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class AIResult(Generic[T]):
    """Validated task output plus safe status and audit metadata (never prompts)."""

    output: T
    status: Literal["available", "ai_unavailable"]
    source: Literal["nvidia", "fallback"]
    model_id: str
    latency_ms: int
    validation_status: str


class AIUnavailableError(RuntimeError):
    """Raised when the configured model cannot return usable content."""


def create_nvidia_client(*, timeout: float = 20.0) -> OpenAI | None:
    """Build a bounded client only when a backend API key is configured."""
    if not settings.nvidia_api_key:
        return None
    return OpenAI(
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key,
        timeout=timeout,
        max_retries=0,
    )


def configured_model() -> str:
    """Return the environment-selected model ID; never hard-code a model in task code."""
    return settings.nvidia_model


def complete_json(
    system_prompt: str,
    user_prompt: str,
    client: Any | None = None,
    *,
    timeout: float = 20.0,
    max_tokens: int = 350,
    temperature: float = 0.3,
    extra_body: dict[str, Any] | None = None,
) -> str:
    """Call NIM with bounded settings and return raw content for strict parsing."""
    nvidia = client if client is not None else create_nvidia_client(timeout=timeout)
    if nvidia is None:
        raise AIUnavailableError("NVIDIA API key is not configured")
    try:
        request: dict[str, Any] = {
            "model": configured_model(),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if extra_body is not None:
            request["extra_body"] = extra_body
        response = nvidia.chat.completions.create(**request)
    except Exception as exc:
        # Do not echo provider exceptions: they may contain request details.
        raise AIUnavailableError(type(exc).__name__) from None
    content = response.choices[0].message.content if response.choices else None
    if not isinstance(content, str) or not content.strip():
        raise AIUnavailableError("NVIDIA returned no content")
    return content


def parse_json_object(content: str) -> dict[str, Any]:
    """Parse strict JSON, allowing one conventional fenced JSON block."""
    candidate = content.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", candidate, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        candidate = fenced.group(1).strip()
    try:
        parsed = json.loads(candidate)
    except (json.JSONDecodeError, TypeError):
        raise ValueError("invalid_json") from None
    if not isinstance(parsed, dict):
        raise ValueError("json_object_required")
    return parsed


def contains_state_change_fields(value: Any) -> bool:
    """Reject model attempts to return authoritative simulation numbers."""
    forbidden = {
        "reservoir_level",
        "reservoir_capacity",
        "rainfall_inflow",
        "inflow",
        "demand_by_sector",
        "unmet_demand_by_sector",
        "leakage",
        "budget_remaining",
        "service_levels",
        "crop_health",
        "wellbeing",
        "withdrawals_by_sector",
        "water_accounting",
        "next_state",
        "updated_state",
        "state_changes",
        "numeric_changes",
    }
    if isinstance(value, dict):
        return any(
            str(key).casefold() in forbidden or contains_state_change_fields(item)
            for key, item in value.items()
        )
    if isinstance(value, list):
        return any(contains_state_change_fields(item) for item in value)
    return False


def flatten_fact_keys(value: Any, prefix: str = "") -> set[str]:
    """Return only keys present in the supplied snapshot/history."""
    facts: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            facts.add(path)
            facts.update(flatten_fact_keys(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            facts.update(flatten_fact_keys(item, f"{prefix}[{index}]"))
    return facts


def reject_numeric_claims(value: Any) -> bool:
    """Disallow free-form numeric claims that could be mistaken for state updates."""
    if isinstance(value, dict):
        for key, item in value.items():
            # Identifiers and references are not narrative claims.
            if key in {"actor_id", "criterion_id", "rubric_version", "referenced_facts"}:
                continue
            if reject_numeric_claims(item):
                return True
    elif isinstance(value, list):
        return any(reject_numeric_claims(item) for item in value)
    elif isinstance(value, str):
        return bool(
            re.search(r"(?<![A-Za-z])\d+(?:[.,]\d+)?\s*%?", value)
            or _NUMBERED_QUANTITY.search(value)
            or _NUMERIC_STATE_CLAIM.search(value)
        )
    elif isinstance(value, int | float) and not isinstance(value, bool):
        return True
    return False


def references_are_supplied(value: Any, available_facts: set[str]) -> bool:
    """Require each model-cited field to be part of the exact prompt input."""
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "referenced_facts":
                if not isinstance(item, list) or any(fact not in available_facts for fact in item):
                    return False
            elif not references_are_supplied(item, available_facts):
                return False
    elif isinstance(value, list):
        return all(references_are_supplied(item, available_facts) for item in value)
    return True


def redact_direct_pii(value: Any) -> Any:
    """Remove PII-bearing state keys and redact common direct identifiers in text."""
    if isinstance(value, dict):
        return {
            str(key): redact_direct_pii(item)
            for key, item in value.items()
            if not _pii_key(str(key))
        }
    if isinstance(value, list):
        return [redact_direct_pii(item) for item in value]
    if isinstance(value, str):
        text = re.sub(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[redacted]", value, flags=re.I)
        text = re.sub(r"(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)", "[redacted]", text)
        text = re.sub(
            (
                r"(?i:\b(?:my name is|student name|learner name|name\s*[:=]))"
                r"\s*[:=]?\s*[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2}"
            ),
            "[redacted]",
            text,
        )
        text = re.sub(
            r"\b(?:[Ii] am|I['’]m|[Mm]y name is|[Cc]all me)\s+"
            r"[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,2}",
            "[redacted]",
            text,
        )
        text = re.sub(
            r"\b(?:[Mm]y school is|[Ii] attend|[Ii] go to|from)\s+(?:the\s+)?"
            r"[A-Z][\w'&’-]*(?:\s+[A-Z][\w'&’-]*){0,4}\s+"
            r"(?:school|academy|college|primary|secondary|university)\b",
            "[redacted]",
            text,
            flags=re.IGNORECASE,
        )
        return text[:2000]
    return value


def _pii_key(key: str) -> bool:
    normalized = re.sub(r"[^a-z]", "", key.casefold())
    return any(
        token in normalized
        for token in (
            "studentname",
            "learnername",
            "displayname",
            "fullname",
            "firstname",
            "lastname",
            "phone",
            "email",
            "schoolid",
            "schoolname",
            "schoolcode",
            "institutionid",
            "institutionname",
            "classid",
            "address",
            "profileid",
            "userid",
            "studentid",
        )
    )


def record_result(
    callback: RecordInteraction | None,
    *,
    task_type: str,
    result: AIResult[Any],
) -> None:
    """Pass audit fields only; never persist a prompt or hidden reasoning."""
    if callback is None:
        return
    try:
        callback(
            task_type=task_type,
            model_id=result.model_id,
            latency_ms=result.latency_ms,
            validation_status=result.validation_status,
            output=result.output.model_dump(mode="json"),
        )
    except Exception:
        # An audit-write failure must not block learning or simulation requests.
        return


def run_validated_task(
    *,
    task_type: str,
    output_schema: type[T],
    fallback: T,
    system_prompt: str,
    user_prompt: str,
    available_facts: set[str],
    client: Any | None = None,
    record_interaction: RecordInteraction | None = None,
    validate_payload: Callable[[dict[str, Any]], None] | None = None,
) -> AIResult[T]:
    """Run one bounded NIM task and fall back safely on all provider/validation errors."""
    started = perf_counter()
    model_id = configured_model()
    if client is None and not settings.nvidia_api_key:
        result = AIResult(
            output=fallback,
            status="ai_unavailable",
            source="fallback",
            model_id=model_id,
            latency_ms=0,
            validation_status="fallback_missing_api_key",
        )
        record_result(record_interaction, task_type=task_type, result=result)
        return result

    try:
        raw = complete_json(system_prompt, user_prompt, client)
        payload = parse_json_object(raw)
        if contains_state_change_fields(payload):
            raise ValueError("state_change_fields")
        if reject_numeric_claims(payload):
            raise ValueError("numeric_claim")
        if not references_are_supplied(payload, available_facts):
            raise ValueError("unsupported_reference")
        if validate_payload is not None:
            validate_payload(payload)
        output = output_schema.model_validate(payload)
        result = AIResult(
            output=output,
            status="available",
            source="nvidia",
            model_id=model_id,
            latency_ms=max(0, int((perf_counter() - started) * 1000)),
            validation_status="validated",
        )
    except Exception as exc:
        result = AIResult(
            output=fallback,
            status="ai_unavailable",
            source="fallback",
            model_id=model_id,
            latency_ms=max(0, int((perf_counter() - started) * 1000)),
            validation_status=_validation_failure(exc),
        )
    record_result(record_interaction, task_type=task_type, result=result)
    return result


def _validation_failure(error: Exception) -> str:
    if isinstance(error, AIUnavailableError):
        label = str(error)
        if label == "TimeoutError" or label == "APITimeoutError":
            return "fallback_timeout"
        return "fallback_provider_error"
    if isinstance(error, ValidationError):
        return "fallback_invalid_schema"
    if isinstance(error, ValueError):
        label = str(error)
        if label == "invalid_json":
            return "fallback_invalid_json"
        if label == "unsupported_reference":
            return "fallback_unsupported_fact"
        if label in {"state_change_fields", "numeric_claim"}:
            return "fallback_numeric_or_state_change"
        return "fallback_invalid_output"
    return "fallback_provider_error"
