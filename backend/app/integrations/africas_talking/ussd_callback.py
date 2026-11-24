"""USSD callback orchestration over the same persisted simulation gateway as the PWA."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import USSDCallbackRequest, USSDMenuResponse
from app.db.models import MobileSession, Profile, SandboxPhoneMapping, SimulationSession
from app.db.repositories import (
    DeliveryLogRepository,
    MissionRepository,
    MobileSessionRepository,
    SimulationRepository,
)
from app.db.session import get_db_session
from app.simulation.gateway import SimulationGateway
from app.simulation.service import load_scenario
from app.simulation.world_state import Action

from .menu_state import (
    allowed_phone,
    callback_request_key,
    completion_message,
    phone_reference,
    process_input,
    recorded_message,
    render_menu,
    split_cumulative_text,
)
from .sms_service import send_mission_sms

logger = logging.getLogger(__name__)
MOBILE_SESSION_TTL = timedelta(seconds=180)
DEMO_PROFILE_NAME = "Demo Student"
DEMO_MISSION_TITLE = "Mtoni water resilience"


class WebhookStore(Protocol):
    """Minimal store boundary that can be replaced with a fake in callback tests."""

    def get_demo_student_id(self, phone_ref: str) -> UUID | None: ...

    def get_mobile(self, provider_session_id: str) -> MobileSession | None: ...

    def get_simulation_session(self, session_id: UUID) -> SimulationSession | None: ...

    def get_active_session(self, student_id: UUID) -> SimulationSession | None: ...

    def get_mtoni_mission_id(self, student_id: UUID) -> UUID | None: ...

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID,
        current_menu: str,
        state: dict[str, Any],
        expires_at: datetime,
        last_request_key: str,
    ) -> None: ...

    def save_sms_status(
        self,
        *,
        provider_message_id: str,
        status: str,
        recipient_ref: str,
        error_code: str | None,
    ) -> None: ...


class SQLAlchemyWebhookStore:
    """SQLAlchemy adapter for sandbox phone maps, mobile sessions, and delivery logs."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_demo_student_id(self, phone_ref: str) -> UUID | None:
        return self.db.scalar(
            select(SandboxPhoneMapping.student_id)
            .join(Profile, Profile.id == SandboxPhoneMapping.student_id)
            .where(
                SandboxPhoneMapping.phone_ref == phone_ref,
                Profile.role == "student",
                Profile.display_name == DEMO_PROFILE_NAME,
            )
        )

    def get_mobile(self, provider_session_id: str) -> MobileSession | None:
        return MobileSessionRepository(self.db).get_by_provider_session_id(
            provider_session_id, for_update=True
        )

    def get_simulation_session(self, session_id: UUID) -> SimulationSession | None:
        return self.db.get(SimulationSession, session_id)

    def get_active_session(self, student_id: UUID) -> SimulationSession | None:
        return SimulationRepository(self.db).get_active_session_for_student(student_id)

    def get_mtoni_mission_id(self, student_id: UUID) -> UUID | None:
        missions = MissionRepository(self.db).list_published(student_id)
        mission = next((item for item in missions if item.title == DEMO_MISSION_TITLE), None)
        return mission.id if mission is not None else None

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID,
        current_menu: str,
        state: dict[str, Any],
        expires_at: datetime,
        last_request_key: str,
    ) -> None:
        MobileSessionRepository(self.db).upsert(
            provider_session_id=provider_session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu=current_menu,
            state=state,
            expires_at=expires_at,
            last_request_key=last_request_key,
        )
        self.db.commit()

    def save_sms_status(
        self,
        *,
        provider_message_id: str,
        status: str,
        recipient_ref: str,
        error_code: str | None,
    ) -> None:
        DeliveryLogRepository(self.db).upsert_status(
            provider_message_id=provider_message_id,
            status=status,
            recipient_ref=recipient_ref,
            error_code=error_code,
        )
        self.db.commit()


def get_webhook_store(db: Session = Depends(get_db_session)) -> SQLAlchemyWebhookStore:  # noqa: B008
    """Provide the request-scoped database adapter; tests can override this dependency."""
    return SQLAlchemyWebhookStore(db)


@dataclass(frozen=True)
class USSDOutcome:
    """Bounded response plus optional completion summary for an SMS background task."""

    response: str
    completed: bool = False
    recipient: str | None = None
    phone_ref: str | None = None
    session_id: UUID | None = None
    summary: str | None = None


def _state_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return dict(value)


def _validated_response(text: str) -> str:
    return USSDMenuResponse(message=text).message


