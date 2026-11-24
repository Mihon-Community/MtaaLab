"""Mocked Africa's Talking callback and SMS acceptance coverage."""

from __future__ import annotations

import logging
import sys
import types
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import get_simulation_gateway
from app.api.schemas import USSDCallbackRequest
from app.api.webhooks import get_webhook_store, router
from app.config import settings
from app.integrations.africas_talking import sms_service
from app.integrations.africas_talking.menu_state import (
    allocation_choices,
    phone_reference,
    render_menu,
)
from app.integrations.africas_talking.ussd_callback import process_ussd_callback
from app.simulation.service import load_scenario

TEST_PHONE = "+254700000111"
SERVICE_CODE = "*384*123#"
WEBHOOK_TEST_TOKEN = "test-webhook-token"


class FakeStore:
    def __init__(self) -> None:
        self.student_id = uuid4()
        self.mission_id = uuid4()
        self.mapping_ref = phone_reference(TEST_PHONE)
        self.mobile: dict[str, SimpleNamespace] = {}
        self.sessions: dict[UUID, SimpleNamespace] = {}
        self.delivery_status: dict[str, dict[str, object]] = {}

    def get_demo_student_id(self, phone_ref: str) -> UUID | None:
        return self.student_id if phone_ref == self.mapping_ref else None

    def get_mobile(self, provider_session_id: str) -> SimpleNamespace | None:
        return self.mobile.get(provider_session_id)

    def get_simulation_session(self, session_id: UUID) -> SimpleNamespace | None:
        return self.sessions.get(session_id)

    def get_active_session(self, student_id: UUID) -> SimpleNamespace | None:
        active = [
            session
            for session in self.sessions.values()
            if session.student_id == student_id and session.status == "active"
        ]
        return active[-1] if active else None

    def get_mtoni_mission_id(self, student_id: UUID) -> UUID | None:
        return self.mission_id if student_id == self.student_id else None

    def save_mobile(
        self,
        *,
        provider_session_id: str,
        phone_ref: str,
        session_id: UUID,
        current_menu: str,
        state: dict[str, object],
        expires_at: datetime,
        last_request_key: str,
        replace_session_id: bool = False,
    ) -> None:
        existing = self.mobile.get(provider_session_id)
        if existing is not None:
            assert existing.phone_ref == phone_ref
            if not replace_session_id:
                assert existing.session_id == session_id
        self.mobile[provider_session_id] = SimpleNamespace(
            provider_session_id=provider_session_id,
            phone_ref=phone_ref,
            session_id=session_id,
            current_menu=current_menu,
            state=state,
            expires_at=expires_at,
            last_request_key=last_request_key,
        )

    def save_sms_status(
        self,
        *,
        provider_message_id: str,
        status: str,
        recipient_ref: str,
        error_code: str | None,
    ) -> None:
        self.delivery_status[provider_message_id] = {
            "status": status,
            "recipient_ref": recipient_ref,
            "error_code": error_code,
        }


class FakeGateway:
    def __init__(self, store: FakeStore) -> None:
        self.store = store
        self.scenario = load_scenario()
        self.start_keys: dict[str, UUID] = {}
        self.decisions: list[tuple[UUID, str, dict[str, object], str]] = []

    def get_or_create_session(
        self, mission_id: UUID, user_id: UUID, idempotency_key: str | None = None
    ) -> dict[str, object]:
        if idempotency_key in self.start_keys:
            session_id = self.start_keys[idempotency_key]
            session = self.store.sessions[session_id]
            return {"session_id": session_id, "state": session.state, "status": session.status}
        session_id = uuid4()
        self.start_keys[idempotency_key or str(uuid4())] = session_id
        session = SimpleNamespace(
            id=session_id,
            student_id=user_id,
            status="active",
            state=dict(self.scenario["initial_state"]),
        )
        self.store.sessions[session_id] = session
        return {"session_id": session_id, "state": session.state, "status": session.status}

    def get_state(self, session_id: UUID, user_id: UUID) -> dict[str, object]:
        session = self.store.sessions[session_id]
        assert session.student_id == user_id
        return {
            "session_id": session_id,
            "status": session.status,
            "turn": session.state["current_turn"],
            "state": session.state,
        }

    def submit_decision(
        self, session_id: UUID, user_id: UUID, action: object, idempotency_key: str
    ) -> SimpleNamespace:
        session = self.store.sessions[session_id]
        assert session.student_id == user_id
        if any(existing[3] == idempotency_key for existing in self.decisions):
            return SimpleNamespace(
                turn=session.state["current_turn"],
                state=SimpleNamespace(model_dump=lambda mode="json": dict(session.state)),
            )
        action_type = action.action_type
        parameters = dict(action.parameters)
        self.decisions.append((session_id, action_type, parameters, idempotency_key))
        action_config = self.scenario["actions"][action_type]
        session.state["current_turn"] += 1
        session.state["budget_remaining"] -= action_config["cost"]
        if action_type not in session.state["used_actions"]:
            session.state["used_actions"].append(action_type)
        if action_type == "repair_main_pipe":
            session.state["leakage"] = max(0, session.state["leakage"] - 2)
        if action_type == "change_allocation":
            session.state["allocation_policy"] = parameters["policy_id"]
        if session.state["current_turn"] >= self.scenario["number_of_turns"]:
            session.status = "completed"
        return SimpleNamespace(
            turn=session.state["current_turn"],
            state=SimpleNamespace(model_dump=lambda mode="json": dict(session.state)),
        )


