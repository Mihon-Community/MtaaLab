"""Persistence boundary shared by API routes and non-HTTP callers such as USSD."""

from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from app.simulation.world_state import Action, TurnResult


class SimulationGateway(Protocol):
    """Operations over authoritative, persisted simulation sessions."""

    def get_or_create_session(
        self, mission_id: UUID, user_id: UUID, idempotency_key: str | None = None
    ) -> dict[str, Any]: ...

    def get_state(self, session_id: UUID, user_id: UUID) -> dict[str, Any]: ...

    def list_actions(self, session_id: UUID, user_id: UUID) -> list[dict[str, Any]]: ...

    def submit_decision(
        self, session_id: UUID, user_id: UUID, action: Action, idempotency_key: str
    ) -> TurnResult: ...

    def history(
        self, session_id: UUID, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> dict[str, Any]: ...

    def replay(
        self,
        session_id: UUID,
        user_id: UUID,
        idempotency_key: str | None = None,
        label: str | None = None,
    ) -> dict[str, Any]: ...

    def record_reflection(
        self, session_id: UUID, user_id: UUID, turn_number: int, answer_code: str
    ) -> dict[str, Any]: ...

    def get_reflection(
        self, session_id: UUID, user_id: UUID, turn_number: int
    ) -> dict[str, Any] | None: ...
