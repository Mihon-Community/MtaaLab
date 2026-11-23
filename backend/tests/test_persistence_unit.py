"""Fast unit checks for persistence serialization and idempotent response restoration."""

from __future__ import annotations

from contextlib import contextmanager, nullcontext
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.db.models import SimulationDecision, SimulationEvent, WorldStateSnapshot
from app.simulation import service as service_module
from app.simulation.service import INTERNAL_TURN_METADATA, SimulationService, canonical_json_hash


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []

    def in_transaction(self) -> bool:
        return False

    def begin(self):
        return nullcontext()

    def add(self, value: object) -> None:
        self.added.append(value)

    def flush(self) -> None:
        return None


class FakeRepository:
    def __init__(self, duplicate=None, snapshot=None, events=None) -> None:
        self.duplicate = duplicate
        self.snapshot = snapshot
        self.events = events or []

    def get_decision_by_key(self, session_id, idempotency_key):
        return self.duplicate

    def get_snapshot(self, session_id, turn_number):
        return self.snapshot

    def events_for_turn(self, session_id, turn_number):
        return self.events


class UnitSimulationService(SimulationService):
    """Skip the DB context and inject locked-row values for a pure unit test."""

    def __init__(self, fake_db, fake_repo) -> None:
        super().__init__(fake_db, scenario={"number_of_turns": 6})
        self.repository = fake_repo
        self.session_row = SimpleNamespace(
            id=UUID("10000000-0000-4000-8000-000000000010"),
            student_id=UUID("20000000-0000-4000-8000-000000000020"),
            mission_version_id=UUID("30000000-0000-4000-8000-000000000030"),
            current_turn=0,
            current_state={
                "reservoir_level": 60,
                "reservoir_capacity": 100,
                "demand_by_sector": {"households": 20, "school": 8, "clinic": 6, "farms": 15},
                "leakage": 4,
                "budget_remaining": 100,
                "service_levels": {"households": 1, "school": 1, "clinic": 1, "farms": 1},
                "crop_health": 70,
                "wellbeing": 70,
            },
            status="active",
        )
        self.version = SimpleNamespace(rules_version="mtoni-rules-v1")

    @contextmanager
    def _write_transaction(self):
        yield

    def _authorized_session(self, session_id, user_id, *, for_update=False):
        return self.session_row

    def _scenario_version(self, version_id):
        return self.version


def test_canonical_hash_ignores_mapping_insertion_order() -> None:
    assert canonical_json_hash({"a": 1, "b": {"x": 2}}) == canonical_json_hash(
        {"b": {"x": 2}, "a": 1}
    )


def test_session_create_idempotency_returns_existing_session(monkeypatch) -> None:
    user_id = UUID("20000000-0000-4000-8000-000000000020")
    mission_id = UUID("30000000-0000-4000-8000-000000000030")
    version_id = UUID("40000000-0000-4000-8000-000000000040")
    session_id = UUID("50000000-0000-4000-8000-000000000050")
    initial_state = service_module.load_scenario()["initial_state"]
    existing = SimpleNamespace(
        id=session_id,
        current_turn=0,
        status="active",
        current_state=initial_state,
    )
    version = SimpleNamespace(
        id=version_id,
        mission_id=mission_id,
        version=1,
        initial_state=initial_state,
    )

    class FakeDb(FakeSession):
        def get(self, model, key):
            assert model.__name__ == "Profile"
            assert key == user_id
            return SimpleNamespace(role="student")

    class FakeMissionRepository:
        def __init__(self, _db):
            pass

        def get_published_for_user(self, requested_mission_id, requested_user_id):
            assert requested_mission_id == mission_id
            assert requested_user_id == user_id
            return SimpleNamespace(id=mission_id), version

    class FakeCreationRepository:
        def get_created_by_key(self, requested_user, requested_version, requested_key):
            assert requested_user == user_id
            assert requested_version == version_id
            assert requested_key == "create-retry-key"
            return existing

    fake_db = FakeDb()
    service = SimulationService(fake_db)
    service.repository = FakeCreationRepository()  # type: ignore[assignment]
    monkeypatch.setattr(service_module, "MissionRepository", FakeMissionRepository)

    result = service.get_or_create_session(mission_id, user_id, "create-retry-key")

    assert result["session_id"] == session_id
    assert result["state"].current_turn == 0
    assert fake_db.added == []


