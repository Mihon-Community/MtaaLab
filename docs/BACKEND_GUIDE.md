# Backend guide

## Scope and ownership

The backend owns authenticated Mtoni mission and simulation APIs, deterministic turn calculations, persistence, history, replay, guarded NVIDIA feedback, assignment-scoped mission access, and Africa's Talking sandbox callbacks. Frontend integration remains out of scope. Current work is on `feature/lennox`; the frontend branch remains `feature/steve`.

## Local setup

Use Python 3.12. From repository root:

```powershell
Copy-Item .env.example .env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Both apps read the root `.env`; do not create nested `.env` files. The app can boot with optional AI credentials absent. Health is `GET http://localhost:8000/api/health`.

Run local unit/API tests and static checks from `backend/`:

```powershell
pytest -q -m "not integration and not nvidia"
ruff check .
ruff format --check .
```

Real database acceptance checks use only isolated synthetic fixtures and remove only rows created by that test. Run them with:

```powershell
pytest -q -m integration
```

They require a reachable `SUPABASE_DB_URL`. The current development runner cannot resolve/reach the Supabase database host directly, so those checks fail during connection setup here. CI has no database credential and skips the checks. The optional live NIM smoke test is marked `nvidia` and skips when `NVIDIA_API_KEY` is absent. No secrets are needed for unit tests.

## Code map

- `app/api/`: JWT-backed profile dependency, mission discovery, simulations, decisions, reports, health, and Africa's Talking callbacks.
- `app/simulation/engine.py`: deterministic turn orchestration; `world_state.py`: bounded state and result models; `allocation_rules.py`: explicit water policy; `action_validator.py`: ranges, costs, and prerequisites; `event_catalogue.py`: scripted events; `service.py`: transactional PostgreSQL gateway; `replay.py`: isolated child sessions.
- `app/ai/`: configurable NVIDIA NIM client, stakeholder dialogue, reasoning evaluation, debrief, strict output schemas, and prompts.
- `app/db/`: SQLAlchemy models, repositories, connection/session helpers. SQL migrations are in `supabase/migrations/`.
- `app/integrations/africas_talking/`: bounded USSD menu transitions, SMS delivery, and callback orchestration over the shared simulation service.
- `app/learning/`: idempotent persistence and report serialization for qualitative assessments.
- `app/security/`: Supabase JWKS JWT validation, authorization helpers, and public webhook rate limiting.
- `tests/`: engine and API unit tests, persistence integration checks, auth tests, AI fallback tests, and optional live NIM smoke test.

## Invariants

- The specification says the model must never decide water quantities, costs, budgets, crop health, or service levels. The engine is deterministic for a scenario version, prior state, and validated action.
- A decision is atomic: decision row, events, snapshot, and current-session pointer commit together. Session row locking, expected-turn validation, and an idempotency key prevent double application.
- Replay creates a separate run with the same scenario version and initial state; it never overwrites its source.
- Supabase/NVIDIA credentials remain backend-only. `SUPABASE_DB_URL` is the SQLAlchemy/psycopg persistence path. Never put secret keys into `VITE_` variables.
- Validate NIM output with Pydantic; enforce actor and fact allowlists and length limits; use safe static/factual fallbacks. AI failure does not block a turn.
- Keep names, phone numbers, school IDs, prompts, and hidden reasoning out of AI audit records. Only validated output and operational metadata are stored.
- RLS stays enabled. Browser roles cannot write authoritative simulation data.
- Mission discovery and session creation require an assignment to one of the learner's active classes; teachers may manage assignments only in their own school-scoped classes.
- Public Africa's Talking callbacks require the root `WEBHOOK_TOKEN` through `X-Webhook-Token` or Bearer authorization; an unset token fails closed. USSD input is parsed as a bounded cumulative path and submitted through the same deterministic simulation gateway as the PWA. The callback stores only a hashed phone reference, uses a 180-second menu expiry, and replays a stored response for a duplicate request. It never calls NVIDIA.
- Outbound sandbox SMS is lazy-initialized, limited to 160 characters, and persisted to `delivery_logs`; the test-send script is manual only and is not run by CI.
- A qualitative assessment is only created after mission completion and is unique per session and rubric version.

## Supabase status

The connected project has migrations 0001-0006, including assignment/mobile callback storage and same-school assignment read policy, applied. The synthetic Mtoni mission is assigned to its demo class, and one synthetic phone mapping stores only the SHA-256 reference. See `supabase/README.md` and `docs/INTEGRATION_STATUS.md`. The Supabase security advisor currently reports leaked-password protection disabled; this is an Auth Dashboard setting. A database password rotation also remains for the project owner because the available MCP SQL tool rejected role password changes.

## Scenario and API limits

Scenario values use fictional water units and budget credits. `backend/app/simulation/scenarios/mtoni_v1.json` is explicitly marked placeholder pending team review. Mission discovery and session creation are assignment-scoped. Session creation supports per-student, per-mission-version idempotency; decision keys are scoped to a session and replay keys to a parent session. A separate no-action `/advance` is not supported; submitting a decision advances one turn. See `docs/API_CONTRACT.md` for exact request/response behavior and `docs/SIMULATION_RULES.md` for formulas.

## MVP acceptance ownership

The backend work covers SIM-01..06, AI-01..03, DB-01..02, REP-01, AT-01..03, and the server side of MOB-01 to the status recorded in `docs/INTEGRATION_STATUS.md`. Frontend offline/reconnect behavior is not implemented here. No real handset SMS delivery has been verified.
