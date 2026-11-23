"""Transactional simulation service backed by the real Supabase PostgreSQL schema."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    AIInteraction,
    Profile,
    ScenarioVersion,
    SimulationDecision,
    SimulationEvent,
    SimulationSession,
    WorldStateSnapshot,
)
from app.db.repositories import MissionRepository, SimulationRepository
from app.simulation import engine
from app.simulation.replay import replay_configuration
from app.simulation.world_state import Action, Event, TurnResult, WorldState

SCENARIO_PATH = Path(__file__).resolve().parent / "scenarios" / "mtoni_v1.json"
INTERNAL_TURN_METADATA = "__turn_metadata__"


class SessionNotFoundError(LookupError):
    """Session missing or outside the caller's authorized school/class scope."""


class MissionNotFoundError(LookupError):
    """Mission missing, unpublished, or unavailable to students."""


class StaleTurnError(RuntimeError):
    """A decision was submitted against a stale expected turn."""


class SessionConflictError(RuntimeError):
    """A session cannot accept decisions in its current status."""


class PersistenceInvariantError(RuntimeError):
    """Stored simulation rows are inconsistent with the persisted turn contract."""


def canonical_json_hash(value: dict[str, Any]) -> str:
    """Hash canonical JSON so identical state snapshots have a stable digest."""
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256(canonical.encode("utf-8")).hexdigest()


def load_scenario() -> dict[str, Any]:
    """Read the checked-in versioned scenario; its numbers are configuration, not AI output."""
    with SCENARIO_PATH.open(encoding="utf-8") as scenario_file:
        return json.load(scenario_file)