def test_committing_one_engine_result_writes_turn_rows_atomically(monkeypatch) -> None:
    fake_db = FakeSession()
    service = UnitSimulationService(fake_db, FakeRepository())
    called: list[str] = []

    def validate_action(action, state, scenario):
        called.append("validate")

    next_state = {
        **service.session_row.current_state,
        "current_turn": 1,
        "reservoir_level": 60,
        "unmet_demand_by_sector": {"households": 0, "school": 0, "clinic": 0, "farms": 0},
        "allocation_policy": "balanced",
    }

    def calculate_next_state(state, action, scenario):
        called.append("engine")
        return {
            "turn": 1,
            "accepted": True,
            "action": action,
            "state": next_state,
            "events": [{"event_type": "weekly_water_report", "turn_number": 1, "payload": {}}],
            "water_accounting": {
                "opening_reservoir": 60,
                "inflow": 5,
                "closing_reservoir": 0,
                "withdrawals_by_sector": {
                    "households": 0,
                    "school": 0,
                    "clinic": 0,
                    "farms": 0,
                },
                "leakage": 0,
                "overflow": 65,
            },
        }

    monkeypatch.setattr(service_module.engine, "validate_action", validate_action)
    monkeypatch.setattr(service_module.engine, "calculate_next_state", calculate_next_state)
    from app.simulation.world_state import Action

    result = service.submit_decision(
        service.session_row.id,
        service.session_row.student_id,
        Action(action_type="repair_main_pipe", parameters={}, expected_turn=0),
        "unit-key",
    )

    assert called == ["validate", "engine"]
    assert result.turn == 1
    assert service.session_row.current_turn == 1
    assert any(isinstance(row, SimulationDecision) for row in fake_db.added)
    assert any(isinstance(row, WorldStateSnapshot) for row in fake_db.added)
    metadata_rows = [
        row
        for row in fake_db.added
        if isinstance(row, SimulationEvent) and row.event_type == INTERNAL_TURN_METADATA
    ]
    assert len(metadata_rows) == 1


def test_duplicate_idempotency_key_returns_persisted_result_without_engine(monkeypatch) -> None:
    stored_state = {
        "current_turn": 1,
        "reservoir_level": 12,
        "reservoir_capacity": 100,
        "demand_by_sector": {"households": 20, "school": 8, "clinic": 6, "farms": 15},
        "leakage": 2,
        "budget_remaining": 75,
        "service_levels": {"households": 0.5, "school": 1, "clinic": 1, "farms": 0.4},
        "unmet_demand_by_sector": {"households": 10, "school": 0, "clinic": 0, "farms": 9},
        "crop_health": 67,
        "wellbeing": 68,
        "allocation_policy": "balanced",
    }
    duplicate = SimpleNamespace(
        turn_number=1,
        action_type="repair_main_pipe",
        validated_parameters={},
        expected_turn=0,
    )
    snapshot = SimpleNamespace(state=stored_state)
    metadata_event = SimpleNamespace(
        event_type=INTERNAL_TURN_METADATA,
        payload={
            "water_accounting": {
                "opening_reservoir": 60,
                "inflow": 5,
                "closing_reservoir": 12,
                "withdrawals_by_sector": {
                    "households": 20,
                    "school": 8,
                    "clinic": 6,
                    "farms": 15,
                },
                "leakage": 4,
                "overflow": 0,
            }
        },
        turn_number=1,
        engine_version="mtoni-rules-v1",
    )
    fake_db = FakeSession()
    service = UnitSimulationService(
        fake_db, FakeRepository(duplicate=duplicate, snapshot=snapshot, events=[metadata_event])
    )

    def fail_if_recalculated(*args, **kwargs):
        pytest.fail("idempotent retry recalculated an already-committed turn")

    monkeypatch.setattr(service_module.engine, "validate_action", fail_if_recalculated)
    monkeypatch.setattr(service_module.engine, "calculate_next_state", fail_if_recalculated)
    from app.simulation.world_state import Action

    result = service.submit_decision(
        service.session_row.id,
        service.session_row.student_id,
        Action(action_type="repair_main_pipe", parameters={}, expected_turn=0),
        "duplicate-key",
    )

    assert result.turn == 1
    assert result.state.reservoir_level == 12
    assert result.water_accounting.closing_reservoir == 12
    assert fake_db.added == []
