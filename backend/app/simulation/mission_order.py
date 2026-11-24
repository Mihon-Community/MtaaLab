"""Stable learner-facing order for the published game portfolio."""

from __future__ import annotations


def mission_order_key(title: str) -> tuple[int, str]:
    """Place the core Mtoni game first, followed by market, health, then group finance."""
    normalized = " ".join(title.casefold().split())
    if "mtoni" in normalized and "water" in normalized:
        rank = 0
    elif "mama mboga" in normalized or "soko" in normalized:
        rank = 1
    elif "fever" in normalized or "homa" in normalized:
        rank = 2
    elif "chama" in normalized:
        rank = 3
    else:
        rank = 4
    return rank, normalized
