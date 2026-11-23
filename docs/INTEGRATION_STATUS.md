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
| `.venv\\Scripts\\python.exe -m pytest -q -m "not integration and not nvidia" -p no:cacheprovider` | 36 passed; 5 integration/live tests deselected. |
| `.venv\\Scripts\\ruff.exe check .` | Passed. |
| `.venv\\Scripts\\ruff.exe format --check .` | Passed; all 59 Python files formatted. |
| `.venv\\Scripts\\python.exe -m pytest -q --tb=no -m "integration or nvidia" -p no:cacheprovider` | 1 live NVIDIA smoke test passed; 4 direct-Postgres checks skipped because the runner cannot reach the Supabase database host. |
| `.venv\\Scripts\\python.exe -m pytest -q --tb=no -p no:cacheprovider` | 37 passed, 4 skipped (the direct-Postgres checks above). |
| Uvicorn + `GET http://127.0.0.1:8765/api/health` | Returned `ok`; server was stopped after the check. |

The API-level full flow test is present and runs against PostgreSQL when reachable. A live authenticated API-to-database flow could not be verified from this runner because direct database connections fail before fixture setup. The API route tests use dependency overrides and are unit tests, not a substitute for that live run.

## §14 acceptance coverage

| ID | Status | Evidence / limit |
|---|---|---|
| SIM-01 | Pass | Deterministic same-input unit test. |
| SIM-02 | Pass | Unaffordable action is rejected without state mutation. |
| SIM-03 | Pass | Out-of-range action parameter is rejected. |
| SIM-04 | Pass | Accounting invariant covered by per-turn and six-turn sequence tests. |
| SIM-05 | Partial | Decision and session-create duplicate handling pass unit tests; decision, replay, and session-create integration checks are implemented but skip due database connectivity. |
| SIM-06 | Partial | Concurrent-turn integration test is implemented; it skips due database connectivity. |
| AI-01 | Pass | Malformed output uses static fallback. |
| AI-02 | Pass | Unsupported fact references are rejected to fallback. |
| AI-03 | Pass | Timeout and missing-key fallbacks keep the engine unaffected; live NVIDIA smoke passed. |
| DB-01 | Pass | A foreign-student state request through FastAPI and the active persistence authorization boundary returns `404` without exposing a record. Live PostgreSQL fixture flow remains unavailable. |
| DB-02 | Pass, manual | MCP SQL check as `anon` denied a synthetic write and rolled back. Automated direct-connection test skips on this runner. |
| AT-01 | Not done | Africa's Talking/USSD is out of scope. |
| AT-02 | Not done | SMS delivery/status is out of scope. |
| AT-03 | Not done | Africa's Talking missing-key behavior is out of scope. |
| MOB-01 | Partial | Same-key API retry path is covered with a fake gateway; offline/reconnect UI behavior is frontend work. Live database retry check skips. |
| REP-01 | Partial | API replay contract and isolated DB test are implemented; DB test skips here. Test asserts same initial state and unchanged source when run with connectivity. |

## Supabase changes and rows

Applied migrations:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_rls_and_index_hardening.sql`
3. `supabase/migrations/0003_replay_idempotency.sql`
4. `supabase/migrations/0004_session_creation_idempotency.sql`

The synthetic seed is applied: one demo school, two profiles, one class membership, one mission, and one scenario version. No simulation sessions or integration-test rows remain. Integration fixtures use generated synthetic identities and clean up only rows created by the test.

## Assumptions and limits

- All scenario quantities are fictional water units and budget credits. `backend/app/simulation/scenarios/mtoni_v1.json` is marked `placeholder - pending team review`; the six-week duration, initial reservoir/budget, inflows, demands, action costs/effects, thresholds, policies, and scripted events need team review before any classroom use.
- The schema has no mission-assignment relation, so authenticated profiles currently see every published mission. Learner session records remain owner-scoped. Add assignment filtering with that schema relationship.
- Session creation idempotency is per student and immutable mission version. Decision idempotency is per session; replay idempotency is per parent session. AI prompts scrub self-identification and school phrases, and output validation rejects numeric claims expressed as words as well as digits.
- MVP turn advancement is combined with a decision; `/advance` returns `409`. Reports currently return `assessment: null`.
- Africa's Talking and frontend offline behavior are intentionally not implemented in this backend work.
- The project's Auth JWKS reports ES256 and is used for JWT validation. Supabase security advisor reports leaked-password protection disabled.
- The SQL MCP tool rejected database-role password changes; no password rotation was performed. Rotate the database password in the Supabase Dashboard and update the root `.env`.

## Delivery

- Branch: `feature/lennox` (kept as the owner's renamed branch; no force-push or merge).
- PR: [#2 — backend simulation and Supabase integration](https://github.com/Mihon-Community/MtaaLab/pull/2), open against `develop`; frontend-owner API-contract review is pending.
- CI: [run 45197670182 passed](https://github.com/Mihon-Community/MtaaLab/actions/runs/45197670182) for backend, frontend, Docker, and secret-scan jobs. The pull request remains unmerged; frontend-owner API-contract review is pending.
- Needs Lennox: rotate the database password and update the local root `.env`; enable leaked-password protection in Auth settings; review placeholder scenario values; review the documented API differences with the frontend owner. The root `.env` is ignored and is not part of the branch.
