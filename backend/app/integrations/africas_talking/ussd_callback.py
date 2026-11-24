"""USSD callback orchestration over the same persisted simulation gateway as the PWA."""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import USSDCallbackRequest, USSDMenuResponse
from app.config import settings
from app.db.models import (
    LearnerChannelLink,
    MobileJoinCode,
    MobileSession,
    Profile,
    SandboxPhoneMapping,
    ScenarioVersion,
    SimulationSession,
)
from app.db.repositories import (
    DeliveryLogRepository,
    MissionRepository,
    MobileSessionRepository,
    SimulationRepository,
)
from app.db.session import get_db_session
from app.integrations.africas_talking.mobile_privacy import encrypt_phone
from app.simulation.gateway import SimulationGateway
from app.simulation.service import load_scenario, load_versioned_scenario
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
from .mobile_gameplay import _phone_ref, process_mobile_sms, process_mobile_ussd
from .sms_service import send_mission_sms

logger = logging.getLogger(__name__)
MOBILE_SESSION_TTL = timedelta(seconds=180)
SMS_SESSION_TTL = timedelta(days=30)
DEMO_PROFILE_NAME = "Demo Student"
DEMO_MISSION_TITLE = "Mtoni water resilience"


class WebhookStore(Protocol):
    """Minimal store boundary that can be replaced with a fake in callback tests."""

    def get_demo_student_id(self, phone_ref: str) -> UUID | None: ...

    def get_linked_student_id(self, phone_ref: str) -> UUID | None: ...

    def get_channel_link(self, phone_ref: str) -> LearnerChannelLink | None: ...

    def set_preferred_language(self, phone_ref: str, language: str) -> None: ...

    def redeem_join_code(self, code: str, phone_ref: str) -> UUID | None: ...

    def set_sms_consent(self, phone_ref: str, phone_number: str, *, opted_in: bool) -> bool: ...

    def get_published_missions(self, student_id: UUID) -> list[Any]: ...

    def get_scenario_for_session(self, session_id: UUID) -> dict[str, Any] | None: ...

    def get_mobile(self, provider_session_id: str) -> MobileSession | None: ...

    def get_simulation_session(self, session_id: UUID | None) -> SimulationSession | None: ...

    def get_active_session(self, student_id: UUID) -> SimulationSession | None: ...

    def get_mtoni_mission_id(self, student_id: UUID) -> UUID | None: ...

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID | None,
        current_menu: str,
        state: dict[str, Any],
        expires_at: datetime,
        last_request_key: str,
        replace_session_id: bool = False,
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

    def get_linked_student_id(self, phone_ref: str) -> UUID | None:
        return self.db.scalar(
            select(LearnerChannelLink.student_id).where(LearnerChannelLink.phone_ref == phone_ref)
        )

    def get_channel_link(self, phone_ref: str) -> LearnerChannelLink | None:
        return self.db.get(LearnerChannelLink, phone_ref)

    def set_preferred_language(self, phone_ref: str, language: str) -> None:
        link = self.db.get(LearnerChannelLink, phone_ref)
        if link is not None and language in {"en", "sw"}:
            link.preferred_language = language
            self.db.commit()

    def redeem_join_code(self, code: str, phone_ref: str) -> UUID | None:
        pepper = (settings.mobile_join_code_pepper or "").strip()
        if len(pepper) < 32:
            return None
        digest = hmac.new(
            pepper.encode(), code.strip().upper().encode("ascii"), hashlib.sha256
        ).hexdigest()
        now = datetime.now(UTC)
        join_code = self.db.scalar(
            select(MobileJoinCode).where(MobileJoinCode.code_digest == digest).with_for_update()
        )
        if join_code is None:
            return None
        existing = self.db.get(LearnerChannelLink, phone_ref)
        if join_code.redeemed_at is not None:
            if (
                existing is not None
                and existing.student_id == join_code.student_id
                and existing.class_id == join_code.class_id
            ):
                return join_code.student_id
            return None
        if join_code.expires_at <= now:
            return None
        if existing is not None and (
            existing.student_id != join_code.student_id or existing.class_id != join_code.class_id
        ):
            return None
        if existing is None:
            self.db.add(
                LearnerChannelLink(
                    phone_ref=phone_ref,
                    student_id=join_code.student_id,
                    class_id=join_code.class_id,
                    preferred_language="en",
                    consent_status="linked",
                )
            )
        join_code.redeemed_at = now
        self.db.commit()
        return join_code.student_id

    def set_sms_consent(self, phone_ref: str, phone_number: str, *, opted_in: bool) -> bool:
        link = self.db.get(LearnerChannelLink, phone_ref)
        if link is None:
            return False
        if opted_in:
            try:
                link.encrypted_phone = encrypt_phone(phone_number)
            except ValueError:
                return False
            link.consent_status = "opted_in"
            link.consent_at = datetime.now(UTC)
            link.opted_out_at = None
        else:
            link.encrypted_phone = None
            link.consent_status = "stopped"
            link.consent_at = None
            link.opted_out_at = datetime.now(UTC)
        self.db.commit()
        return True

    def get_published_missions(self, student_id: UUID) -> list[Any]:
        return MissionRepository(self.db).list_published(student_id)

    def get_scenario_for_session(self, session_id: UUID) -> dict[str, Any] | None:
        version = self.db.scalar(
            select(ScenarioVersion)
            .join(SimulationSession, SimulationSession.mission_version_id == ScenarioVersion.id)
            .where(SimulationSession.id == session_id)
        )
        if version is None:
            return None
        try:
            return load_versioned_scenario(version.rules_version)
        except (LookupError, ValueError):
            return None

    def get_mobile(self, provider_session_id: str) -> MobileSession | None:
        return MobileSessionRepository(self.db).get_by_provider_session_id(
            provider_session_id, for_update=True
        )

    def get_simulation_session(self, session_id: UUID | None) -> SimulationSession | None:
        return self.db.get(SimulationSession, session_id) if session_id is not None else None

    def get_active_session(self, student_id: UUID) -> SimulationSession | None:
        return SimulationRepository(self.db).get_active_session_for_student(student_id)

    def get_active_session_for_mission(
        self, student_id: UUID, mission_id: UUID
    ) -> SimulationSession | None:
        return self.db.scalar(
            select(SimulationSession)
            .join(ScenarioVersion, ScenarioVersion.id == SimulationSession.mission_version_id)
            .where(
                SimulationSession.student_id == student_id,
                ScenarioVersion.mission_id == mission_id,
                SimulationSession.status == "active",
            )
            .order_by(SimulationSession.started_at.desc(), SimulationSession.id.desc())
            .limit(1)
        )

    def get_mtoni_mission_id(self, student_id: UUID) -> UUID | None:
        missions = MissionRepository(self.db).list_published(student_id)
        mission = next((item for item in missions if item.title == DEMO_MISSION_TITLE), None)
        return mission.id if mission is not None else None

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID | None,
        current_menu: str,
        state: dict[str, Any],
        expires_at: datetime,
        last_request_key: str,
        replace_session_id: bool = False,
    ) -> None:
        MobileSessionRepository(self.db).upsert(
            provider_session_id=provider_session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu=current_menu,
            state=state,
            expires_at=expires_at,
            last_request_key=last_request_key,
            replace_session_id=replace_session_id,
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
    session_channel: str = "ussd",
) -> tuple[UUID, dict[str, Any], str] | None:
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
        start_key = f"{session_channel}-start:{callback_request_key(provider_session_id, '')}"
        created = gateway.get_or_create_session(mission_id, student_id, idempotency_key=start_key)
        return created["session_id"], _state_dict(created["state"]), str(created["status"])

    # The row came either from a lookup scoped to this student or from a prior
    # explicit ownership check above. Reuse its confirmed JSON instead of
    # issuing a second session-plus-version query through get_state().
    current_state = getattr(simulation_session, "current_state", None)
    if current_state is None:  # Keep lightweight callback test doubles compatible.
        current_state = simulation_session.state
    return simulation_session.id, _state_dict(current_state), simulation_session.status


