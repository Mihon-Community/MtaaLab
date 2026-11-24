# Backend and mobile implementation guide

## Scope and ownership

The backend serves teacher-assigned, grade-open games, authenticated web sessions, deterministic simulation state, reflection/history, bounded Mtoni AI feedback, Supabase persistence, and Africa's Talking SMS/USSD callbacks. A learner's web, SMS, and USSD activity resolves to the same profile and active run for a mission. Teachers can issue one-time phone-link codes in the `/teacher` page. The game details and mobile command flow are in [GAME_PORTFOLIO.md](GAME_PORTFOLIO.md); request/response fields and authorization are in [API_CONTRACT.md](API_CONTRACT.md).

## Local setup

From repository root, create the one root `.env` from `.env.example` if needed, then install and start the services:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

The API health check is `GET http://localhost:8000/api/health`; the web app is `http://localhost:5173`. Docker Compose starts backend, frontend, and the consent-guarded `mobile-nudges` worker. The nudge worker skips sends until the database and Africa's Talking credentials are configured, and never sends without explicit learner `OPT IN`.

Both apps read the root `.env`; nested `backend/.env` or `frontend/.env` files are not used. Required backend settings for feature-phone linking are:

```dotenv
PHONE_HMAC_SECRET=
PHONE_ENCRYPTION_KEY=
MOBILE_JOIN_CODE_PEPPER=
```

Use a random secret of at least 32 characters for HMAC and join-code pepper. Generate a Fernet-compatible key for `PHONE_ENCRYPTION_KEY`; keep it stable while opted-in numbers exist. Do not put any of these secrets in `VITE_` variables or commit the local `.env`. Other provider/database secrets remain backend-only. A secret rotation affects existing mobile links or stored phone ciphertext; see [API_CONTRACT.md](API_CONTRACT.md).

For local backend checks from `backend/`:

```powershell
pytest -q -m "not integration and not nvidia"
ruff check .
ruff format --check .
```

Live Supabase persistence tests require a reachable `SUPABASE_DB_URL`; NIM smoke tests require the provider key and are optional. Do not use a real learner's personal phone or account in automated tests.

## Code map

- `app/api/`: authentication, mission and simulation routes, teacher mobile roster and join-code issuance, reports, and provider callbacks.
- `app/simulation/engine.py`: original Mtoni rules; `portfolio_engine.py`: deterministic Soko, Fever Response, and Chama rules; `service.py`: versioned scenario dispatch and transactions.
- `app/simulation/scenarios/`: immutable versioned JSON for all four games.
- `app/integrations/africas_talking/`: SMS/USSD routing, privacy helpers, callback validation, provider sending, and callback idempotency.
- `app/db/`: SQLAlchemy models/repositories; `supabase/migrations/`: schema, RLS, and seed changes.
- `app/ai/`: bounded qualitative Mtoni feedback and static fallbacks. The phone callback path never calls NVIDIA.
- `scripts/run_nudge_worker.py`: consented SMS resume reminders with quiet-hour and monthly caps.
- `frontend/src/features/teacher-view/TeacherPage.tsx`: class-scoped, one-time code issuance.
- `frontend/src/features/simulation/PortfolioRunPage.tsx`: shared web game and reflection interface.

## Invariants

- Mission discovery is assigned-class scoped but not restricted to one grade. The teacher chooses which assigned game to use; curriculum alignment is proposed and needs educator review.
- Deterministic backend rules and immutable scenario versions own all numbers, decisions, event outcomes, and state transitions. NIM cannot calculate a game outcome. A committed decision persists decision, events, snapshot, and state atomically.
- Idempotency protects session creation and turn submission. SMS/USSD duplicate callbacks return their prior response. A retry cannot apply a second turn.
- Web, SMS, and USSD share the learner's saved active session for a game. Phone provider menu state is separate from game state and may expire without erasing progress.
- Teacher-issued codes are single-use, seven-day codes stored as peppered digests. A code can be retried only by the phone already linked to its learner.
- Gameplay saves an HMAC phone reference, not the raw phone. Only an explicit reminder opt-in stores encrypted phone ciphertext. `STOP`/`ACHA` clears it; opting out does not remove game access.
- Nudge worker checks consent, at least one confirmed active turn, a new turn, 09:00–20:00 Africa/Nairobi, and a maximum of four send attempts per month. The cap is reserved before the provider request to protect against ambiguous timeout duplicates; failed sends count as attempts.
- Browser roles cannot write simulation, reflection, join-code, or learner channel link tables directly. RLS remains enabled; backend authorization scopes each operation to the authenticated school/class/session.
- Do not write phone numbers, inbound message bodies, webhook tokens, or secrets to logs. Keep `VITE_` keys public only.
- Kenya child-data legal review and guardian/school authorization are **needs verification**. Phone link and SMS `OPT IN` are not legal consent to process child data. Review applicable ODPC guidance before live use with minors.

