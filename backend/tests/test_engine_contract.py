"""Specification §14 acceptance placeholders; the simulation remains unimplemented."""

import pytest


@pytest.mark.skip(reason="TODO: SIM-01")
def test_same_inputs_are_deterministic() -> None:
    pass


@pytest.mark.skip(reason="TODO: SIM-02")
def test_unaffordable_action_is_rejected_without_mutation() -> None:
    pass


@pytest.mark.skip(reason="TODO: SIM-03")
def test_out_of_range_parameter_is_rejected() -> None:
    pass


@pytest.mark.skip(reason="TODO: SIM-04")
def test_water_accounting_is_conserved() -> None:
    pass


@pytest.mark.skip(reason="TODO: SIM-05")
def test_duplicate_idempotency_key_does_not_apply_twice() -> None:
    pass


@pytest.mark.skip(reason="TODO: SIM-06")
def test_concurrent_turn_requests_apply_at_most_once() -> None:
    pass
