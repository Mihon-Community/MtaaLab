"""Deliver consented, low-volume SMS resume nudges from a daily worker loop."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from datetime import time as time_type
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.config import settings
from app.db.models import LearnerChannelLink, ScenarioVersion, SimulationSession
from app.db.session import get_session_factory
from app.integrations.africas_talking.mobile_privacy import decrypt_phone
from app.integrations.africas_talking.sms_service import send_sms
from app.simulation.service import load_versioned_scenario

logger = logging.getLogger("mtaalab.mobile_nudges")
EAT = ZoneInfo("Africa/Nairobi")
QUIET_START = time_type(9, 0)
QUIET_END = time_type(20, 0)
MONTHLY_CAP = 4


def deliver_due_nudges(*, now: datetime | None = None) -> dict[str, int]:
    """Send at most one nudge per new active turn and four per learner/month."""
    local_now = (now or datetime.now(UTC)).astimezone(EAT)
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    if not QUIET_START <= local_now.time().replace(tzinfo=None) < QUIET_END:
        counts["skipped"] += 1
        return counts
    if not (settings.at_api_key or "").strip():
        counts["skipped"] += 1
        return counts

    period = local_now.strftime("%Y-%m")
    factory = get_session_factory()
    with factory() as db:
        links = list(
            db.scalars(
                select(LearnerChannelLink)
                .where(
                    LearnerChannelLink.consent_status == "opted_in",
                    LearnerChannelLink.encrypted_phone.is_not(None),
                )
                .with_for_update(skip_locked=True)
            )
        )
        for link in links:
            current = db.scalar(
                select(SimulationSession)
                .where(
                    SimulationSession.student_id == link.student_id,
                    SimulationSession.status == "active",
                )
                .order_by(SimulationSession.started_at.desc(), SimulationSession.id.desc())
                .limit(1)
            )
            if current is None or current.current_turn <= 0:
                counts["skipped"] += 1
                continue
            if (
                link.nudge_last_session_id == current.id
                and link.nudge_last_turn is not None
                and link.nudge_last_turn >= current.current_turn
            ):
                counts["skipped"] += 1
                continue
            used = link.nudge_count if link.nudge_period == period else 0
            if used >= MONTHLY_CAP:
                counts["skipped"] += 1
                continue
            version = db.get(ScenarioVersion, current.mission_version_id)
            if version is None:
                counts["skipped"] += 1
                continue
            try:
                scenario = load_versioned_scenario(version.rules_version)
                phone = decrypt_phone(link.encrypted_phone or "")
            except (LookupError, ValueError):
                logger.warning("SMS nudge skipped: scenario or phone key unavailable")
                counts["failed"] += 1
                continue

            title = str(scenario.get("title", "your game"))
            short_title = "Soko" if "Mama Mboga" in title else title[:24]
            turn = current.current_turn + 1
            if link.preferred_language == "sw":
                message = (
                    f"MtaaLab: Zamu {turn} ya {short_title} iko tayari. "
                    "Jibu ENDELEA. ACHA kusitisha."
                )
            else:
                message = (
                    f"MtaaLab: Your {short_title} turn {turn} is ready. "
                    "Reply CONTINUE. STOP ends reminders."
                )

            # Persist the cap and turn marker before sending so a crash or an
            # ambiguous provider timeout cannot accidentally send duplicates.
            link.nudge_period = period
            link.nudge_count = used + 1
            link.nudge_last_session_id = current.id
            link.nudge_last_turn = current.current_turn
            db.commit()
            result = send_sms(
                phone,
                message,
                session_id=current.id,
                recipient_ref=link.phone_ref,
            )
            counts["sent" if result.status == "sent" else "failed"] += 1
    return counts


def main() -> None:
    """Poll once per minute; delivery remains opt-in, quiet-hour and cap guarded."""
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            result = deliver_due_nudges()
            if result["sent"] or result["failed"]:
                logger.info("SMS nudge run complete", extra=result)
        except Exception as error:
            logger.error("SMS nudge worker failed", extra={"error_code": type(error).__name__})
        time.sleep(60)


if __name__ == "__main__":
    main()
