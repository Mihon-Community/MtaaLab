"""Exercise real Supabase code redemption and SMS consent using demo fixtures only."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete

from app.config import settings
from app.db.models import LearnerChannelLink, MobileJoinCode
from app.db.session import get_session_factory
from app.integrations.africas_talking.mobile_privacy import (
    decrypt_phone,
    phone_hmac_reference,
)
from app.integrations.africas_talking.ussd_callback import SQLAlchemyWebhookStore

DEMO_CLASS_ID = UUID("20000000-0000-4000-8000-000000000001")
DEMO_TEACHER_ID = UUID("00000000-0000-4000-8000-000000000101")
DEMO_STUDENT_ID = UUID("00000000-0000-4000-8000-000000000102")
TEST_PHONE = "+254700999999"
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def main() -> int:
    """Create and remove only this run's temporary synthetic access records."""
    pepper = (settings.mobile_join_code_pepper or "").strip()
    if len(pepper) < 32:
        raise RuntimeError("MOBILE_JOIN_CODE_PEPPER must be configured")
    if len((settings.phone_hmac_secret or "").strip()) < 32:
        raise RuntimeError("PHONE_HMAC_SECRET must be configured")
    if not (settings.phone_encryption_key or "").strip():
        raise RuntimeError("PHONE_ENCRYPTION_KEY must be configured")

    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    code_digest = hmac.new(pepper.encode(), code.encode("ascii"), hashlib.sha256).hexdigest()
    phone_ref = phone_hmac_reference(TEST_PHONE)
    code_id = uuid4()

    factory = get_session_factory()
    with factory() as db:
        try:
            db.add(
                MobileJoinCode(
                    id=code_id,
                    class_id=DEMO_CLASS_ID,
                    student_id=DEMO_STUDENT_ID,
                    code_digest=code_digest,
                    created_by=DEMO_TEACHER_ID,
                    expires_at=datetime.now(UTC) + timedelta(minutes=5),
                )
            )
            db.commit()

            store = SQLAlchemyWebhookStore(db)
            if store.redeem_join_code(code, phone_ref) != DEMO_STUDENT_ID:
                raise RuntimeError("Synthetic learner code redemption failed")
            if store.redeem_join_code(code, phone_ref) != DEMO_STUDENT_ID:
                raise RuntimeError("Same-phone provider retry was not idempotent")

            link = db.get(LearnerChannelLink, phone_ref)
            if link is None or link.encrypted_phone is not None or link.consent_status != "linked":
                raise RuntimeError("Linking a phone stored an address or enabled reminders")
            if not store.set_sms_consent(phone_ref, TEST_PHONE, opted_in=True):
                raise RuntimeError("SMS opt-in could not be saved")
            link = db.get(LearnerChannelLink, phone_ref)
            if link is None or decrypt_phone(link.encrypted_phone or "") != TEST_PHONE:
                raise RuntimeError("Opt-in phone encryption could not be verified")
            if not store.set_sms_consent(phone_ref, TEST_PHONE, opted_in=False):
                raise RuntimeError("SMS STOP could not be saved")
            link = db.get(LearnerChannelLink, phone_ref)
            if link is None or link.encrypted_phone is not None or link.consent_status != "stopped":
                raise RuntimeError("STOP did not clear the encrypted phone address")

            print(
                "Mobile privacy smoke check passed: redeem, retry, opt-in encryption, STOP cleanup."
            )
            return 0
        finally:
            db.execute(delete(LearnerChannelLink).where(LearnerChannelLink.phone_ref == phone_ref))
            db.execute(delete(MobileJoinCode).where(MobileJoinCode.id == code_id))
            db.commit()


if __name__ == "__main__":
    raise SystemExit(main())
