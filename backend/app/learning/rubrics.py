"""Immutable, versioned qualitative rubrics used by formative feedback."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType


@dataclass(frozen=True, slots=True)
class RubricCriterion:
    """One learner-facing qualitative criterion; it carries no numeric score."""

    criterion_id: str
    description: str


@dataclass(frozen=True, slots=True)
class QualitativeRubric:
    """One immutable rubric version so saved assessments remain interpretable."""

    version: str
    criteria: tuple[RubricCriterion, ...]


CURRENT_REASONING_RUBRIC_VERSION = "mtoni-qualitative-v1"

_CURRENT_REASONING_RUBRIC = QualitativeRubric(
    version=CURRENT_REASONING_RUBRIC_VERSION,
    criteria=(
        RubricCriterion(
            criterion_id="systems_thinking",
            description="Connect water resources, infrastructure, and community needs.",
        ),
        RubricCriterion(
            criterion_id="evidence_use",
            description="Support an explanation with recorded simulation evidence.",
        ),
        RubricCriterion(
            criterion_id="trade_off_reasoning",
            description="Compare competing needs and explain a trade-off.",
        ),
    ),
)

# New rubric content must use a new version; never edit a version after assessments persist.
RUBRIC_REGISTRY: Mapping[str, QualitativeRubric] = MappingProxyType(
    {_CURRENT_REASONING_RUBRIC.version: _CURRENT_REASONING_RUBRIC}
)


def get_rubric(version: str) -> QualitativeRubric | None:
    """Return a registered immutable rubric, or ``None`` for an unknown version."""
    return RUBRIC_REGISTRY.get(version)


def current_reasoning_rubric() -> QualitativeRubric:
    """Return the version used by the reasoning evaluator."""
    return RUBRIC_REGISTRY[CURRENT_REASONING_RUBRIC_VERSION]
