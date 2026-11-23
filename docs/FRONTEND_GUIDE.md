# Frontend guide

## Ownership

Developer 1 owns `feature/steve` (frontend and simulation experience). **“The client displays state returned by FastAPI; it must not calculate the official outcome.”** Phaser renders/collects interaction; React owns routes, controls, accessibility, loading state, and confirmed API state.

## Local setup

Use Node 22 LTS, pinned by root `../.nvmrc` (CI reads `frontend/.nvmrc`):

```sh
cd frontend
npm ci
npm run dev
```

From the repository root, create the one local file with `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`). Vite reads that root file; do not create a second `frontend/.env`. Checks: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run format:check`. Values can remain placeholders; the Supabase client is lazy and returns null until real public config is set.

## Folder map and rendering boundary

- `app/routes/`: page route table; `app/auth/`: future sign-in/session UI.
- `features/mission-lobby/`, `briefing/`, `simulation/`, `replay/`, `learning-report/`, `teacher-view/`: feature screens.
- `features/simulation/WorldScene.ts`: Phaser scene; `WorldCanvas.tsx`: mount/bridge; other panels are React UI.
- `components/`: reusable accessible controls; `services/api.ts`: typed FastAPI wrapper; `services/supabase.ts`: lazy Supabase client; `types/`: shared API/database types; `styles/`: Tailwind and global styles.

Phaser may draw scene assets and report a selected location/action intent. It cannot compute official state. React receives that intent, sends it to FastAPI, and updates official state only after the confirmed response. Provide equivalent buttons/list entries for every map selection.

## Required screens (§8)

- Required: mission lobby; briefing; simulation world; decision centre; stakeholder panel (1–2 AI interactions); turn timeline; learning report; basic teacher console.
- Replay comparison is required if time allows; otherwise show recorded replay data and a comparison summary.
- Every placeholder page currently routes, but none is a completed product feature.

## Interaction rules

Disable duplicate submit while a request is running; send a unique `Idempotency-Key` and expected turn. Show loading, retry, API-error, and AI-unavailable states. Never imply success before server confirmation. After Realtime disconnect, retain last confirmed state, reconnect, and fetch current session state. Use Realtime for low-volume turn/report/status updates, not frames.

## Accessibility checklist (§12)

- [ ] Keyboard/switch and touch equivalent for every map action; visible focus.
- [ ] Semantic headings, labelled controls, text alternative for map status, announcements for important state changes.
- [ ] High-contrast theme and adjustable text; no colour-only signal.
- [ ] Reduced-motion mode; no animation-only information.
- [ ] One decision at a time, consistent controls, short instructions, glossary/optional hints.
- [ ] Audio is optional and has text alternative; audio is never required to finish.

## Low bandwidth and PWA

Cache the static shell and approved mission content. Keep last confirmed state available for display. Queue user input only if backend can later revalidate it; never call it accepted offline. Compress/lazy-load media and show a clear reconnect/retry action. USSD is a constrained alternative, not a visual-world equivalent.

## Supabase

Use only `VITE_SUPABASE_URL` and the publishable key in the browser; all `VITE_` values are public. Use Supabase Auth session and pass its JWT as Bearer token to FastAPI. RLS remains required. Use Realtime for private, scoped meaningful updates; reconnect and refresh state after disconnect. Never write authoritative simulation state directly from the client.

## 11-hour plan mapping (§13, Developer 1)

1. **0–1h:** layout, Phaser skeleton, API shapes; joint contract checkpoint.
2. **1–3h:** app/routes and briefing; align mission variables.
3. **3–5h:** world view and keyboard/touch-selectable locations.
4. **5–7h:** HUD, decision/confirmation, timeline; protect vertical slice at hour 7.
5. **7–9h:** stakeholder/event panel and loading/error states. Joint checkpoint: one decision changes confirmed backend state.
6. **9–11h:** report, replay comparison, responsive/accessibility polish, demo rehearsal. Joint checkpoint: API decision works, feedback grounded, sandbox USSD/SMS shown or limitations accurately stated.

## Mock before backend is ready

Build to `docs/API_CONTRACT.md`. Use typed fixtures with clearly fictional values, injected fetch/client functions, and a deterministic mock server in tests. Mock only transport responses; keep all decision result values supplied by the mock API, never derived by UI calculations. Contract changes require both developers' review.

## Frontend PR done

Every changed route has accessible loading/error/empty states, tests and lint/typecheck/build pass, no secrets are bundled, UI reflects only confirmed server state, responsive/reduced-motion behavior is respected, API contract changes are jointly reviewed, and screenshots plus relevant acceptance IDs are in the PR.