def process_ussd_callback(
    callback: USSDCallbackRequest,
    *,
    store: WebhookStore,
    gateway: SimulationGateway,
    background_tasks: Any,
    configured_phones: str = "",
    now: datetime | None = None,
    session_channel: str = "ussd",
    request_key_override: str | None = None,
    session_ttl: timedelta | None = None,
    force_main_menu: bool = False,
    start_new_run: bool = False,
) -> USSDOutcome:
    """Process one provider callback with bounded state and deterministic decisions only."""
    current_time = now or datetime.now(UTC)
    phone_ref = phone_reference(callback.phone_number)
    if not allowed_phone(callback.phone_number, configured_phones):
        return USSDOutcome(response="END This number is not allowed for the sandbox demo.")

    mobile = store.get_mobile(callback.session_id)
    modern_ref = _phone_ref(callback.phone_number)
    linked_lookup = getattr(store, "get_linked_student_id", None)
    linked_student = linked_lookup(modern_ref) if linked_lookup else None
    legacy_student = store.get_demo_student_id(phone_ref)
    last_choice = split_cumulative_text(callback.text)[-1:] or [""]
    choose_games = (
        legacy_student is not None
        and mobile is not None
        and not (isinstance(mobile.state, dict) and mobile.state.get("mobile_v2"))
        and mobile.current_menu == "main"
        and last_choice[0] == "5"
    )
    if (
        session_channel == "ussd"
        or linked_student is not None
        or legacy_student is None
        or (mobile is not None and isinstance(mobile.state, dict) and mobile.state.get("mobile_v2"))
        or choose_games
    ):
        response = process_mobile_ussd(
            callback,
            store=store,
            gateway=gateway,
            force_start=choose_games,
            background_tasks=background_tasks,
        )
        updated_mobile = store.get_mobile(callback.session_id)
        updated_state = updated_mobile.state if updated_mobile is not None else {}
        completed = isinstance(updated_state, dict) and updated_state.get("screen") == "completed"
        return USSDOutcome(
            response=response,
            completed=completed,
            recipient=callback.phone_number if completed else None,
            phone_ref=modern_ref,
            session_id=updated_mobile.session_id if updated_mobile is not None else None,
        )

    student_id = legacy_student
    if mobile is not None and mobile.phone_ref != phone_ref:
        return USSDOutcome(response="END This sandbox session is not available.")

    request_key = request_key_override or callback_request_key(callback.session_id, callback.text)
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

    ttl = session_ttl or MOBILE_SESSION_TTL
    expired = mobile is not None and mobile.expires_at <= current_time
    replace_session_id = False
    session_data_override = None
    if mobile is not None:
        previous_session = store.get_simulation_session(mobile.session_id)
        if previous_session is not None and previous_session.student_id != student_id:
            return USSDOutcome(response="END This sandbox session is not available.")
        if (
            session_channel == "sms"
            and start_new_run
            and previous_session is not None
            and (
                previous_session.status == "completed"
                or (isinstance(mobile.state, dict) and mobile.state.get("screen") == "ended")
            )
        ):
            mission_id = store.get_mtoni_mission_id(student_id)
            if mission_id is None:
                return USSDOutcome(
                    response="END The Mtoni mission is not assigned to this demo learner."
                )
            created = gateway.get_or_create_session(
                mission_id,
                student_id,
                idempotency_key=f"sms-replay:{request_key}",
            )
            session_data_override = (
                created["session_id"],
                _state_dict(created["state"]),
                str(created["status"]),
            )
            replace_session_id = True
            expired = False
        if (
            session_data_override is None
            and previous_session is not None
            and previous_session.status == "completed"
        ):
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
                expires_at=current_time + ttl,
                last_request_key=request_key,
            )
            return USSDOutcome(response=response)
        if (
            session_data_override is None
            and isinstance(mobile.state, dict)
            and mobile.state.get("screen") == "ended"
            and not expired
        ):
            return USSDOutcome(response="END MtaaLab sandbox demo ended.")

    session_data = session_data_override or _create_or_resume_session(
        store=store,
        gateway=gateway,
        student_id=student_id,
        mobile=mobile,
        provider_session_id=callback.session_id,
        session_channel=session_channel,
    )
    if session_data is None:
        return USSDOutcome(response="END The Mtoni mission is not assigned to this demo learner.")
    session_id, state, session_status = session_data

    if session_status == "completed":
        response = completion_message(state)
        store.save_mobile(
            provider_session_id=callback.session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu="ended",
            state={"screen": "ended", "last_response": response},
            expires_at=current_time + ttl,
            last_request_key=request_key,
        )
        return USSDOutcome(response=response)

    menu_state = _menu_state(mobile, expired)
    if force_main_menu:
        menu_state["screen"] = "main"
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
        if force_main_menu:
            menu_state["screen"] = "main"
        step_index = len(split_cumulative_text(callback.text))
        decision_key = (
            f"sms:{request_key}"
            if session_channel == "sms"
            else f"ussd:{callback.session_id}:{step_index}"
        )
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
                if session_channel == "ussd":
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
                    expires_at=current_time + ttl,
                    last_request_key=request_key,
                    replace_session_id=replace_session_id,
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
        expires_at=current_time + ttl,
        last_request_key=request_key,
        replace_session_id=replace_session_id,
    )
    return USSDOutcome(response=response, session_id=session_id, phone_ref=phone_ref)