## Africa's Talking setup and play

The public callbacks require the root `WEBHOOK_TOKEN` as a query parameter:

- USSD: `<PUBLIC_BASE_URL>/ussd?token=<WEBHOOK_TOKEN>`
- Incoming SMS: `<PUBLIC_BASE_URL>/webhook/incoming?token=<WEBHOOK_TOKEN>`
- Optional delivery reports: `<PUBLIC_BASE_URL>/api/webhooks/africastalking/sms-status?token=<WEBHOOK_TOKEN>`

Set those URLs in the Africa's Talking dashboard. For local development, run the repository's ngrok script in a separate PowerShell window and keep Docker/ngrok online while testing. The service-code callback must match `AT_USSD_SERVICE_CODE`. If `AT_ALLOWED_PHONES` is configured, add the test number there; a nonempty list blocks any number not on it from both onboarding and play.

Teacher steps: sign in at `/teacher`, select a class and learner, create a code, and share it with that learner. The code is shown once, expires after seven days, and links the phone that sends it; MtaaLab does not issue learner phone numbers. In the sandbox SMS simulator, send `JOIN CODE`; in USSD, use the simulator's dialer, select a language, and enter the code. After linking, the next USSD dial opens the game list directly. In SMS, send each command in a separate message: `GAMES` (or `PLAY`) lists games, then `PLAY 1` starts one. If a learner pastes follow-up commands after `JOIN CODE` in one text, MtaaLab redeems the code and replies with the next steps; it does not run those follow-up commands in that same text. Use `CONTINUE` or USSD menu choice `1` to resume. Follow reflection prompts before advancing. `HELP` lists commands. `OPT IN` enables optional nudges; `STOP` ends nudges while keeping play available. Sandbox SMS replies appear in the simulator, not on a physical handset.

To verify real Supabase code redemption, retry handling, encryption on opt-in, and cleanup on `STOP` using only the seeded synthetic learner, run:

```powershell
docker compose exec backend python -m scripts.smoke_mobile_privacy
```

This smoke check writes and removes its own temporary code/link records. It does not send an SMS.

This project currently uses `AT_USERNAME=sandbox`. Sandbox SMS is delivered to Africa's Talking's web simulator, not a physical handset. Log into the simulator and register the test number there; then use its SMS inbox or USSD simulator to play. Africa's Talking documents this in its [sandbox setup guide](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox). A sandbox `DeliveryFailure` can mean the simulator is not logged in or is unreachable ([failure guide](https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail)).

For an actual handset test, change `AT_USERNAME` and `AT_API_KEY` in the root `.env` to the Africa's Talking Live app credentials. Sandbox and Live use separate keys. The Live app also needs an approved sender ID or shortcode and available balance. Keep the callbacks pointed at the public host, put the real test number in `AT_ALLOWED_PHONES` if configured, then start a game by sending SMS from that handset. Live SMS may incur charges. The `scripts.send_test_sms` helper now refuses to send when `AT_USERNAME` is not `sandbox`.

Provider API status `sent` only means accepted for processing. Confirm final `Success`/`Delivered` status separately; see Africa's Talking's [delivery status definitions](https://help.africastalking.com/en/articles/16150386-messaging-error-codes). A mocked callback or HTTP 200 alone cannot prove handset delivery.

## Database and external status

Migrations `0007_portfolio_games.sql`, `0008_feature_phone_access.sql`, and `0009_mobile_access_policies_and_indexes.sql` add the game portfolio, choice-only reflections, teacher-issued codes, HMAC phone links, consent fields, explicit backend-only policies, supporting indexes, and pre-run mobile session support. Apply them to Supabase before using the new portfolio or linked-phone paths in a deployed backend. The seed adds three games to the synthetic Mtoni demo class; production mission assignments must be prepared by the school administrator. Do not treat local migration files or passing unit tests as proof that the hosted database or Africa's Talking account is configured.

The design requires separate verification of Supabase migration status, root environment settings, teacher-issued code flow, configured service code, query-token callbacks, sender balance, sandbox phone allowlist, SMS delivery callback, and the actual handset. Record measured latency only for complete callback paths; the previous unmapped-phone probes do not measure game or database decision latency.

## Known product limits

- Only four deterministic scenarios are available now. Simulation efficacy, teacher usability, learning outcomes, and grade suitability have not been established; no learning-impact claim should be made.
- Soko, Fever Response, and Chama debriefs use a static fallback. Mtoni's current NIM qualitative rubric must not be applied to those games.
- Kiswahili labels are included for feature-phone menus and hints but need fluent educator review.
- The app does not capture guardian details or document parental/guardian authorization. This is a launch prerequisite for any deployment processing children's personal data, marked **needs verification**.
- Africa's Talking sandbox and provider handset/network delivery require manual acceptance. Automated tests cannot simulate the external network.
