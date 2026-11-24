# Shared API contract

The API owns identity checks, class assignments, confirmed simulation state, and authoritative outcomes. Authenticated routes require `Authorization: Bearer <Supabase access token>`. The backend derives role, school, and learner identity from the authenticated profile. The browser cannot select a learner identity or submit authoritative state. Mission access is scoped to the caller's active class assignments. Student session reads and writes are owner-scoped; assigned teachers can read class learner reports where supported. A missing or unauthorized session returns `404`.

## Endpoints

| Method and route | Auth | Request | Response and behavior |
|---|---|---|---|
| `GET /api/health` | None | — | Dependency-free `{"status":"ok"}`. |
| `GET /api/missions` | Bearer | — | Published missions assigned to the learner's active class. Includes each mission's latest run, current turn, and a suggestion based on prior play. No grade filter is applied. |
| `GET /api/missions/{mission_id}` | Bearer | — | Assigned mission brief, learning objectives, action catalogue, units, policies/plans, reflection choices, hint ladder, and immutable rules version. Unassigned mission returns `404`. |
| `GET /api/mobile/classes` | Bearer teacher/admin | — | School-scoped active classes and student roster options for issuing feature-phone codes. Teachers see only classes they teach; admins see their school. |
| `POST /api/mobile/join-codes` | Bearer teacher/admin | `{ "class_id": "uuid", "student_id": "uuid" }` | `201` with a one-time ten-character code and expiry. Teacher must own the school-scoped class; learner must be an active student in that class. Admin must belong to the class's school. Code expires in seven days and is returned only at creation. |
| `POST /api/simulations` | Bearer | `{ "mission_id": "uuid" }`; optional `Idempotency-Key` (1–128 characters) | `201` with session, immutable mission version, and initial confirmed state. The same key for the same student and mission version returns the existing session. The mission must be assigned to the caller. |
| `GET /api/simulations/{id}/state` | Bearer | — | Current confirmed `{session_id, turn, status, scenario_id, state}`. |
| `GET /api/simulations/{id}/history` | Bearer | Optional `limit` (1–100) and `offset` | Persisted snapshots, decisions, events, state hashes, reflections, and recorded feedback status. |
| `POST /api/simulations/{id}/decisions` | Bearer student | Action object and mandatory `Idempotency-Key` | Confirmed deterministic result, events, and AI feedback status. Duplicate keys return the committed turn. NIM never computes game numbers or delays the commit. |
| `POST /api/simulations/{id}/advance` | Bearer | `{ "expected_turn": n }` and mandatory `Idempotency-Key` | `409`: a decision advances the simulation; a separate no-action advance is not supported. |
| `POST /api/simulations/{id}/replay` | Bearer | Optional label and optional `Idempotency-Key` | New child run at the source's initial state and same scenario version; the original run remains unchanged. |
| `POST /api/simulations/{id}/reflections` | Bearer owner | `{ "turn_number": n, "answer_code": "1" }` | Saves one bounded, scenario-approved choice and misconception tag for a confirmed turn. No free-text explanation is collected. |
| `GET /api/simulations/{id}/reflections/{turn_number}` | Bearer owner | — | Returns the saved reflection or `null`. |
| `POST /api/simulations/{id}/debrief` | Bearer | Optional `{ "student_explanation": "..." }` (max 2,000 characters) | Completed-session evidence-based debrief. Qualitative Mtoni reasoning assessment is bounded and validated. Other games currently receive a static fallback; their explanations are not evaluated with the Mtoni rubric. |
| `GET /api/simulations/{id}/report` | Bearer | — | Report assembled from authorized state and persisted decisions/events; includes a saved assessment when available. |
| `POST /ussd` (legacy alias: `/api/webhooks/africastalking/ussd`) | `?token=<WEBHOOK_TOKEN>`; legacy path also accepts `X-Webhook-Token` or Bearer | Africa's Talking form fields `sessionId`, `serviceCode`, `phoneNumber`, `text`, `networkCode` | `200 text/plain`, at most 160 characters, beginning `CON ` or `END `. Linked phones use the shared game router. Unlinked phones receive a language and one-time learner-code screen. Legacy demo mapping remains supported. |
| `POST /webhook/incoming` | `?token=<WEBHOOK_TOKEN>` | Africa's Talking form fields `from`, `text`, optional `to`, `id`, `linkId`, `date`, `networkCode`, `retryCount` | `200 {"status":"accepted"}`. The backend sends a separate SMS reply through Africa's Talking. Supports `JOIN`, `GAMES`, `PLAY n`, `CONTINUE`, `WHY n`, `HINT`, `STATUS`, language commands, and consent commands. Replies are limited to 160 characters. |
| `POST /api/webhooks/africastalking/sms-status` | `?token=<WEBHOOK_TOKEN>`, legacy header, or Bearer | `id`, `status`, optional provider phone/network/error fields | Upserts bounded delivery status by provider ID; no raw recipient phone is stored. |

## Deterministic decision shape

```json
{
  "action_type": "repair_main_pipe",
  "parameters": {},
  "expected_turn": 0
}
```

Every scenario has an allowlisted state model and action catalogue. Numeric values and scripted events are computed by versioned backend rules from the last confirmed state, validated action, and stored event seed. Water, access, cash, stock, and group-fund values are fictional scenario values. Invalid parameters, wrong-turn submissions, insufficient fictional funds, and unavailable actions cannot commit state.