class FakeBackgroundTasks:
    def __init__(self) -> None:
        self.tasks: list[tuple[object, tuple[object, ...], dict[str, object]]] = []

    def add_task(self, function: object, *args: object, **kwargs: object) -> None:
        self.tasks.append((function, args, kwargs))


@pytest.fixture
def webhook_app(monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, FakeStore, FakeGateway]:
    store = FakeStore()
    gateway = FakeGateway(store)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_webhook_store] = lambda: store
    app.dependency_overrides[get_simulation_gateway] = lambda: gateway
    monkeypatch.setattr(settings, "webhook_token", WEBHOOK_TEST_TOKEN)
    monkeypatch.setattr(settings, "at_ussd_service_code", SERVICE_CODE)
    monkeypatch.setattr("app.api.webhooks.enforce_webhook_rate_limit", lambda *args: None)
    return TestClient(app, headers={"X-Webhook-Token": WEBHOOK_TEST_TOKEN}), store, gateway


def ussd_body(text: str = "", **overrides: str) -> dict[str, str]:
    body = {
        "sessionId": "provider-session-1",
        "serviceCode": SERVICE_CODE,
        "phoneNumber": TEST_PHONE,
        "text": text,
        "networkCode": "639",
    }
    body.update(overrides)
    return body


def test_first_dial_and_repeated_repair_confirmation_apply_once(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, store, gateway = webhook_app

    first = client.post("/api/webhooks/africastalking/ussd", data=ussd_body())
    repair = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1"))
    confirm = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1*1"))
    retry = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1*1"))

    assert (
        first.status_code == repair.status_code == confirm.status_code == retry.status_code == 200
    )
    assert first.text.startswith("CON Mtoni turn 0")
    assert "costs 25 credits" in repair.text
    assert "Decision recorded at turn 1" in confirm.text
    assert confirm.text.splitlines()[1:] == [
        "Water: 60",
        "Budget: 75",
        "1 Repair pipe",
        "2 Save water",
        "3 Water plan",
        "4 Community needs",
        "0 Exit",
    ]
    assert retry.text == confirm.text
    assert len(confirm.text) <= 160
    assert len(gateway.decisions) == 1
    assert gateway.decisions[0][1] == "repair_main_pipe"
    assert gateway.decisions[0][2] == {}
    mobile = store.mobile["provider-session-1"]
    assert mobile.phone_ref == phone_reference(TEST_PHONE)
    assert TEST_PHONE not in str(mobile.state)


def test_final_ussd_turn_queues_one_sms_summary() -> None:
    store = FakeStore()
    gateway = FakeGateway(store)
    gateway.scenario["initial_state"]["current_turn"] = 5
    background = FakeBackgroundTasks()

    first = process_ussd_callback(
        USSDCallbackRequest.model_validate(ussd_body()),
        store=store,
        gateway=gateway,
        background_tasks=background,
    )
    confirmation = process_ussd_callback(
        USSDCallbackRequest.model_validate(ussd_body("1")),
        store=store,
        gateway=gateway,
        background_tasks=background,
    )
    completed = process_ussd_callback(
        USSDCallbackRequest.model_validate(ussd_body("1*1")),
        store=store,
        gateway=gateway,
        background_tasks=background,
    )

    assert first.response.startswith("CON Mtoni turn 5/6")
    assert confirmation.response.startswith("CON Repair main pipe")
    assert completed.completed is True
    assert completed.response.startswith("END Mission complete.")
    assert len(background.tasks) == 1
    function, args, kwargs = background.tasks[0]
    assert function is sms_service.send_mission_sms
    assert args[:2] == (TEST_PHONE, "Mtoni")
    assert "mission is complete" in str(args[2])
    assert kwargs["recipient_ref"] == phone_reference(TEST_PHONE)


def test_root_ussd_callback_accepts_query_token_and_rejects_wrong_url_token(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, _, _ = webhook_app
    query_client = TestClient(client.app, headers={"X-Webhook-Token": "wrong-header-token"})

    accepted = query_client.post(f"/ussd?token={WEBHOOK_TEST_TOKEN}", data=ussd_body())
    rejected = client.post("/ussd?token=wrong-query-token", data=ussd_body("1"))

    assert accepted.status_code == 200
    assert accepted.text.startswith("CON Mtoni turn 0")
    assert rejected.status_code == 401


def test_incoming_sms_callback_returns_help_reply_with_url_token(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _, _ = webhook_app
    query_client = TestClient(client.app)
    sent: list[tuple[str, str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.api.webhooks.send_sms",
        lambda recipient, message, **kwargs: sent.append((recipient, message, kwargs)),
    )

    accepted = query_client.post(
        f"/webhook/incoming?token={WEBHOOK_TEST_TOKEN}",
        data={
            "from": TEST_PHONE,
            "to": "12345",
            "text": " help ",
            "id": "message-1",
            "linkId": "link-1",
            "date": "2026-11-24 12:00:00",
        },
    )
    rejected = client.post(
        "/webhook/incoming?token=wrong-query-token",
        data={"from": TEST_PHONE, "text": "HELLO"},
    )

    assert accepted.status_code == 200
    assert accepted.json() == {"status": "accepted"}
    assert sent == [
        (
            TEST_PHONE,
            "MtaaLab Mtoni by SMS: text PLAY. Reply 1 repair, 2 save water, "
            "3 water plan, 4 needs, or 0 exit. Reply HELP for help.",
            {
                "session_id": None,
                "recipient_ref": phone_reference(TEST_PHONE),
                "sender_id": "12345",
            },
        )
    ]
    assert rejected.status_code == 401


def test_sms_can_start_and_play_mtoni_with_separate_saved_session(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store, gateway = webhook_app
    sent: list[tuple[str, str, dict[str, object]]] = []
    monkeypatch.setattr(
        "app.api.webhooks.send_sms",
        lambda recipient, message, **kwargs: sent.append((recipient, message, kwargs)),
    )

    def incoming(text: str, message_id: str):
        return client.post(
            f"/webhook/incoming?token={WEBHOOK_TEST_TOKEN}",
            data={"from": TEST_PHONE, "text": text, "id": message_id},
        )

    ussd = client.post("/api/webhooks/africastalking/ussd", data=ussd_body())
    started = incoming("PLAY", "sms-message-1")
    repair = incoming("1", "sms-message-2")
    confirmed = incoming("1", "sms-message-3")
    duplicate = incoming("1", "sms-message-3")

    sms_session = store.mobile[f"sms:{phone_reference(TEST_PHONE)}"].session_id
    ussd_session = store.mobile["provider-session-1"].session_id
    assert ussd.status_code == started.status_code == repair.status_code == 200
    assert confirmed.status_code == duplicate.status_code == 200
    assert started.json() == {"status": "accepted"}
    assert "Mtoni turn 0/6" in sent[0][1]
    assert "costs 25 credits" in sent[1][1]
    assert "Decision recorded at turn 1" in sent[2][1]
    assert gateway.store.sessions[sms_session].state["current_turn"] == 1
    assert sms_session != ussd_session
    assert gateway.decisions[-1][3].startswith("sms:")
    assert len(gateway.decisions) == 1


def test_sms_text_requires_play_before_starting_and_uses_short_replies(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store, _ = webhook_app
    sent: list[str] = []
    monkeypatch.setattr(
        "app.api.webhooks.send_sms",
        lambda recipient, message, **kwargs: sent.append(message),
    )
    response = client.post(
        f"/webhook/incoming?token={WEBHOOK_TEST_TOKEN}",
        data={"from": TEST_PHONE, "text": "1", "id": "sms-before-play"},
    )

    assert response.status_code == 200
    assert "Text PLAY to start" in sent[0]
    assert not store.mobile


def test_sms_play_restarts_an_ended_run_on_the_same_phone(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, store, gateway = webhook_app
    old = gateway.get_or_create_session(store.mission_id, store.student_id, "old-sms-run")
    old_session_id = old["session_id"]
    gateway.store.sessions[old_session_id].status = "completed"
    mobile_id = f"sms:{phone_reference(TEST_PHONE)}"
    store.save_mobile(
        provider_session_id=mobile_id,
        phone_ref=phone_reference(TEST_PHONE),
        session_id=old_session_id,
        current_menu="ended",
        state={"screen": "ended", "recent_requests": []},
        expires_at=datetime.now(UTC) + timedelta(days=2),
        last_request_key="old-request",
    )
    sent: list[str] = []
    monkeypatch.setattr(
        "app.api.webhooks.send_sms",
        lambda recipient, message, **kwargs: sent.append(message),
    )

    response = client.post(
        f"/webhook/incoming?token={WEBHOOK_TEST_TOKEN}",
        data={"from": TEST_PHONE, "text": "PLAY", "id": "new-sms-run"},
    )

    new_session_id = store.mobile[mobile_id].session_id
    assert response.status_code == 200
    assert new_session_id != old_session_id
    assert gateway.store.sessions[new_session_id].state["current_turn"] == 0
    assert "Mtoni turn 0/6" in sent[0]


def test_incoming_sms_callback_rejects_missing_or_invalid_sender(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, _, _ = webhook_app
    missing_sender = client.post(
        "/webhook/incoming?token=test-webhook-token", data={"text": "HELP"}
    )
    invalid_sender = client.post(
        "/webhook/incoming?token=test-webhook-token",
        data={"from": "not-a-number", "text": "HELP"},
    )

    assert missing_sender.status_code == invalid_sender.status_code == 400


def test_cancel_invalid_input_and_exit_are_short_and_safe(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, _, gateway = webhook_app
    client.post("/api/webhooks/africastalking/ussd", data=ussd_body())
    confirm = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1"))
    canceled = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1*2"))
    invalid = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1*2*9"))
    exited = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1*2*0"))

    assert "costs 25 credits" in confirm.text
    assert canceled.text.startswith("CON Mtoni turn 0")
    assert "Invalid choice." in invalid.text
    assert "Repair" in invalid.text
    assert exited.text.startswith("END ")
    assert "sandbox demo" in exited.text
    assert gateway.decisions == []
    assert all(len(item.text) <= 160 for item in (confirm, canceled, invalid, exited))


def test_conservation_and_allocation_use_configured_presets(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, _, gateway = webhook_app
    client.post("/api/webhooks/africastalking/ussd", data=ussd_body())
    conservation = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("2"))
    client.post("/api/webhooks/africastalking/ussd", data=ussd_body("2*1"))
    assert "costs 15 credits" in conservation.text
    assert gateway.decisions[0][1:] == (
        "conservation_campaign",
        {"household_reduction_ratio": 0.1},
        "ussd:provider-session-1:2",
    )

    # A new provider session reuses the active simulation but has its own menu state.
    client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("", sessionId="provider-session-2"),
    )
    allocation = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("3", sessionId="provider-session-2"),
    )
    confirm_policy = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("3*2", sessionId="provider-session-2"),
    )
    submitted = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("3*2*1", sessionId="provider-session-2"),
    )
    assert allocation.text.startswith("CON Water plan:")
    assert "cost 0 credits" in confirm_policy.text
    assert submitted.text.startswith("CON Decision recorded")
    assert gateway.decisions[-1][1] == "change_allocation"
    assert gateway.decisions[-1][2] == {"policy_id": "household_focus"}
    assert gateway.decisions[-1][3] == "ussd:provider-session-2:3"


def test_expired_menu_restarts_before_action_submission(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, store, gateway = webhook_app
    first = client.post("/api/webhooks/africastalking/ussd", data=ussd_body())
    mobile = store.mobile["provider-session-1"]
    mobile.state = {"screen": "confirm_repair", "decision_step": 1}
    mobile.current_menu = "confirm_repair"
    mobile.expires_at = datetime.now(UTC) - timedelta(seconds=1)

    restarted = client.post("/api/webhooks/africastalking/ussd", data=ussd_body("1"))

    assert first.text.startswith("CON Mtoni turn 0")
    assert "costs 25 credits" in restarted.text
    assert gateway.decisions == []
    assert store.mobile["provider-session-1"].current_menu == "confirm_repair"


def test_invalid_callback_and_wrong_service_code_return_contract_statuses(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _, _ = webhook_app
    missing = client.post(
        "/api/webhooks/africastalking/ussd",
        data={
            "serviceCode": SERVICE_CODE,
            "phoneNumber": TEST_PHONE,
            "text": "",
            "networkCode": "",
        },
    )
    monkeypatch.setattr(settings, "at_ussd_service_code", SERVICE_CODE)
    wrong_code = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("", serviceCode="*111#"),
    )
    oversized = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body("x" * 501),
    )
    missing_network = client.post(
        "/api/webhooks/africastalking/ussd",
        data={"sessionId": "s", "serviceCode": SERVICE_CODE, "phoneNumber": TEST_PHONE, "text": ""},
    )

    assert missing.status_code == oversized.status_code == missing_network.status_code == 400
    assert wrong_code.status_code == 403
    assert missing.json() == {"detail": "Invalid callback fields"}
    assert wrong_code.json() == {"detail": "Service code mismatch"}


def test_webhooks_require_the_configured_token(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, _, _ = webhook_app
    body = ussd_body()

    missing = client.post(
        "/api/webhooks/africastalking/ussd",
        data=body,
        headers={"X-Webhook-Token": ""},
    )
    incorrect = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={"id": "provider-message-1", "status": "delivered"},
        headers={"X-Webhook-Token": "", "Authorization": "Bearer wrong-token"},
    )
    bearer = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={"id": "provider-message-2", "status": "delivered"},
        headers={"X-Webhook-Token": "", "Authorization": f"Bearer {WEBHOOK_TEST_TOKEN}"},
    )

    assert missing.status_code == incorrect.status_code == 401
    assert bearer.status_code == 200


def test_webhooks_fail_closed_when_token_is_not_configured(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _, _ = webhook_app
    monkeypatch.setattr(settings, "webhook_token", "")

    response = client.post(
        "/api/webhooks/africastalking/ussd",
        data=ussd_body(),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Webhook authentication is not configured"}


def test_ussd_rate_limit_receives_only_host_and_phone_digest(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _, _ = webhook_app
    identifiers: list[tuple[str, ...]] = []
    monkeypatch.setattr(
        "app.api.webhooks.enforce_webhook_rate_limit",
        lambda *values: identifiers.append(values),
    )

    response = client.post("/api/webhooks/africastalking/ussd", data=ussd_body())

    assert response.status_code == 200
    assert identifiers == [("client:testclient", f"phone-ref:{phone_reference(TEST_PHONE)}")]
    assert TEST_PHONE not in repr(identifiers)


def test_all_rendered_screens_fit_provider_limit() -> None:
    scenario = load_scenario()
    state = dict(scenario["initial_state"])
    policy_id = allocation_choices(scenario)[0][0]
    screens = [
        render_menu("main", state, scenario),
        render_menu("confirm_repair", state, scenario),
        render_menu("confirm_conservation", state, scenario),
        render_menu("allocation", state, scenario),
        render_menu("confirm_allocation", state, scenario, {"pending_policy": policy_id}),
        render_menu("inspect", state, scenario),
    ]
    assert all(len(screen) <= 160 for screen in screens)
    assert all(screen.startswith("CON ") for screen in screens)


def test_sms_status_callback_upserts_without_storing_phone(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, store, _ = webhook_app
    first = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={
            "id": "provider-message-1",
            "status": "Success",
            "phoneNumber": TEST_PHONE,
            "failureReason": "Invalid phone number",
        },
    )
    retry = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={
            "id": "provider-message-1",
            "status": "Failed",
            "phoneNumber": TEST_PHONE,
            "failureReason": "Invalid phone number 0712345678 for John Doe",
        },
    )
    record = store.delivery_status["provider-message-1"]

    assert first.json() == retry.json() == {"status": "accepted"}
    assert len(store.delivery_status) == 1
    assert record["status"] == "failed"
    assert record["error_code"] is None
    assert record["recipient_ref"] == phone_reference(TEST_PHONE)
    assert TEST_PHONE not in str(record)
    assert "0712345678" not in str(record)
    assert "John Doe" not in str(record)


def test_sms_status_keeps_known_errors_and_provider_codes_only(
    webhook_app: tuple[TestClient, FakeStore, FakeGateway],
) -> None:
    client, store, _ = webhook_app
    known = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={"id": "known-error", "status": "failed", "failureReason": "Invalid phone number"},
    )
    provider_code = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={"id": "provider-code", "status": "failed", "failureReason": "AT_001"},
    )
    free_text = client.post(
        "/api/webhooks/africastalking/sms-status",
        data={"id": "free-text", "status": "failed", "failureReason": "failed for Jane"},
    )

    assert known.status_code == provider_code.status_code == free_text.status_code == 200
    assert store.delivery_status["known-error"]["error_code"] == "invalid_phone_number"
    assert store.delivery_status["provider-code"]["error_code"] == "at_001"
    assert store.delivery_status["free-text"]["error_code"] is None


def test_missing_sms_key_returns_not_configured_and_warns_once(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    writes: list[dict[str, object]] = []
    monkeypatch.setattr(settings, "at_api_key", None)
    monkeypatch.setattr(sms_service, "_missing_key_warning_emitted", False)
    monkeypatch.setattr(sms_service, "_persist_delivery", lambda **kwargs: writes.append(kwargs))

    with caplog.at_level(logging.WARNING):
        first = sms_service.send_sms(TEST_PHONE, "MtaaLab: Mtoni complete.")
        second = sms_service.send_sms(TEST_PHONE, "MtaaLab: Mtoni complete.")

    assert first.status == second.status == "not_configured"
    assert caplog.text.count("Africa's Talking SMS is not configured") == 1
    assert all(item["recipient_ref"] == phone_reference(TEST_PHONE) for item in writes)
    assert TEST_PHONE not in caplog.text


def test_sms_sdk_is_lazy_and_logs_no_key_or_phone(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    api_key = "test-secret-key-never-log"
    calls: list[tuple[str, str]] = []

    class FakeSMS:
        @staticmethod
        def send(
            message: str, recipients: list[str], sender_id: str | None = None
        ) -> dict[str, object]:
            assert len(message) <= 160
            assert recipients == [TEST_PHONE]
            assert sender_id == "12345"
            return {
                "SMSMessageData": {
                    "Recipients": [
                        {"status": "Success", "statusCode": 101, "messageId": "provider-id-1"}
                    ]
                }
            }

    fake_sdk = types.ModuleType("africastalking")

    def fake_initialize(username: str, key: str) -> None:
        calls.append((username, key))

    fake_sdk.initialize = fake_initialize  # type: ignore[attr-defined]
    fake_sdk.SMS = FakeSMS  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "africastalking", fake_sdk)
    monkeypatch.setattr(settings, "at_api_key", api_key)
    monkeypatch.setattr(settings, "at_username", "sandbox")
    monkeypatch.setattr(sms_service, "_persist_delivery", lambda **kwargs: None)

    assert calls == []
    with caplog.at_level(logging.INFO):
        result = sms_service.send_sms(
            TEST_PHONE,
            "MtaaLab reply",
            sender_id="12345",
        )

    assert result.status == "sent"
    assert result.provider_message_id == "provider-id-1"
    assert calls == [("sandbox", api_key)]
    assert api_key not in caplog.text
    assert TEST_PHONE not in caplog.text


def test_sms_provider_response_sanitizes_ids_and_discards_free_text() -> None:
    result = sms_service._provider_result(
        {
            "SMSMessageData": {
                "Recipients": [
                    {
                        "status": "Failed for Jane Doe\nplease retry",
                        "statusCode": "",
                        "messageId": "provider-id\ninjected",
                    }
                ]
            }
        }
    )

    assert result.status == "failed"
    assert result.error_code == "provider_rejected"
    assert result.provider_message_id == "provider-id_injected"
    assert "\n" not in result.provider_message_id
