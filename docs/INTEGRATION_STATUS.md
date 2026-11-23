# Backend integration status

Date: 2026-11-23

## Verified work

- Deterministic Mtoni engine, action validation, allocation policies, scripted events, state bounds, and water accounting are implemented. Unit coverage exhausts all six-turn action sequences.
- PostgreSQL-backed services atomically persist decisions, events, snapshots, session state, AI status, and replay children. Session locking and decision/replay idempotency are implemented.
- FastAPI routes cover published mission metadata, session creation/state/history, decisions, replay, debrief, reports, and health. API unit tests exercise the route flow with explicit fake services and auth.
- Supabase access tokens are validated against the project's ES256 JWKS; role comes from the profile table. Student ownership and teacher class-assignment checks are enforced.
- NVIDIA stakeholder dialogue, qualitative reasoning feedback, and debriefs use validated schemas, allowlists, bounded prompts, de-identification, and safe fallbacks. The AI cannot change numeric simulation values.
- `GET /api/health` returned `{"status":"ok"}` from a locally started Uvicorn process.
- The CI workflow can also be run manually and scans full Git history with the open-source Gitleaks CLI, without requiring an organization license secret.

Commands and results from `backend/`:

| Command | Result |
|---|---|
| `.venv\\Scripts\\python.exe -m pytest -q -m "not integration and not nvidia" -p no:cacheprovider` | 73 passed, 5 deselected. |
| `.venv\\Scripts\\python.exe -m pytest -q tests/test_africastalking.py -p no:cacheprovider` | 12 passed after the final SMS sanitization changes. |
| `.venv\\Scripts\\ruff.exe check .` | Passed. |
| `.venv\\Scripts\\ruff.exe format --check .` | Passed; all 69 Python files formatted. |
| SQLAlchemy connection check using `SUPABASE_DB_URL` | Failed with `OperationalError`; direct PostgreSQL integration tests were not run. No connection details or credentials were printed. |
| Live NVIDIA smoke test | Passed in an earlier full test invocation. It was excluded from the final combined test run. |
| Uvicorn + `GET http://127.0.0.1:8765/api/health` | Returned `ok`; server was stopped after the check. |

The API-level full flow test is present and runs against PostgreSQL when reachable. A live authenticated API-to-database flow could not be verified from this runner because direct database connections fail before fixture setup. The API route tests use dependency overrides and are unit tests, not a substitute for that live run. The manual Africa's Talking SMS script was not run; no SMS was sent.

## §14 acceptance coverage

| ID | Status | Evidence / limit |
|---|---|---|
| SIM-01 | Pass | Deterministic same-input unit test. |
| SIM-02 | Pass | Unaffordable action is rejected without state mutation. |
| SIM-03 | Pass | Out-of-range action parameter is rejected. |
| SIM-04 | Pass | Accounting invariant covered by per-turn and six-turn sequence tests. |
| SIM-05 | Partial | Decision and session-create duplicate handling pass unit tests; decision, replay, and session-create integration checks are implemented but were not run because the database connection check returned `OperationalError`. |
| SIM-06 | Partial | Concurrent-turn integration test is implemented; it was not run because the database connection check returned `OperationalError`. |
| AI-01 | Pass | Malformed output uses static fallback. |
| AI-02 | Pass | Unsupported fact references are rejected to fallback. |
| AI-03 | Pass | Timeout and missing-key fallbacks keep the engine unaffected; live NVIDIA smoke passed. |
| DB-01 | Partial | A foreign-student state request through FastAPI and the persistence authorization boundary returns `404` without exposing a record. Live PostgreSQL fixture flow remains unavailable. |
| DB-02 | Pass, manual | MCP SQL check as `anon` denied a synthetic write and rolled back. Automated direct-connection test was not run because the connection check returned `OperationalError`. |
| AT-01 | Pass, mocked | First dial, repair confirmation, duplicate retry, cancellation, invalid input, exit, expiry, bounded screens, and shared-engine submission are covered by mocked callback tests. No provider USSD session was run. |
| AT-02 | Partial | Provider status callbacks upsert idempotently with sanitized error codes; outbound delivery is mocked and recorded. No live SMS was sent or handset delivery verified. |
| AT-03 | Pass, mocked | Missing-key behavior returns `not_configured`, logs one warning, and does not raise. |
| MOB-01 | Partial | Same-key API and USSD retry paths are covered with fake services; offline/reconnect UI behavior is frontend work. Live database retry check was not run. |
| REP-01 | Partial | API replay contract and isolated DB test are implemented; DB test was not run because the connection check returned `OperationalError`. Test asserts same initial state and unchanged source when run with connectivity. |

## Supabase changes and rows

Applied migrations:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_and_index_hardening.sql`
3. `supabase/migrations/0003_replay_idempotency.sql`
4. `supabase/migrations/0004_session_creation_idempotency.sql`
5. `supabase/migrations/0005_assignments_and_mobile.sql`
6. `supabase/migrations/0006_assignment_school_scope.sql`

The synthetic seed is applied: one demo school, two profiles, one class membership, one mission, and one scenario version. Mtoni is assigned to the demo class. One sandbox phone mapping points to the synthetic demo student using only a SHA-256 `phone_ref`; the raw phone is not stored. No simulation sessions or integration-test rows remain. Integration fixtures use generated synthetic identities and clean up only rows created by the test.

## Assumptions and limits

- All scenario quantities are fictional water units and budget credits. `backend/app/simulation/scenarios/mtoni_v1.json` is marked `placeholder - pending team review`; the six-week duration, initial reservoir/budget, inflows, demands, action costs/effects, thresholds, policies, and scripted events need team review before any classroom use.
- Mission discovery and session creation are assignment-scoped; teachers manage assignments for their own same-school classes, and active students whose profile school matches the class school can read their assignments.
- Session creation idempotency is per student and immutable mission version. Decision idempotency is per session; replay idempotency is per parent session. AI prompts scrub self-identification and school phrases, and output validation rejects numeric claims expressed as words as well as digits.
- MVP turn advancement is combined with a decision; `/advance` returns `409`. Reasoning assessments are accepted only after mission completion and persist once per rubric version.
- Africa's Talking callbacks use the deterministic gateway and do not call NVIDIA; frontend offline behavior is not implemented in this backend work.
- The project's Auth JWKS reports ES256 and is used for JWT validation. Supabase security advisor reports leaked-password protection disabled.
- The SQL MCP tool rejected database-role password changes; no password rotation was performed. Rotate the database password in the Supabase Dashboard and update the root `.env`.

## Delivery

- Branch: `feature/lennox` (kept as the owner's renamed branch; no force-push or merge).
- PR: [#2 — backend simulation and Supabase integration](https://github.com/Mihon-Community/MtaaLab/pull/2), open against `develop`; frontend-owner API-contract review is pending.
- CI: [run 45214828452 passed](https://github.com/Mihon-Community/MtaaLab/actions/runs/45214828452) for backend, frontend, Docker, and secret-scan jobs.
- Needs Lennox: rotate the database password and update the local root `.env`; enable leaked-password protection in Auth settings; review placeholder scenario values; review the documented API differences with the frontend owner. The root `.env` is ignored and is not part of the branch.
