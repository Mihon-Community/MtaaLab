"""Manually send one short Africa's Talking sandbox test message."""

from __future__ import annotations

from app.config import settings
from app.integrations.africas_talking.sms_service import send_mission_sms


def main() -> int:
    """Send only to AT_TEST_PHONE; this script is never part of CI."""
    if (settings.at_username or "sandbox").strip().casefold() != "sandbox":
        print("This helper is sandbox-only. No live SMS was sent.")
        return 2

    recipient = (settings.at_test_phone or "").strip()
    if not recipient:
        print("AT_TEST_PHONE is not configured.")
        return 2

    result = send_mission_sms(
        recipient,
        mission="Mtoni",
        summary="This is a sandbox test. No learner details are included.",
    )
    print(f"SMS send status: {result.status}")
    if result.error_code:
        print(f"Provider error code: {result.error_code}")
    return 0 if result.status == "sent" else 1


if __name__ == "__main__":
    raise SystemExit(main())
