"""Versioned qualitative rubric registry coverage."""

from app.learning.rubrics import (
    CURRENT_REASONING_RUBRIC_VERSION,
    current_reasoning_rubric,
    get_rubric,
)


def test_current_reasoning_rubric_is_registered_and_versioned() -> None:
    rubric = current_reasoning_rubric()

    assert rubric.version == CURRENT_REASONING_RUBRIC_VERSION
    assert get_rubric(rubric.version) is rubric
    assert [criterion.criterion_id for criterion in rubric.criteria] == [
        "systems_thinking",
        "evidence_use",
        "trade_off_reasoning",
    ]
    assert get_rubric("unknown-version") is None


def test_rubric_versions_and_criteria_are_immutable() -> None:
    rubric = current_reasoning_rubric()

    try:
        rubric.version = "changed"
    except AttributeError:
        pass
    else:
        raise AssertionError("rubric versions must not be mutable")

    try:
        rubric.criteria[0].description = "changed"
    except AttributeError:
        pass
    else:
        raise AssertionError("rubric criteria must not be mutable")
