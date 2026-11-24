# Backend integration status

Date: 2026-11-24

## Verification

| Check | Result |
|---|---|
| Backend unit and API tests on the host runner | 88 passed, 4 skipped. Three persistence cases and one RLS case skipped because this runner cannot connect directly to Supabase. |
| Optional NVIDIA NIM smoke test | 1 passed with one bounded, non-identifying request. |
| Focused Africa's Talking and mobile-session tests | 28 passed, covering SMS play, retries, separate SMS/USSD sessions, replay, callback authentication, and persistence upsert rules. |
| Ruff lint and formatting | `ruff check .` passed; all 71 backend files are formatted. |
| Docker backend rebuild and health check | Rebuilt the Compose stack. Backend is healthy, `/api/health` returns `{"status":"ok"}`, and `/webhook/incoming` is registered. |
| Africa's Talking SMS sandbox | Manual sandbox send and a direct explanatory reply returned `sent`; this is provider acceptance, not confirmation of handset delivery. No delivery-report callback has been observed yet. |
| Public callback route | ngrok endpoint is connected to `http://localhost:8000`; the SMS gameplay path still needs a real Africa's Talking simulator interaction to confirm provider delivery. |

The previous callback integration used `/api/webhooks/africastalking/...` routes and expected the token in a header. The current Africa's Talking callback URLs use a `token` query parameter and root paths. The backend accepts `POST /ussd?token=...` and `POST /webhook/incoming?token=...`; the previous API USSD and SMS-status URLs remain supported. Incoming SMS now starts and advances Mtoni through a separate saved simulation session using the same deterministic game engine as USSD. A fresh interaction in the Africa's Talking simulator is still needed to confirm handset delivery.

One earlier cold-start callback took about 11.8 seconds; historical full-session callbacks ranged from about 1.4 to 8.9 seconds. SQL instrumentation on one new-session callback observed 14 statements totaling about 3.2 seconds. The latest rebuilt public USSD probe took 5.0 seconds cold and 1.3 seconds warm, but used an unmapped phone and exited before loading or writing a mission session. The orchestration now reuses the session state and status already loaded for the callback instead of looking up that row again. Supabase response time varies between calls, so these are development measurements rather than a production latency guarantee.

## Acceptance coverage

| ID | Status | Evidence / limit |
|---|---|---|
| SIM-01 | Pass | Deterministic same-input unit coverage. |
| SIM-02 | Pass | Unaffordable action is rejected without state mutation. |
| SIM-03 | Pass | Out-of-range action parameters are rejected. |
| SIM-04 | Pass | Water accounting invariants, including six-turn sequences. |
| SIM-05 | Pass | Live PostgreSQL decision idempotency and stored retry result. |
| SIM-06 | Pass | Live concurrent-turn integration case. |
| AI-01 | Pass | Malformed model output uses the static fallback. |
| AI-02 | Pass | Unsupported fact references are rejected to fallback. |
| AI-03 | Pass | Missing-key and timeout fallback paths pass; the optional live NIM smoke test also passed. |
| DB-01 | Pass | Live API-to-PostgreSQL integration flow and session ownership checks. |
| DB-02 | Pass, manual | Supabase RLS was previously checked with an `anon` write attempt and denied. Automated host-runner DB check cannot connect from this environment. |
| AT-01 | Application flow pass; provider simulator pending after menu polish | The USSD flow applies one valid turn and deduplicates a retry. Root `/ussd` with query-token auth is covered by unit tests; a fresh Africa's Talking simulator callback is still needed after rebuilding the container. |
| AT-02 | Outbound provider acceptance pass; SMS gameplay needs a fresh simulator run | Sandbox SMS API returned `sent`. Automated coverage exercises gameplay choices, separate SMS/USSD sessions, retries, and replies; a fresh Africa's Talking simulator run is needed to confirm handset delivery. |
| AT-03 | Pass, mocked | Missing API key returns `not_configured` without raising. |
| MOB-01 | Backend pass; frontend out of scope | USSD duplicate and persistence paths pass. Browser offline/reconnect behavior belongs to the frontend. |
| REP-01 | Pass | Live replay integration preserves the source run and initial state. |

## Supabase state and owner tasks

Migrations `0001`–`0006` are applied. The synthetic Mtoni mission is assigned to its demo class. The phone map stores only a SHA-256 reference, and the temporary USSD and integration-test rows created during this pass were removed.

The Mtoni scenario values remain marked as placeholders pending team review. Do not use them as approved classroom curriculum or realistic hydrology data until the owner reviews the values and objectives. Supabase's leaked-password protection remains an Auth Dashboard setting, and the database password still needs owner rotation and an update in the local root `.env`.

LTI 1.3 is explicitly a later phase in the project specification; the prototype's launch context is simulated. Teacher progress aggregation is also outside the current API contract; the backend exposes assignment-scoped missions and learner reports. These items need product-owner scope before adding new APIs.

## Africa's Talking callback setup

1. Keep Docker running and stop the existing ngrok tunnel with Ctrl+C.
2. From the repository root, start the tunnel with the root `.env` token policy:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\start-ngrok.ps1
   ```

3. In the Africa's Talking dashboard, set the sandbox service-code callback to `<PUBLIC_BASE_URL>/ussd?token=<WEBHOOK_TOKEN>`. Set Incoming Messages to `<PUBLIC_BASE_URL>/webhook/incoming?token=<WEBHOOK_TOKEN>` and delivery reports, if enabled, to `<PUBLIC_BASE_URL>/api/webhooks/africastalking/sms-status?token=<WEBHOOK_TOKEN>`.
4. Keep the computer awake while using the Africa's Talking simulator. Send `PLAY` to the configured sandbox short code, then follow the numbered action and confirmation prompts. Send `MENU` to return to the main menu and `HELP` for the choices. Only a phone mapped to an assigned demo learner can play. For a standalone outbound SMS check, run `docker compose exec backend python -m scripts.send_test_sms`; confirm the result in the simulator rather than treating `sent` as final delivery.

No `.env` values or provider credentials are committed to this branch.