def _menu_state(mobile: MobileSession | None, expired: bool) -> dict[str, Any]:
    if mobile is None or not isinstance(mobile.state, dict):
        return {"screen": "main", "decision_step": 0, "recent_requests": []}
    if expired:
        return {
            "screen": "main",
            "decision_step": mobile.state.get("decision_step", 0),
            "recent_requests": mobile.state.get("recent_requests", []),
        }
    return dict(mobile.state)


def _create_or_resume_session(
    *,
    store: WebhookStore,
    gateway: SimulationGateway,
    student_id: UUID,
    mobile: MobileSession | None,
    provider_session_id: str,
) -> tuple[UUID, dict[str, Any]] | None:
    """Reuse an active learner session or create one from the assigned Mtoni mission."""
    simulation_session = None
    if mobile is not None:
        simulation_session = store.get_simulation_session(mobile.session_id)
        if simulation_session is not None and simulation_session.student_id != student_id:
            return None
    if simulation_session is None or simulation_session.status != "active":
        simulation_session = store.get_active_session(student_id)
    if simulation_session is None:
        mission_id = store.get_mtoni_mission_id(student_id)
        if mission_id is None:
            return None
        start_key = f"ussd-start:{callback_request_key(provider_session_id, '')}"
        created = gateway.get_or_create_session(mission_id, student_id, idempotency_key=start_key)
        return created["session_id"], _state_dict(created["state"])

    # The row came either from a lookup scoped to this student or from a prior
    # explicit ownership check above. Reuse its confirmed JSON instead of
    # issuing a second session-plus-version query through get_state().
    current_state = getattr(simulation_session, "current_state", None)
    if current_state is None:  # Keep lightweight callback test doubles compatible.
        current_state = simulation_session.state
    return simulation_session.id, _state_dict(current_state)


