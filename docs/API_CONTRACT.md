# Shared API contract

This document describes the implemented FastAPI surface for the Mtoni MVP. All authenticated routes require `Authorization: Bearer <Supabase access token>`. The API derives role and school from `public.profiles`; the client cannot select an identity or authoritative state. Student session reads and writes are owner-scoped. Assigned-teacher reads use class membership. Denials for session ownership return `404` so callers cannot discover another learner's records.

The current schema has no mission-assignment table, so mission discovery lists all published missions to authenticated profiles. Session creation still verifies that the caller is a student and the mission is published. Add assignment filtering when the schema gains that relationship.

## Endpoints

| Method and route | Auth | Request | Response and current behavior |
|---|---|---|---|
| `GET /api/health` | None | — | `{"status":"ok"}`; dependency-free health check. |
| `GET /api/missions` | Bearer | — | Published missions, currently global because assignments are not represented in the schema. |
| `GET /api/missions/{mission_id}` | Bearer | — | Published Mtoni brief, objectives, action catalogue, policies, units, and version metadata. |
| `POST /api/simulations` | Bearer | `{ "mission_id": "uuid" }`; optional `Idempotency-Key` (1–128 characters) | `201` with session and initial state. The same key for the same student and immutable mission version returns the existing session. |
| `GET /api/simulations/{id}/state` | Bearer | — | Current confirmed `{session_id, turn, status, state}`. |
| `GET /api/simulations/{id}/history` | Bearer | Optional `limit` (1–100) and `offset` | Ordered persisted snapshots, actions, events, state hashes, and recorded AI feedback status. |
| `POST /api/simulations/{id}/decisions` | Bearer student | Action object and mandatory `Idempotency-Key` | Confirmed engine state, events, accounting, and `ai_feedback_status`. The turn is committed before stakeholder feedback runs in a background task. Duplicate keys return the original turn. |
| `POST /api/simulations/{id}/advance` | Bearer | `{ "expected_turn": n }` and mandatory `Idempotency-Key` | `409`: MVP advances by submitting a decision, so a separate no-action advance is not supported. |
| `POST /api/simulations/{id}/replay` | Bearer | Optional label and optional `Idempotency-Key` | New child session at the source's persisted initial state and same scenario version. Replay key is deduplicated per source session. Original session is unchanged. |
| `POST /api/simulations/{id}/debrief` | Bearer | Optional `{ "student_explanation": "..." }` | Validated debrief and optional qualitative reasoning assessment. Safe factual fallback is returned when AI is unavailable. |
| `GET /api/simulations/{id}/report` | Bearer | — | Report assembled from authorized current state and persisted actions/events. `assessment` is currently null. |
| `POST /api/webhooks/africastalking/ussd` | Not implemented | — | Africa's Talking routes are out of scope for this integration. |
| `POST /api/webhooks/africastalking/sms-status` | Not implemented | — | Africa's Talking routes are out of scope for this integration. |

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

`POST /decisions` requires an idempotency key. `POST /replay` supports optional per-parent idempotency. Session creation supports optional per-student, per-mission-version idempotency. On interrupted clients, display only the last confirmed state and retry a decision using the same key.
