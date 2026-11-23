"""Tests for the bounded webhook callback rate limiter."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

import app.security.webhook_rate_limit as rate_limit


@pytest.fixture(autouse=True)
def reset_limiter() -> Any:
    """Keep the process-wide limiter isolated between tests."""
    with rate_limit._lock:
        rate_limit._hits.clear()
        rate_limit._total_hits = 0
        rate_limit._next_sweep_at = 0.0
    yield
    with rate_limit._lock:
        rate_limit._hits.clear()
        rate_limit._total_hits = 0
        rate_limit._next_sweep_at = 0.0


def configure_limiter(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
    monkeypatch.setattr(rate_limit, "settings", SimpleNamespace(rate_limit_per_minute=limit))


def test_rejects_request_after_limit_for_identifier(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 2)

    rate_limit.enforce_webhook_rate_limit("caller-a")
    rate_limit.enforce_webhook_rate_limit("caller-a")

    with pytest.raises(HTTPException) as error:
        rate_limit.enforce_webhook_rate_limit("caller-a")

    assert error.value.status_code == 429
    assert error.value.detail == "Rate limit exceeded"


def test_multiple_identifiers_are_counted_atomically(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 2)

    rate_limit.enforce_webhook_rate_limit("ip-a", "phone-a")
    rate_limit.enforce_webhook_rate_limit("ip-b", "phone-a")

    with pytest.raises(HTTPException):
        rate_limit.enforce_webhook_rate_limit("ip-c", "phone-a")

    # The rejected request must not partially charge ip-c.
    rate_limit.enforce_webhook_rate_limit("ip-c", "phone-b")
    rate_limit.enforce_webhook_rate_limit("ip-c", "phone-c")


def test_uses_a_rolling_sixty_second_window(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 2)
    now = [100.0]
    monkeypatch.setattr(rate_limit, "monotonic", lambda: now[0])

    rate_limit.enforce_webhook_rate_limit("caller")
    now[0] = 130.0
    rate_limit.enforce_webhook_rate_limit("caller")

    now[0] = 159.0
    with pytest.raises(HTTPException):
        rate_limit.enforce_webhook_rate_limit("caller")

    now[0] = 160.0
    rate_limit.enforce_webhook_rate_limit("caller")


def test_has_no_identifier_in_errors_or_logs(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    configure_limiter(monkeypatch, 1)
    identifier = "private-callback-identifier"

    rate_limit.enforce_webhook_rate_limit(identifier)
    with pytest.raises(HTTPException) as error:
        rate_limit.enforce_webhook_rate_limit(identifier)

    assert identifier not in str(error.value.detail)
    assert identifier not in caplog.text


def test_hashes_keys_and_bounds_identifier_cardinality(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 1)
    monkeypatch.setattr(rate_limit, "_MAX_TRACKED_IDENTIFIERS", 2)

    rate_limit.enforce_webhook_rate_limit("first")
    rate_limit.enforce_webhook_rate_limit("second")
    rate_limit.enforce_webhook_rate_limit("third")

    assert len(rate_limit._hits) == 2
    assert all(isinstance(key, bytes) for key in rate_limit._hits)


def test_fails_closed_at_global_hit_memory_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 10)
    monkeypatch.setattr(rate_limit, "_MAX_TOTAL_HITS", 1)

    rate_limit.enforce_webhook_rate_limit("caller-a")

    with pytest.raises(HTTPException) as error:
        rate_limit.enforce_webhook_rate_limit("caller-b")

    assert error.value.status_code == 429
    assert rate_limit._total_hits == 1


def test_concurrent_requests_cannot_exceed_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_limiter(monkeypatch, 5)

    def attempt(_: int) -> bool:
        try:
            rate_limit.enforce_webhook_rate_limit("shared-caller")
        except HTTPException:
            return False
        return True

    with ThreadPoolExecutor(max_workers=12) as executor:
        accepted = list(executor.map(attempt, range(20)))

    assert sum(accepted) == 5