def process_ussd_callback(
    callback: USSDCallbackRequest,
    *,
    store: WebhookStore,
    gateway: SimulationGateway,
    background_tasks: Any,
    configured_phones: str = "",
    now: datetime | None = None,
) -> USSDOutcome:
    """Process one provider callback with bounded state and deterministic decisions only."""
    current_time = now or datetime.now(UTC)
    phone_ref = phone_reference(callback.phone_number)
    if not allowed_phone(callback.phone_number, configured_phones):
        return USSDOutcome(response="END This number is not allowed for the sandbox demo.")

    student_id = store.get_demo_student_id(phone_ref)
    if student_id is None:
        return USSDOutcome(response="END This number is not linked to the sandbox demo.")

    mobile = store.get_mobile(callback.session_id)
    if mobile is not None and mobile.phone_ref != phone_ref:
        return USSDOutcome(response="END This sandbox session is not available.")

    request_key = callback_request_key(callback.session_id, callback.text)
    recent_requests = (
        mobile.state.get("recent_requests", []) if mobile and isinstance(mobile.state, dict) else []
    )
    if isinstance(recent_requests, list):
        duplicate = next(
            (
                item.get("response")
                for item in reversed(recent_requests)
                if isinstance(item, dict) and item.get("key") == request_key
            ),
            None,
        )
        if isinstance(duplicate, str):
            return USSDOutcome(response=_validated_response(duplicate))
    if (
        mobile is not None
        and mobile.last_request_key == request_key
        and isinstance(mobile.state, dict)
        and isinstance(mobile.state.get("last_response"), str)
    ):
        return USSDOutcome(response=_validated_response(mobile.state["last_response"]))

    expired = mobile is not None and mobile.expires_at <= current_time
    if mobile is not None:
        previous_session = store.get_simulation_session(mobile.session_id)
        if previous_session is not None and previous_session.student_id != student_id:
            return USSDOutcome(response="END This sandbox session is not available.")
        if previous_session is not None and previous_session.status == "completed":
            confirmed = gateway.get_state(mobile.session_id, student_id)
            response = completion_message(_state_dict(confirmed["state"]))
            menu_state = _menu_state(mobile, False)
            requests = list(menu_state.get("recent_requests", []))
            requests = [*requests, {"key": request_key, "response": response}][-8:]
            store.save_mobile(
                provider_session_id=callback.session_id,
                phone_ref=phone_ref,
                session_id=mobile.session_id,
                current_menu="ended",
                state={
                    **menu_state,
                    "screen": "ended",
                    "last_response": response,
                    "recent_requests": requests,
                },
                expires_at=current_time + MOBILE_SESSION_TTL,
                last_request_key=request_key,
            )
            return USSDOutcome(response=response)
        if isinstance(mobile.state, dict) and mobile.state.get("screen") == "ended" and not expired:
            return USSDOutcome(response="END MtaaLab sandbox demo ended.")

    session_data = _create_or_resume_session(
        store=store,
        gateway=gateway,
        student_id=student_id,
        mobile=mobile,
        provider_session_id=callback.session_id,
    )
    if session_data is None:
        return USSDOutcome(response="END The Mtoni mission is not assigned to this demo learner.")
    session_id, state = session_data

    existing_session = store.get_simulation_session(session_id)
    if existing_session is not None and existing_session.status == "completed":
        response = completion_message(state)
        store.save_mobile(
            provider_session_id=callback.session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu="ended",
            state={"screen": "ended", "last_response": response},
            expires_at=current_time + MOBILE_SESSION_TTL,
            last_request_key=request_key,
        )
        return USSDOutcome(response=response)

    menu_state = _menu_state(mobile, expired)
    screen = "main" if expired else str(menu_state.get("screen", "main"))
    scenario = load_scenario()
    transition = process_input(callback.text, screen, state, scenario, menu_state)
    response = transition.response

    if transition.action_type is not None:
        expected_turn = int(state.get("current_turn", 0))
        action = Action(
            action_type=transition.action_type,
            parameters=transition.parameters or {},
            expected_turn=expected_turn,
        )
        menu_state = _menu_state(mobile, expired)
        step_index = len(split_cumulative_text(callback.text))
        decision_key = f"ussd:{callback.session_id}:{step_index}"
        try:
            turn_result = gateway.submit_decision(session_id, student_id, action, decision_key)
            state = _state_dict(turn_result.state)
        except (ValueError, LookupError, RuntimeError):
            response = _validated_response(
                "CON Choice unavailable. " + render_menu("main", state, scenario)[4:]
            )
            transition_screen = "main"
            transition_state: dict[str, Any] = {
                "screen": transition_screen,
                "decision_step": step_index - 1,
                "recent_requests": menu_state.get("recent_requests", []),
            }
        else:
            if turn_result.turn >= int(scenario["number_of_turns"]):
                response = completion_message(state)
                water = _format_value(state.get("reservoir_level"))
                budget = _format_value(state.get("budget_remaining"))
                summary = (
                    f"Your Mtoni mission is complete. Water {water}; budget {budget}. "
                    "Review your report online."
                )
                background_tasks.add_task(
                    send_mission_sms,
                    callback.phone_number,
                    "Mtoni",
                    summary,
                    session_id=session_id,
                    recipient_ref=phone_ref,
                )
                transition_screen = "ended"
                transition_state = {
                    "screen": transition_screen,
                    "decision_step": step_index,
                    "recent_requests": menu_state.get("recent_requests", []),
                }
                store.save_mobile(
                    provider_session_id=callback.session_id,
                    phone_ref=phone_ref,
                    session_id=session_id,
                    current_menu=transition_screen,
                    state={**transition_state, "last_response": response},
                    expires_at=current_time + MOBILE_SESSION_TTL,
                    last_request_key=request_key,
                )
                return USSDOutcome(
                    response=response,
                    completed=True,
                    recipient=callback.phone_number,
                    phone_ref=phone_ref,
                    session_id=session_id,
                    summary=summary,
                )
            response = recorded_message(state)
            transition_screen = "main"
            transition_state = {
                "screen": transition_screen,
                "decision_step": step_index,
                "recent_requests": menu_state.get("recent_requests", []),
            }
    else:
        transition_screen = transition.screen
        transition_state = {
            "screen": transition.screen,
            "decision_step": int(menu_state.get("decision_step", 0)),
            "recent_requests": menu_state.get("recent_requests", []),
        }
        if transition.screen == "confirm_allocation" and transition.parameters:
            transition_state["pending_policy"] = transition.parameters.get("policy_id")
        elif menu_state.get("pending_policy") and transition.screen == "confirm_allocation":
            transition_state["pending_policy"] = menu_state["pending_policy"]

    response = _validated_response(response)
    recent = list(transition_state.get("recent_requests", []))
    recent = [*recent, {"key": request_key, "response": response}][-8:]
    transition_state["recent_requests"] = recent
    transition_state["last_response"] = response
    store.save_mobile(
        provider_session_id=callback.session_id,
        phone_ref=phone_ref,
        session_id=session_id,
        current_menu=transition_screen,
        state=transition_state,
        expires_at=current_time + MOBILE_SESSION_TTL,
        last_request_key=request_key,
    )
    return USSDOutcome(response=response)


def _format_value(value: Any) -> str:
    return format(value, "g") if isinstance(value, int | float) else str(value)
