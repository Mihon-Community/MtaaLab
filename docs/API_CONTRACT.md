# Shared API contract

This is the shared frontend/backend contract transcribed from specification §9. Routes are scaffold targets, not implemented yet. **Any change requires a PR reviewed by both developers.** Numeric values in the spec's decision example are illustrative only. All authenticated routes use `Authorization: Bearer <Supabase access token>`. Student access is owner-scoped; teacher access requires assignment/class authorization. Writes that advance work accept `Idempotency-Key` and reject stale `expected_turn` values.

## Endpoints

| Method and route | Auth | Request | Response | Errors and retry notes |
|---|---|---|---|---|
| `GET /api/health` | None | — | `{"status":"ok"}` | `500`; safe to retry. |
| `GET /api/missions` | Bearer | — | Published missions assigned to learner/class | `401`, `403`; read only. |
| `GET /api/missions/{mission_id}` | Bearer | — | Approved brief and immutable scenario version metadata | `401`, `403`, `404`; read only. |
| `POST /api/simulations` | Bearer | `{ "mission_id": "uuid" }` | `{ "session_id": "uuid", "turn": 0, "state": {…} }` | `401`, `403`, `404`, `409`; idempotency key recommended to avoid duplicate sessions. |
| `GET /api/simulations/{id}/state` | Bearer | — | Current last-confirmed `{session_id, turn, state, status}` | `401`, `403`, `404`; safe to retry. |
| `POST /api/simulations/{id}/decisions` | Bearer | `{"action_type":"repair_main_pipe","parameters":{},"expected_turn":2}` | `{"session_id":"uuid","turn":3,"accepted":true,"state":{…},"events":[],"ai_feedback_status":"pending"}` | `400` invalid action, `401`, `403`, `404`, `409` stale turn, `422` malformed input. Idempotency key mandatory; duplicate returns original result. |
| `POST /api/simulations/{id}/advance` | Bearer | `{"expected_turn":2}` if a separate advance control is used | Confirmed state, accepted action/event/timeline result | `400`, `401`, `403`, `404`, `409`; idempotency key mandatory. MVP may combine with decisions. |
| `GET /api/simulations/{id}/history` | Bearer | Optional pagination cursor/limit | Ordered decisions, events, and state snapshots | `401`, `403`, `404`, `422`; read only. |
| `POST /api/simulations/{id}/replay` | Bearer | Optional replay label | New `session_id`, same scenario version and initial state | `401`, `403`, `404`, `409`; idempotency key prevents duplicate alternative runs. Never overwrites source run. |
| `POST /api/simulations/{id}/debrief` | Bearer | Optional student explanation | Persisted validated debrief or factual fallback | `401`, `403`, `404`, `422`, `503` only if no safe fallback can be produced. Idempotency key recommended. |
| `GET /api/simulations/{id}/report` | Bearer | — | Report, outcomes, and assessment evidence | `401`, `403`, `404`; read only. Student sees own; assigned teacher sees permitted learners. |
| `POST /api/webhooks/africastalking/ussd` | Provider callback validation; no browser JWT | Form fields: `sessionId`, `serviceCode`, `phoneNumber`, `text` | Plain text beginning `CON ` to continue or `END ` to terminate | `400` malformed, `403` rejected association, `404` unknown session, `429` rate limit. Deduplicate provider session/input; retries must not apply a turn twice. |
| `POST /api/webhooks/africastalking/sms-status` | Provider callback validation | Provider delivery fields | Recorded status acknowledgment | `400`, `403`; optional route only if enabled in sandbox. Idempotent by provider message ID. |

## Decision shape

```json
{
  "action_type": "repair_main_pipe",
  "parameters": {},
  "expected_turn": 2
}
```

Response shape (values below are examples, never production constants):

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "turn": 3,
  "accepted": true,
  "state": { "reservoir_level": 0, "budget_remaining": 0 },
  "events": [],
  "ai_feedback_status": "pending"
}
```

Stakeholder output is validated against `{ "actor_id": string, "message": string, "referenced_facts": string[], "suggested_question": string }`. The actor and referenced facts must be allowlisted, output is length-limited, and invalid output uses an approved static fallback. The model cannot return action costs or changed simulation values.

## Shared transaction and error rules

Authenticate and authorize, check key and expected version, validate action/prerequisites/budget, run the deterministic engine, then atomically write decision + events + snapshot + session pointer. Only return accepted state after commit. Concurrent stale writes return `409`; clients keep the last confirmed state and may fetch it again. AI feedback runs separately and never blocks a simulation turn.
