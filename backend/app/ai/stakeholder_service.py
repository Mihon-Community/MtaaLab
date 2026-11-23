"""Stakeholder dialogue calls NVIDIA with minimum de-identified state; TODO(owner): implement."""

from app.ai.schemas import StakeholderDialogue


def stakeholder_dialogue(state_summary: dict[str, object], actor_id: str) -> StakeholderDialogue:
    """Return validated dialogue or an approved static fallback; no PII in prompts."""
    raise NotImplementedError
