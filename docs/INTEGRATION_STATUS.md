# Backend integration status

Date: 2026-11-24

## Verification

| Check | Result |
|---|---|
| Complete non-NVIDIA backend suite in a disposable Docker network runner | 83 passed, 1 optional NVIDIA test deselected. This includes the live PostgreSQL persistence, replay/idempotency, concurrent-turn, and RLS checks. Synthetic rows were cleaned up. |
| Backend unit and API tests on the host runner | 79 passed; database integration tests were excluded because that runner cannot establish the Supabase connection. |
| Optional NVIDIA NIM smoke test | 1 passed with one bounded, non-identifying request. |
| Africa's Talking callback unit tests | 14 passed. |
| Rubric registry tests | 2 passed. |
| Ruff lint and formatting | Passed. |
| Docker backend rebuild and health check | Rebuilt; `GET /api/health` returned 200 and the backend container was healthy. |
| Africa's Talking SMS sandbox | Multiple manual sends returned `sent`; three matching delivery-log records are present. This is provider acceptance, not confirmation of handset delivery. |
| USSD callback through the public tunnel | Four authenticated requests completed: dial menu, repair confirmation, one persisted turn, and duplicate retry. Each returned HTTP 200; the duplicate returned the stored response and did not apply a second decision. The generated test simulation was removed. |

The configured public tunnel is reachable. A request without the webhook token receives `401`, so the current ngrok process does not inject `WEBHOOK_TOKEN`. `backend/scripts/start-ngrok.ps1` now prepares a temporary path-scoped Traffic Policy from the single root `.env`; its `-ValidateOnly` mode passed. The real Africa's Talking simulator was not started because the active tunnel needs to be restarted with that policy and the provider dashboard callback must point to the tunnel URL.

One local cold-start callback took about 11.8 seconds; the other measured local callbacks ranged from about 1.4 to 5.3 seconds. SQL instrumentation on one new-session callback observed 14 statements totaling about 3.2 seconds. The USSD path was reduced to avoid repeated session/state reads. Supabase response time varies between calls, so these measurements are a development baseline rather than a production latency guarantee.

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
| AT-01 | Application flow pass; provider simulator pending | Public tunnel callback flow applies one valid turn and deduplicates a retry. The Africa's Talking simulator itself still needs a dashboard-configured callback and ngrok header injection. |
| AT-02 | Partial | Sandbox SMS API returned `sent` repeatedly and logs provider outcomes. No handset delivery was confirmed. |
| AT-03 | Pass, mocked | Missing API key returns `not_configured` without raising. |
| MOB-01 | Backend pass; frontend out of scope | USSD duplicate and persistence paths pass. Browser offline/reconnect behavior belongs to the frontend. |
| REP-01 | Pass | Live replay integration preserves the source run and initial state. |

## Supabase state and owner tasks

Migrations `0001`–`0006` are applied. The synthetic Mtoni mission is assigned to its demo class. The phone map stores only a SHA-256 reference, and the temporary USSD and integration-test rows created during this pass were removed.

The Mtoni scenario values remain marked as placeholders pending team review. Do not use them as approved classroom curriculum or realistic hydrology data until the owner reviews the values and objectives. Supabase's leaked-password protection remains an Auth Dashboard setting, and the database password still needs owner rotation and an update in the local root `.env`.

LTI 1.3 is explicitly a later phase in the project specification; the prototype's launch context is simulated. Teacher progress aggregation is also outside the current API contract; the backend exposes assignment-scoped missions and learner reports. These items need product-owner scope before adding new APIs.

## Africa's Talking setup still needed for a provider-originated USSD session

1. Keep Docker running and stop the existing ngrok tunnel with Ctrl+C.
2. From the repository root, start the tunnel with the root `.env` token policy:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\scripts\start-ngrok.ps1
   ```

3. In the Africa's Talking dashboard, set the sandbox service-code callback to `<PUBLIC_BASE_URL>/api/webhooks/africastalking/ussd`. Put the exact sandbox service code in `AT_USSD_SERVICE_CODE` and the test phone in `AT_ALLOWED_PHONES` in the root `.env` before restarting Docker.
4. Keep the computer awake while using the Africa's Talking simulator. Its real callback flow still needs a provider-side test.

No `.env` values or provider credentials are committed to this branch.