class SimulationService:
    """Implement the simulation gateway against SQLAlchemy and PostgreSQL."""

    def __init__(self, session: Session, scenario: dict[str, Any] | None = None) -> None:
        self.db = session
        self.scenario = scenario or load_scenario()
        self.repository = SimulationRepository(session)

    @contextmanager
    def _write_transaction(self) -> Iterator[None]:
        # Auth/profile lookups can autobegin a read transaction on the same request session.
        if self.db.in_transaction():
            self.db.commit()
        try:
            with self.db.begin():
                yield
        except Exception:
            self.db.rollback()
            raise

    @staticmethod
    def _state_dict(raw_state: dict[str, Any]) -> dict[str, Any]:
        return WorldState.model_validate(raw_state).model_dump(mode="json")

    @staticmethod
    def _event_model(raw_event: dict[str, Any], turn: int, rules_version: str) -> Event:
        return Event.model_validate(
            {
                "event_type": raw_event.get(
                    "event_type", raw_event.get("event_id", "scenario_event")
                ),
                "turn_number": raw_event.get("turn_number", turn),
                "payload": raw_event.get("payload", raw_event),
                "engine_version": raw_event.get("engine_version", rules_version),
            }
        )

    def _authorized_session(
        self, session_id: UUID, user_id: UUID, *, for_update: bool = False
    ) -> SimulationSession:
        row = self.repository.get_session(session_id, for_update=for_update)
        if row is None:
            raise SessionNotFoundError("Simulation session not found")
        if row.student_id != user_id and not self.repository.is_assigned_teacher(
            user_id, row.student_id
        ):
            raise SessionNotFoundError("Simulation session not found")
        return row

    def _scenario_version(self, version_id: UUID) -> ScenarioVersion:
        version = self.db.get(ScenarioVersion, version_id)
        if version is None:
            raise PersistenceInvariantError("Session refers to a missing scenario version")
        return version

    @staticmethod
    def _session_created_payload(
        session_row: SimulationSession,
        version: ScenarioVersion,
        *,
        parent_session_id: UUID | None = None,
    ) -> dict[str, Any]:
        mission_id = version.mission_id
        payload = {
            "session_id": session_row.id,
            "mission_id": mission_id,
            "turn": session_row.current_turn,
            "status": session_row.status,
            "state": WorldState.model_validate(session_row.current_state),
        }
        if parent_session_id is not None:
            payload["parent_session_id"] = parent_session_id
        return payload

    def get_or_create_session(
        self, mission_id: UUID, user_id: UUID, idempotency_key: str | None = None
    ) -> dict[str, Any]:
        """Create a persisted turn-zero session from a published immutable scenario."""
        if idempotency_key is not None and (not idempotency_key or len(idempotency_key) > 128):
            raise ValueError("Session Idempotency-Key must contain 1 to 128 characters")
        profile = self.db.get(Profile, user_id)
        if profile is None or profile.role != "student":
            raise MissionNotFoundError("Published mission not found")
        published = MissionRepository(self.db).get_published_for_user(mission_id, user_id)
        if published is None:
            raise MissionNotFoundError("Published mission not found")
        _, version = published

        if version.version != 1 or self.scenario.get("scenario_id") != "mtoni":
            raise MissionNotFoundError("No backend scenario is configured for this mission version")
        if idempotency_key is not None:
            existing = self.repository.get_created_by_key(user_id, version.id, idempotency_key)
            if existing is not None:
                return self._session_created_payload(existing, version)

        initial_state = self._state_dict(version.initial_state)
        current_turn = initial_state["current_turn"]
        row = SimulationSession(
            id=uuid4(),
            student_id=user_id,
            mission_version_id=version.id,
            creation_idempotency_key=idempotency_key,
            status="active",
            current_turn=current_turn,
            current_state=initial_state,
        )
        try:
            with self._write_transaction():
                self.db.add(row)
                self.db.flush()
                self.db.add(
                    WorldStateSnapshot(
                        id=uuid4(),
                        session_id=row.id,
                        turn_number=current_turn,
                        state=initial_state,
                        state_hash=canonical_json_hash(initial_state),
                    )
                )
        except IntegrityError:
            # A concurrent retry can race the initial lookup. The partial unique index
            # chooses one winner; after rollback, return that persisted session.
            if idempotency_key is None:
                raise
            existing = self.repository.get_created_by_key(user_id, version.id, idempotency_key)
            if existing is None:
                raise
            return self._session_created_payload(existing, version)
        return self._session_created_payload(row, version)

    def get_state(self, session_id: UUID, user_id: UUID) -> dict[str, Any]:
        row = self._authorized_session(session_id, user_id)
        version = self._scenario_version(row.mission_version_id)
        return {
            "session_id": row.id,
            "mission_id": version.mission_id,
            "turn": row.current_turn,
            "status": row.status,
            "state": WorldState.model_validate(row.current_state),
        }

    def list_actions(self, session_id: UUID, user_id: UUID) -> list[dict[str, Any]]:
        self._authorized_session(session_id, user_id)
        actions = self.scenario.get("actions", {})
        return [{"action_type": key, **value} for key, value in actions.items()]

    def _turn_result_from_storage(
        self,
        row: SimulationDecision,
        snapshot: WorldStateSnapshot,
        events: list[SimulationEvent],
        rules_version: str,
    ) -> TurnResult:
        metadata = next(
            (event.payload for event in events if event.event_type == INTERNAL_TURN_METADATA),
            None,
        )
        if metadata is None or "water_accounting" not in metadata:
            raise PersistenceInvariantError("Stored idempotent decision has no result metadata")
        public_events = [
            Event(
                event_type=event.event_type,
                turn_number=event.turn_number,
                payload=event.payload,
                engine_version=event.engine_version,
            )
            for event in events
            if event.event_type != INTERNAL_TURN_METADATA
        ]
        return TurnResult.model_validate(
            {
                "turn": row.turn_number,
                "accepted": True,
                "action": {
                    "action_type": row.action_type,
                    "parameters": row.validated_parameters,
                    "expected_turn": row.expected_turn,
                },
                "state": self._state_dict(snapshot.state),
                "events": [event.model_dump(mode="json") for event in public_events],
                "water_accounting": metadata["water_accounting"],
                "idempotent_replay": True,
            }
        )

    def submit_decision(
        self, session_id: UUID, user_id: UUID, action: Action, idempotency_key: str
    ) -> TurnResult:
        """Validate, calculate, and atomically commit one idempotent turn."""
        if not idempotency_key or len(idempotency_key) > 200:
            raise ValueError("Idempotency-Key must contain 1 to 200 characters")

        with self._write_transaction():
            session_row = self._authorized_session(session_id, user_id, for_update=True)
            version = self._scenario_version(session_row.mission_version_id)

            # A retried committed request must win over expected_turn, which is stale by then.
            duplicate = self.repository.get_decision_by_key(session_id, idempotency_key)
            if duplicate is not None:
                snapshot = self.repository.get_snapshot(session_id, duplicate.turn_number)
                if snapshot is None:
                    raise PersistenceInvariantError(
                        "Stored decision has no matching state snapshot"
                    )
                stored_events = self.repository.events_for_turn(session_id, duplicate.turn_number)
                result = self._turn_result_from_storage(
                    duplicate, snapshot, stored_events, version.rules_version
                )
                return result

            if action.expected_turn != session_row.current_turn:
                raise StaleTurnError("expected_turn does not match the current confirmed turn")
            if session_row.status != "active":
                raise SessionConflictError("Simulation session is not active")

            prior_state = self._state_dict(session_row.current_state)
            action_payload = action.model_dump(mode="json")
            engine.validate_action(action_payload, prior_state, self.scenario)
            raw_result = engine.calculate_next_state(prior_state, action_payload, self.scenario)
            result = TurnResult.model_validate(raw_result)
            if result.turn != session_row.current_turn + 1:
                raise PersistenceInvariantError("Engine returned a non-consecutive turn")

            next_state = result.state.model_dump(mode="json")
            session_row.current_turn = result.turn
            session_row.current_state = next_state
            if result.turn >= int(self.scenario["number_of_turns"]):
                session_row.status = "completed"

            decision = SimulationDecision(
                id=uuid4(),
                session_id=session_id,
                turn_number=result.turn,
                action_type=action.action_type,
                validated_parameters=action.parameters,
                idempotency_key=idempotency_key,
                expected_turn=action.expected_turn,
            )
            self.db.add(decision)
            for event in result.events:
                self.db.add(
                    SimulationEvent(
                        id=uuid4(),
                        session_id=session_id,
                        turn_number=result.turn,
                        event_type=event.event_type,
                        payload=event.payload,
                        engine_version=event.engine_version or version.rules_version,
                    )
                )

            # The existing schema has no result column; preserve the exact accounting data
            # in an internal event so a duplicate idempotency key returns the original result.
            self.db.add(
                SimulationEvent(
                    id=uuid4(),
                    session_id=session_id,
                    turn_number=result.turn,
                    event_type=INTERNAL_TURN_METADATA,
                    payload={"water_accounting": result.water_accounting.model_dump(mode="json")},
                    engine_version=version.rules_version,
                )
            )
            self.db.add(
                WorldStateSnapshot(
                    id=uuid4(),
                    session_id=session_id,
                    turn_number=result.turn,
                    state=next_state,
                    state_hash=canonical_json_hash(next_state),
                )
            )
            self.db.flush()
            return result

    def history(
        self, session_id: UUID, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> dict[str, Any]:
        self._authorized_session(session_id, user_id)
        bounded_limit = min(max(limit, 1), 100)
        bounded_offset = max(offset, 0)
        snapshots = self.repository.snapshots(session_id, bounded_limit, bounded_offset)
        total = (
            self.db.scalar(
                select(func.count(WorldStateSnapshot.id)).where(
                    WorldStateSnapshot.session_id == session_id
                )
            )
            or 0
        )
        decisions = {
            row.turn_number: row
            for row in self.db.scalars(
                select(SimulationDecision).where(SimulationDecision.session_id == session_id)
            )
        }
        interactions = list(
            self.db.scalars(
                select(AIInteraction)
                .where(AIInteraction.session_id == session_id)
                .order_by(AIInteraction.created_at.desc())
            )
        )
        ai_status_by_turn: dict[int, str] = {}
        for interaction in interactions:
            if interaction.task_type == "stakeholder_dialogue":
                ai_status_by_turn.setdefault(
                    interaction.output.get("turn", 0),
                    "ai_unavailable"
                    if interaction.validation_status.startswith("fallback")
                    or interaction.validation_status == "ai_unavailable"
                    else "available",
                )
        entries: list[dict[str, Any]] = []
        for snapshot in snapshots:
            turn_events = self.repository.events_for_turn(session_id, snapshot.turn_number)
            public_events = [
                Event(
                    event_type=event.event_type,
                    turn_number=event.turn_number,
                    payload=event.payload,
                    engine_version=event.engine_version,
                ).model_dump(mode="json")
                for event in turn_events
                if event.event_type != INTERNAL_TURN_METADATA
            ]
            decision = decisions.get(snapshot.turn_number)
            entries.append(
                {
                    "turn": snapshot.turn_number,
                    "action": (
                        {
                            "action_type": decision.action_type,
                            "parameters": decision.validated_parameters,
                            "expected_turn": decision.expected_turn,
                        }
                        if decision
                        else None
                    ),
                    "events": public_events,
                    "state": self._state_dict(snapshot.state),
                    "state_hash": snapshot.state_hash,
                    "ai_feedback_status": ai_status_by_turn.get(snapshot.turn_number),
                }
            )
        return {
            "session_id": session_id,
            "entries": entries,
            "limit": bounded_limit,
            "offset": bounded_offset,
            "total": int(total),
        }

    def replay(
        self,
        session_id: UUID,
        user_id: UUID,
        idempotency_key: str | None = None,
        label: str | None = None,
    ) -> dict[str, Any]:
        """Create a child session at the original turn-zero snapshot."""
        del label  # The current schema does not persist a replay label.
        if idempotency_key is not None and (not idempotency_key or len(idempotency_key) > 128):
            raise ValueError("Replay Idempotency-Key must contain 1 to 128 characters")
        with self._write_transaction():
            source = self._authorized_session(session_id, user_id, for_update=True)
            version = self._scenario_version(source.mission_version_id)
            if idempotency_key is not None:
                existing_replay = self.repository.get_replay_by_key(source.id, idempotency_key)
                if existing_replay is not None:
                    return self._session_created_payload(
                        existing_replay, version, parent_session_id=source.id
                    )
            initial_snapshot = self.repository.get_snapshot(session_id, 0)
            initial_state = (
                self._state_dict(initial_snapshot.state)
                if initial_snapshot is not None
                else self._state_dict(version.initial_state)
            )
            configuration = replay_configuration(
                {
                    "session_id": source.id,
                    "student_id": source.student_id,
                    "mission_version_id": source.mission_version_id,
                    "initial_state": initial_state,
                }
            )
            replay = SimulationSession(
                id=uuid4(),
                student_id=configuration["student_id"],
                mission_version_id=configuration["mission_version_id"],
                parent_session_id=configuration["parent_session_id"],
                creation_idempotency_key=idempotency_key,
                status="active",
                current_turn=0,
                current_state=configuration["initial_state"],
            )
            self.db.add(replay)
            self.db.flush()
            self.db.add(
                WorldStateSnapshot(
                    id=uuid4(),
                    session_id=replay.id,
                    turn_number=0,
                    state=configuration["initial_state"],
                    state_hash=canonical_json_hash(configuration["initial_state"]),
                )
            )
        return self._session_created_payload(replay, version, parent_session_id=source.id)