Mtoni stakeholder feedback is qualitative, validated against approved actors and fact keys, scrubbed for direct identifiers, and bounded. Other portfolio games have no NIM call in the turn path and currently use static debrief fallbacks. Callback handling and the nudge worker do not call NVIDIA.

## Mobile linking and data handling

The teacher-issued code contains no learner name and expires in seven days. The database stores a peppered HMAC digest, the target class/profile IDs, creator, expiry, and redemption time. Code redemption is single-use; an exact provider retry from the already-linked phone returns the same result. A different phone or learner cannot reuse the code.

Normal gameplay stores a keyed HMAC phone reference and short-lived provider menu state, not the raw phone. If the learner explicitly opts in with `OPT IN`/`ANZA UJUMBE`, the worker may send resume nudges; only then is the phone encrypted using `PHONE_ENCRYPTION_KEY`. `STOP`/`ACHA` clears that ciphertext and disables further nudges while preserving game access. The HMAC, encryption, and join-code pepper settings are server-only root `.env` secrets. Rotating the phone HMAC key breaks existing feature-phone lookups; rotating the encryption key makes existing opted-in numbers unreadable.

SMS/USSD and web resolve the same learner profile and active simulation for a mission. USSD menu state expires after 180 seconds; the saved simulation does not. SMS menu state expires after 30 days. A repeated callback returns the prior response where the provider supplies a retry-identifying ID/session path. Decision keys prevent the same committed turn from being applied twice. USSD input is split on `*`, each screen is truncated to 160 characters, and callback fields are bounded.

`AT_ALLOWED_PHONES`, when nonempty, is a hard sandbox allowlist for both incoming SMS and USSD. Only phones in that list can reach join-code redemption or gameplay. Clear it or include the test handset when onboarding a different sandbox phone. The webhook token is passed in the provider callback URL query string; a supplied query token takes precedence over headers, comparisons are constant time, and it is not logged.

## Operational behavior and limits

`mobile-nudges` runs with Docker Compose. It sends only when all these guards pass: explicit opt-in, encrypted number available, active run has at least one confirmed turn, new session/turn since the last nudge, local time is 09:00–20:00 Africa/Nairobi, monthly attempts below four, and Africa's Talking credentials are configured. The worker reserves the per-month and per-turn marker before calling the provider to prevent duplicate sends after ambiguous timeouts. Failed attempts count toward the cap. `sent` means the provider accepted the request, not that the handset received it.

Callback URLs for local ngrok testing are:

- USSD: `<PUBLIC_BASE_URL>/ussd?token=<WEBHOOK_TOKEN>`
- Incoming SMS: `<PUBLIC_BASE_URL>/webhook/incoming?token=<WEBHOOK_TOKEN>`
- Optional delivery reports: `<PUBLIC_BASE_URL>/api/webhooks/africastalking/sms-status?token=<WEBHOOK_TOKEN>`

The backend, database migration, Africa's Talking callback configuration, sender balance, sandbox allowlist, and provider delivery all need separate verification. The provider does not receive secrets from `.env`; configure the token value only in the provider's callback URL. Do not commit it.

## Authorization, transactions, and errors

The API validates Supabase JWT signature, expiry, issuer, audience, and profile role. Mission discovery and simulation creation require an assignment to an active class in the learner's school. Teacher-issued mobile codes are restricted to the teacher's own class and school; the learner must already be a matching active student member. The mobile tables have RLS enabled and no browser grants; API operations use the backend database connection.

The decision service locks the session row, checks idempotency and expected turn, validates the action against the session's immutable scenario version, computes deterministically, and writes decision, events, snapshot, and current-session state in one transaction. AI feedback is post-commit work and cannot roll back or block the turn.

Webhook failures use FastAPI's `{ "detail": "..." }` body: `400` for invalid or oversized form fields, `401` for a missing/incorrect token, `403` for a configured USSD service-code mismatch, `429` for a callback rate limit, and `503` when webhook authentication is not configured or required persistence is unavailable. A valid callback from an unallowed or unlinked phone receives a short polite text response. Unknown errors are logged by type only; callback bodies, phone numbers, and message text are not logged.

## API changes in the portfolio/mobile update

- Mission detail now includes `reflection_choices` and bilingual `hint_ladder` metadata; the TypeScript API type mirrors both.
- New authenticated `GET /api/mobile/classes` gives teachers their active class roster; `POST /api/mobile/join-codes` issues a short-lived code for a student already in that school-scoped class. `/teacher` provides the code issuance screen.
- New `simulation_reflections` persistence and reflection POST/GET routes store a choice code against a turn. The model response excludes free text.
- Mobile provider-session `session_id` is nullable so language selection and code redemption can happen before a run exists; simulation-decision `session_id` remains mandatory.
- New `mobile_join_codes` and `learner_channel_links` tables store one-time code digests, phone HMAC references, language, consent status, and only opted-in encrypted phone addresses.
- SMS/USSD now list all assigned portfolio games and share a learner's saved run with the web app. Existing Mtoni callback paths and demo mapping remain available.
- `mobile-nudges` is a new Docker Compose worker with explicit consent, quiet-hour, per-turn, and monthly-attempt guards.
- Migrations `0007_portfolio_games.sql`, `0008_feature_phone_access.sql`, and `0009_mobile_access_policies_and_indexes.sql` must be applied before using portfolio or linked-phone features against hosted Supabase.
