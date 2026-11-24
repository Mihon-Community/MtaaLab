# Shared API contract

This document describes the FastAPI surface for the Mtoni MVP. Authenticated routes require `Authorization: Bearer <Supabase access token>`. The API derives role and school from `public.profiles`; the client cannot select an identity or authoritative state. Students see missions assigned to an active class membership. Teachers see missions assigned to their classes. Student session reads and writes are owner-scoped. Assigned-teacher reads use class membership. Denials for session ownership return `404` so callers cannot discover another learner's records.

## Endpoints

| Method and route | Auth | Request | Response and current behavior |
|---|---|---|---|
| `GET /api/health` | None | — | `{"status":"ok"}`; dependency-free health check. |
| `GET /api/missions` | Bearer | — | Published missions assigned to the caller's class or active class membership. No matching assignment returns an empty list. |
| `GET /api/missions/{mission_id}` | Bearer | — | Assigned, published Mtoni brief, objectives, action catalogue, policies, units, and version metadata. Unassigned missions return `404`. |
| `POST /api/simulations` | Bearer | `{ "mission_id": "uuid" }`; optional `Idempotency-Key` (1–128 characters) | `201` with session and initial state. The same key for the same student and immutable mission version returns the existing session; the mission must be assigned to the caller. |
| `GET /api/simulations/{id}/state` | Bearer | — | Current confirmed `{session_id, turn, status, state}`. |
| `GET /api/simulations/{id}/history` | Bearer | Optional `limit` (1–100) and `offset` | Ordered persisted snapshots, actions, events, state hashes, and recorded AI feedback status. |
| `POST /api/simulations/{id}/decisions` | Bearer student | Action object and mandatory `Idempotency-Key` | Confirmed engine state, events, accounting, and `ai_feedback_status`. The turn is committed before stakeholder feedback runs in a background task. Duplicate keys return the original turn. |
| `POST /api/simulations/{id}/advance` | Bearer | `{ "expected_turn": n }` and mandatory `Idempotency-Key` | `409`: MVP advances by submitting a decision, so a separate no-action advance is not supported. |
| `POST /api/simulations/{id}/replay` | Bearer | Optional label and optional `Idempotency-Key` | New child session at the source's persisted initial state and same scenario version. Replay key is deduplicated per source session. Original session is unchanged. |
| `POST /api/simulations/{id}/debrief` | Bearer | Optional `{ "student_explanation": "..." }` (max 2,000 characters) | Validated debrief and optional qualitative reasoning assessment. An explanation is assessed only after the mission is completed (`409` otherwise). A validated assessment is persisted once per session and rubric version. Safe factual feedback is returned when AI is unavailable. |
| `GET /api/simulations/{id}/report` | Bearer | — | Report assembled from authorized current state and persisted actions/events; includes the latest persisted reasoning assessment when available. |
| `POST /ussd` (legacy alias: `/api/webhooks/africastalking/ussd`) | `?token=<WEBHOOK_TOKEN>` on `/ussd`; legacy API path also accepts `X-Webhook-Token` or `Authorization: Bearer` | `application/x-www-form-urlencoded`: `sessionId` (1–128), `serviceCode` (1–64), `phoneNumber` (1–32), `text` (0–500), `networkCode` (max 64; may be empty). | `200 text/plain`, at most 160 characters, beginning `CON ` or `END `. Uses an allowlisted SHA-256 phone reference mapped to the synthetic demo learner, creates or resumes that learner's active Mtoni session, and submits validated choices through the existing deterministic simulation service. No NVIDIA request is made in the callback. Repeated provider session/text pairs return the stored response without applying another decision. |
| `POST /webhook/incoming` | `?token=<WEBHOOK_TOKEN>` | `application/x-www-form-urlencoded`: `from` (6-32), `text` (0-500), optional `to`, `id`, `linkId`, `date`, `networkCode`, and `retryCount`. | `200` `{ "status": "accepted" }`. The backend sends a separate SMS through Africa's Talking to `from`, using `to` as the sender ID when supplied. `PLAY` or `START` opens Mtoni; reply with `1` repair, `2` save water, `3` water plan, `4` needs, and `0` back/exit. Confirm an action with `1` or cancel with `2`. `MENU`/`STATUS` shows the main menu; `HELP` explains choices. Each SMS session has its own persisted simulation session, a 30-day idle expiry, a hashed sender reference, and duplicate-message protection. Incoming text and phone numbers are not retained. Only numbers mapped to an assigned demo learner can play. |
| `POST /api/webhooks/africastalking/sms-status` | `?token=<WEBHOOK_TOKEN>`, `X-Webhook-Token`, or `Authorization: Bearer` | `application/x-www-form-urlencoded`: `id` (1–128), `status` (1–64), optional `phoneNumber` (max 32), `networkCode` (max 64), and `failureReason` (max 160). | `200` `{ "status": "accepted" }`. Delivery status is upserted by provider message ID; repeated callbacks update the same delivery record. |

