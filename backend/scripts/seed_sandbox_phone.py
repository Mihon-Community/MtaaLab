"""Map the configured sandbox test number to the synthetic demo learner."""

from __future__ import annotations

from hashlib import sha256

from sqlalchemy import text

from app.config import settings
from app.db.session import build_engine


def main() -> None:
    """Persist a SHA-256 phone reference without writing the raw number."""
    phone = (settings.at_test_phone or "").strip()
    if not phone:
        raise SystemExit("AT_TEST_PHONE must be set in the repository-root .env")
    if not settings.supabase_db_url:
        raise SystemExit("SUPABASE_DB_URL must be set in the repository-root .env")

    phone_ref = sha256(phone.encode("utf-8")).hexdigest()
    statement = text(
        """
        insert into public.sandbox_phone_mappings(phone_ref, student_id)
        select :phone_ref, p.id
        from public.profiles p
        where p.display_name = 'Demo Student' and p.role = 'student'
        on conflict (phone_ref)
        do update set student_id = excluded.student_id
        """
    )
    engine = build_engine(settings.supabase_db_url)
    try:
        with engine.begin() as connection:
            result = connection.execute(statement, {"phone_ref": phone_ref})
            if result.rowcount != 1:
                raise RuntimeError("The synthetic Demo Student profile was not found")
    finally:
        engine.dispose()
    print("Seeded the synthetic sandbox phone mapping.")


if __name__ == "__main__":
    main()