def process_sms_game_message(
    *,
    phone_number: str,
    message: str,
    provider_message_id: str | None,
    received_at: str | None,
    link_id: str | None,
    store: WebhookStore,
    gateway: SimulationGateway,
    background_tasks: Any,
    configured_phones: str = "",
) -> USSDOutcome:
    """Run one SMS menu choice through the same persistent deterministic game flow."""
    command = " ".join(message.upper().split())
    modern_ref = _phone_ref(phone_number)
    modern_mobile = store.get_mobile(f"sms:{modern_ref}")
    linked_lookup = getattr(store, "get_linked_student_id", None)
    linked_student = linked_lookup(modern_ref) if linked_lookup else None
    use_portfolio = (
        linked_student is not None
        or (
            modern_mobile is not None
            and isinstance(modern_mobile.state, dict)
            and modern_mobile.state.get("mobile_v2")
        )
        or command
        in {
            "HELP",
            "MSAADA",
            "?",
            "GAMES",
            "MICHEZO",
            "PLAY",
            "START",
            "CONTINUE",
            "ENDELEA",
            "STATUS",
            "PROGRESS",
            "MAENDELEO",
            "STOP",
            "ACHA",
            "OPT IN",
            "ANZA UJUMBE",
        }
        or command.startswith(("JOIN ", "JIUNGE ", "PLAY ", "CHEZA "))
    )
    if use_portfolio:
        reply = process_mobile_sms(
            phone_number=phone_number,
            message=message,
            provider_message_id=provider_message_id,
            received_at=received_at,
            link_id=link_id,
            store=store,
            gateway=gateway,
        )
        return USSDOutcome(response=reply[:160], phone_ref=modern_ref)

    help_reply = "MtaaLab games by SMS: text GAMES, then PLAY number. Reply HELP for commands."
    if command in {"HELP", "?"}:
        return USSDOutcome(response=help_reply)

    phone_ref = phone_reference(phone_number)
    mobile_id = f"sms:{phone_ref}"
    mobile = store.get_mobile(mobile_id)
    if mobile is None and command not in {"PLAY", "START"}:
        return USSDOutcome(
            response="MtaaLab: text GAMES or PLAY to choose a game. Reply HELP for commands."
        )

    force_main_menu = command in {"PLAY", "START", "MENU", "STATUS"}
    start_new_run = False
    if command == "PLAY" and mobile is not None:
        existing_session = store.get_simulation_session(mobile.session_id)
        start_new_run = existing_session is not None and (
            existing_session.status == "completed"
            or (isinstance(mobile.state, dict) and mobile.state.get("screen") == "ended")
        )

    request_source = provider_message_id or f"{received_at or ''}\0{link_id or ''}\0{message}"
    request_key = callback_request_key(mobile_id, request_source)
    callback = USSDCallbackRequest(
        sessionId=mobile_id,
        serviceCode="sms",
        phoneNumber=phone_number,
        text="" if force_main_menu else command,
        networkCode="",
    )
    outcome = process_ussd_callback(
        callback,
        store=store,
        gateway=gateway,
        background_tasks=background_tasks,
        configured_phones=configured_phones,
        session_channel="sms",
        request_key_override=request_key,
        session_ttl=SMS_SESSION_TTL,
        force_main_menu=force_main_menu,
        start_new_run=start_new_run,
    )
    response = outcome.response
    if response.startswith(("CON ", "END ")):
        response = response[4:]
    if response == "This number is not linked to the sandbox demo.":
        response = "This number is not linked yet. Ask your teacher to enable SMS play."
    if outcome.completed:
        response = f"{response} Text PLAY to replay."
    return USSDOutcome(
        response=response[:160],
        completed=outcome.completed,
        session_id=outcome.session_id,
        phone_ref=phone_ref,
    )


def _format_value(value: Any) -> str:
    return format(value, "g") if isinstance(value, int | float) else str(value)
