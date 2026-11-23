# Supabase project setup and status

This repository is connected to the MtaaLab Supabase project. Do not print, commit, or paste credential values. The backend uses the root `.env`; nested backend/frontend environment files are not required.

## Applied database changes

These migrations have been applied to the connected project in order:

1. `migrations/0001_initial_schema.sql` — initial application schema and RLS policies.
2. `migrations/0002_rls_and_index_hardening.sql` — hardened internal policy helper, restricted its grants, added missing foreign-key indexes, and optimized policy identity calls.
3. `migrations/0003_replay_idempotency.sql` — added an optional replay creation key and per-parent uniqueness.
4. `migrations/0004_session_creation_idempotency.sql` — added unique per-student/per-version keys for original session creation.
5. `migrations/0005_assignments_and_mobile.sql` — added teacher-managed class assignments, a backend-only sandbox phone mapping, assessment and SMS callback idempotency indexes, and the USSD callback request key.
6. `migrations/0006_assignment_school_scope.sql` - limits assignment reads to same-school teachers and active students.

`seed.sql` has been applied with synthetic demo fixtures. It created a demo school, profiles, class/membership, mission, and scenario version. Migration 0005 assigned Mtoni to the demo class. The configured sandbox test phone is mapped to the synthetic Demo Student using only its SHA-256 reference; the raw phone is not stored. No synthetic simulation sessions or persistence-test rows remain. Persistence tests use uniquely identified fixtures and clean up only rows they create.

All public application tables have RLS enabled. A direct anonymous-role insert check was denied and rolled back. The security advisor reports leaked-password protection disabled; enable it in the Auth settings when the project owner is ready. A database password rotation is also outstanding because the connected SQL tool does not permit changing role passwords.

The local backend can use `SUPABASE_DB_URL` for PostgreSQL persistence, but the current development runner cannot resolve/reach the database host. Real-database pytest cases therefore fail during connection setup here; CI skips them when the URL is not configured. See `docs/INTEGRATION_STATUS.md` for validation details.

## Remaining Supabase work

- Generate and review TypeScript types after the frontend begins consuming the schema.
- Create the planned buckets (`mission-assets`, `session-reports`, `student-submissions`, `generated-audio`) with narrowly scoped policies before implementing uploads.
- Rotate the database password in the Supabase Dashboard and update the root `.env`.

The backend's primary persistence path is SQLAlchemy/psycopg using `SUPABASE_DB_URL`. `SUPABASE_SECRET_KEY` is backend-only and must only be used behind explicit FastAPI authorization because it bypasses RLS.