## Decision shape

```json
{
  "action_type": "repair_main_pipe",
  "parameters": {},
  "expected_turn": 0
}
```

Decision response includes `session_id`, the resulting `turn`, `accepted`, the complete confirmed state, scripted events, `water_accounting`, and `ai_feedback_status`. Water units and budget credits are fictional scenario values, never model output.

Stakeholder output is validated against a strict schema containing an approved `actor_id`, bounded message, `referenced_facts`, and optional question. Actors and fact keys are allowlisted, direct identifiers are scrubbed before prompting, and output is length-limited. Invalid output uses approved static dialogue. The model cannot set action costs or simulation values.

## Authorization, transactions, and retries

The API verifies JWT signature, expiry, issuer, and audience from the Supabase JWKS, then loads the role from the profile table. Each session operation checks ownership or assigned-teacher membership. The service locks the session row, checks the idempotency key and expected turn, validates the action, computes the deterministic engine result, and writes decision, events, snapshot, and current-session state in one transaction. A stale request returns `409`; only committed state is returned. AI work is separate and cannot roll back or block a turn.

Mission assignments are unique per class and mission. RLS allows a teacher to manage assignments only in their own school-scoped classes, and exposes an assignment only to active members whose profile school matches that class. Africa's Talking callbacks use server-side sessions with a 180-second idle expiry and bounded form fields. A configured service-code mismatch returns `403`; missing or oversized fields return `400`; a disallowed or unmapped phone receives a short `END` response. The raw phone is not stored. The demo mapping is keyed by SHA-256 of `AT_TEST_PHONE` and points only to the synthetic demo student. `AT_ALLOWED_PHONES`, when set, is a comma-separated allowlist. `RATE_LIMIT_PER_MINUTE` defaults to 60 when left empty.

Africa's Talking callbacks require the root `WEBHOOK_TOKEN`. The new root callback URLs take it as the `token` query parameter; the legacy API callback routes also accept `X-Webhook-Token` or a Bearer token. An unset server token returns `503`; a missing or incorrect request token returns `401`. A supplied query token takes precedence over headers, is compared in constant time, and is never logged by application code. SMS delivery status logs contain provider ID, status, and a bounded error code; phone numbers and API keys are never logged. Outbound SMS uses the sandbox only, is limited to 160 characters, and contains no grades or learner identifiers. A sandbox provider response is not proof of handset delivery.

For local Africa's Talking callbacks through ngrok, stop any existing tunnel and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./backend/scripts/start-ngrok.ps1` from the repository root. The script reads the single root `.env`, creates a temporary ngrok Traffic Policy for legacy `/api/webhooks/africastalking/*` callbacks, and removes the policy file when ngrok exits. Current root callbacks use `?token=<WEBHOOK_TOKEN>` as required by the Africa's Talking callback configuration; set that value in the provider dashboard and do not commit it.

Webhook error bodies use FastAPI's `{ "detail": "..." }` shape: `400` for missing or oversized form fields, `401` for a missing or incorrect token, `403` for a configured USSD service-code mismatch, `429` when the per-minute callback limit is exceeded, and `503` if authentication is not configured or a delivery status cannot be persisted. These validation failures do not submit a decision. A valid but disallowed or unmapped phone gets `200 text/plain` with a polite `END ` message.

The USSD provider's `text` field is cumulative and is split on `*`. An empty value starts at the main menu, which shows the current turn, reservoir, and budget on separate lines before choices: `1` repair, `2` conservation, `3` allocation, `4` inspect sector needs, and `0` exit. Repair and conservation show the configured scenario cost before confirmation; allocation offers only the scenario's preset policies. Screens use line breaks for readability and remain at most 160 characters. Invalid input repeats the current menu with an `Invalid choice.` message. Completion returns an `END` summary and queues a short sandbox SMS.

SMS uses the same choices and deterministic simulation engine, with one choice per incoming message. Text `PLAY` to begin, follow the menu and confirmation prompts, then text `PLAY` after an ended run to replay. `HELP` describes the choices. SMS and USSD use separate simulation sessions even for the same mapped phone. Delivery depends on Africa's Talking accepting and delivering each response.

The outbound SMS helper returns a `SmsResult` object: `{ "status": "sent" | "failed" | "not_configured", "provider_message_id": "optional", "error_code": "optional" }`. Missing `AT_API_KEY` returns `not_configured` without raising; no SMS is sent by CI.

`POST /decisions` requires an idempotency key. `POST /replay` supports optional per-parent idempotency. Session creation supports optional per-student, per-mission-version idempotency. On interrupted clients, display only the last confirmed state and retry a decision using the same key.
