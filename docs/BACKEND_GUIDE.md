# Backend guide

## Ownership

Developer 2 owns `feature/lennx` (the task's branch-ownership header also says `feature/lennox`; confirm spelling before publishing). The frontend owner is Developer 1 on `feature/steve`. The specification's hard rule is: **“FastAPI is the trusted application boundary.”** And: **“backend owns simulation state and business rules.”** All authoritative decisions belong to the backend.

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

macOS/Linux: copy the root `.env.example` to `.env`, then run `python3.12 -m venv .venv`, `source .venv/bin/activate`, `pip install -r requirements-dev.txt`, and `uvicorn app.main:app --reload`. Both apps read the root `.env`; do not create nested `.env` files. The app boots with empty secrets. Run `pytest -q`, `ruff check .`, and `ruff format --check .` from `backend/`. Health is `GET http://localhost:8000/api/health`.

## Folder map

- `app/api/`: auth dependency and mission, simulation, decision, report, and webhook routes.
- `app/simulation/engine.py`: deterministic turn orchestration; `world_state.py`: bounded state; `allocation_rules.py`: explicit water policy; `action_validator.py`: ranges/cost/prerequisites; `event_catalogue.py`: pre-approved effects; `replay.py`: create a new run.
- `app/ai/`: configurable NIM client, stakeholder dialogue, reasoning evaluator, debrief, and Pydantic output schemas. `prompts/` contains templates.
- `app/learning/`: objective, rubric, and progress evidence.
- `app/integrations/africas_talking/`: SMS sender, USSD callback, and bounded server-side menu state.
- `app/integrations/lti/`: simulated launch adapter only; real LTI is later.
- `app/db/`: SQLAlchemy models and repositories; migrations in the repository's `supabase/migrations/`.
- `app/security/`: Supabase JWKS JWT validation and ownership/class/teacher checks.
- `tests/`: pytest health check and SIM-01..06 placeholders.

## Rules to preserve

- The specification says: **“The model must never decide water quantities, costs, budgets, crop percentages or service levels.”** The engine is deterministic for scenario version + seed + prior state + validated action.
- A turn is atomic: decision, events, snapshot, and current-session pointer commit together. Use a row lock or optimistic concurrency. Check an `Idempotency-Key` and expected turn to prevent retry/concurrency duplication.
- Replay starts another session from the same immutable scenario and initial state; it never overwrites its source.
- NVIDIA/AT/Supabase secret/database credentials stay backend-only. `SUPABASE_DB_URL` is the primary SQLAlchemy/psycopg persistence path; `SUPABASE_SECRET_KEY` is optional for privileged Supabase APIs and requires explicit FastAPI authorization.
- Validate NIM output with Pydantic, check actor/fact allowlists and size limits, and use a safe prewritten fallback. An AI timeout must not block a turn.
- Strip names, phone numbers, school IDs, and direct PII before constructing prompts. Log model ID, latency, task, schema status, and token use when available; never retain hidden reasoning traces.

## Simulation contract

State includes reservoir level/capacity, configured rainfall inflow, per-sector household/school/clinic/farm demand, leakage, remaining budget, service levels, crop health, and wellbeing. Water units and budget credits are fictional and labelled as such. State must be bounded; demand is nonnegative and scenario-limited; leakage cannot be negative. Turn duration and units must agree.

MVP actions: repair main leaking pipe; introduce conservation campaign; change water allocation (respect minimum critical-service constraints); install storage capacity (storage does not create water); adopt efficient irrigation (farm demand and crop-health trade-off). Calculation order: load prior state; apply approved action and configured event/inflow; compute availability, demand, allocation and unmet demand under one documented policy; clamp reservoir to configured capacity; update budget/service indicators; persist immutable event and snapshot. Never infer numeric inputs from model text.

## NVIDIA NIM

Use `openai` with `NVIDIA_BASE_URL`, `NVIDIA_MODEL`, optional key, and a bounded timeout (spec example: 20 seconds). Never hard-code a model ID in application logic. Send minimal state facts, actor persona, age-appropriate rules, and learning objective. Request small structured output and validate it. Stakeholder fallback is approved static dialogue; debrief fallback is a factual engine-generated summary. Display that AI feedback is unavailable when applicable; simulation continues.

## Supabase and authorization

SQLAlchemy/psycopg connects through `SUPABASE_DB_URL`. Validate bearer JWT issuer, signature, expiry, and audience using project-supported JWKS. Before every learner-data read/write, verify role, school/class membership, session ownership, and teacher assignment. Use constraints and transaction checks in addition to application checks. RLS is enabled on exposed tables with explicit per-operation policies; client writes to authoritative simulation data are denied. Never send a service/secret key to the browser.

## Africa's Talking

The SMS service uses backend `AT_USERNAME` (`sandbox`) and `AT_API_KEY`; do not include sensitive learner details in short age-appropriate messages. USSD accepts a validated form callback (`sessionId`, service code, phone, full text), associates it with a synthetic test learner and session, and uses the same simulation service. Return concise `CON` or `END`. Keep menu state server-side, expire abandoned sessions, bound history, rate-limit, and deduplicate callbacks. Use ngrok HTTPS only for local sandbox callback testing; sandbox is not proof of open-network handset delivery.

## 11-hour build order (§13)

1. **0–1h:** agree contract, variables, transaction; joint shape checkpoint.
2. **1–3h:** FastAPI/config/Supabase project and schema baseline; confirm one action contract.
3. **3–5h:** deterministic engine, state/actions, unit tests.
4. **5–7h:** decision validation, transaction, persistence, history. At hour 7 cut scope.
5. **7–9h:** atomic turn and history API; joint checkpoint: one action changes confirmed backend state.
6. **9–11h:** NIM structured output/fallback/audit, report, SMS/USSD, security tests. Joint checkpoint: browser decision, grounded feedback, one sandbox message and USSD flow, rehearsed demo.

Do not cut state validation, Supabase persistence, key security, or error handling. Reduce map locations, use scripted events, simplify replay/USSD if schedule slips.

## Acceptance coverage and PR done

Own SIM-01..06 (determinism, budget rejection/no mutation, parameter bounds, water conservation, idempotency, concurrency); AI-01..03 (malformed schema, unsupported facts, timeout/fallback); DB-01..02 (foreign-session denial and unauthorized table operation); AT-01..03 (callback retry, SMS result logging, missing-key behavior); REP-01 (new run, original unchanged). Write tests with seeded scenario fixtures, fake NIM/SMS clients, independent transactions, and synthetic identities; live credentials are never needed for unit/CI tests. Add credentialed sandbox checks only as explicitly isolated manual checks.

Backend PR is done when scope is linked to spec and acceptance IDs, API contract and migration/RLS docs agree, unit/lint checks pass, no secrets or PII are present, retries/concurrency are safe, and a teammate reviews it.
