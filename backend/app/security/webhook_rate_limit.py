"""Bounded in-memory rate limiting for public provider callbacks."""

from __future__ import annotations

from collections import OrderedDict, deque
from hashlib import sha256
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status

from app.config import settings

_WINDOW_SECONDS = 60.0
_MAX_TRACKED_IDENTIFIERS = 4096
_MAX_TOTAL_HITS = 100_000
_SWEEP_INTERVAL_SECONDS = 1.0

_lock = Lock()
_hits: OrderedDict[bytes, deque[float]] = OrderedDict()
_total_hits = 0
_next_sweep_at = 0.0


def enforce_webhook_rate_limit(*identifiers: str) -> None:
    """Allow at most the configured requests per rolling minute for each key.

    Identifiers are hashed before entering the in-memory map. Calls with more
    than one identifier consume a slot for each key atomically, so a blocked
    request does not partially charge its other identifiers.
    """
    global _total_hits

    keys = {sha256(identifier.encode("utf-8")).digest() for identifier in identifiers if identifier}
    if not keys:
        return

    now = monotonic()
    cutoff = now - _WINDOW_SECONDS
    limit = settings.rate_limit_per_minute

    with _lock:
        _sweep_expired(cutoff, now)

        for key in keys:
            bucket = _hits.get(key)
            if bucket is None:
                continue
            _prune_bucket(bucket, cutoff)
            if not bucket:
                _remove_bucket(key)
            else:
                _hits.move_to_end(key)
                if len(bucket) >= limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Rate limit exceeded",
                    )

        if _total_hits + len(keys) > _MAX_TOTAL_HITS:
            # Fail closed when the hard memory budget is exhausted.
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded",
            )

        for key in keys:
            bucket = _hits.get(key)
            if bucket is None:
                while len(_hits) >= _MAX_TRACKED_IDENTIFIERS:
                    _evict_oldest_bucket()
                bucket = deque()
                _hits[key] = bucket
            bucket.append(now)
            _hits.move_to_end(key)
            _total_hits += 1


def _sweep_expired(cutoff: float, now: float) -> None:
    """Prune old entries periodically and whenever the global cap is near."""
    global _next_sweep_at

    if now < _next_sweep_at and _total_hits < _MAX_TOTAL_HITS:
        return
    for key, bucket in list(_hits.items()):
        _prune_bucket(bucket, cutoff)
        if not bucket:
            _remove_bucket(key)
    _next_sweep_at = now + _SWEEP_INTERVAL_SECONDS


def _prune_bucket(bucket: deque[float], cutoff: float) -> None:
    """Drop hits that no longer fall inside the rolling window."""
    global _total_hits

    while bucket and bucket[0] <= cutoff:
        bucket.popleft()
        _total_hits -= 1


def _remove_bucket(key: bytes) -> None:
    """Remove a bucket and update the global hit count."""
    global _total_hits

    bucket = _hits.pop(key, None)
    if bucket:
        _total_hits -= len(bucket)


def _evict_oldest_bucket() -> None:
    """Keep identifier cardinality bounded under callers that vary their keys."""
    global _total_hits

    _, bucket = _hits.popitem(last=False)
    _total_hits -= len(bucket)
