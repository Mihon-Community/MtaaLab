# MtaaLab frontend guide

This guide is the working manual for the MtaaLab web client. It is written so a
developer can build, run, test, and ship the frontend without asking anyone a
question. Everything below is checked against the code in this repository and
the shared `docs/API_CONTRACT.md`. Where the code and the specification differ,
this guide says which one wins and why.

Read order for a new frontend developer:

1. Sections 1–5 (rules, branches, environment, stack, quality gates).
2. Sections 6–7 (folder map, routing).
3. Sections 8–11 (auth, API layer, decision protocol, state model).
4. Section 12 (screen-by-screen specification).
5. Sections 13–20 (rendering boundary, accessibility, i18n, testing, TODOs, PR rules).

---

## 1. Ownership and non-negotiable rules

Developer 1 owns the frontend and the simulation experience on branch
`feature/steve`. Developer 2 owns backend, AI, and integrations.

These rules come from the project specification and are enforced by review, not
by convention:

- **The client displays state returned by FastAPI; it must not calculate the
  official outcome.** Every number that matters comes from the API. Presentation
  maths (progress-bar widths, percentages of a bar) is allowed; deriving a game
  result, budget, water level, or win/loss from client logic is not.
- **No optimistic writes.** Never show a decision as accepted, a turn as
  advanced, or a score as changed before the server confirms it. Show
  "saving…" until the response arrives.
- **One decision at a time.** A request in flight disables its own submit
  control and sends an `Idempotency-Key` so a double tap cannot apply twice.
- **Authorized state only.** The browser cannot choose a learner identity,
  school, or class. Role, school, and learner identity are derived by FastAPI
  from the authenticated Supabase profile. An unauthorized session returns
  `404`, not an empty screen.
- **Contract changes are joint.** Any change to `docs/API_CONTRACT.md`, request
  shapes, or response shapes requires both developers to review before merge.
- **No secrets in the bundle.** Only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` may exist in the browser. A `VITE_` prefix
  means the value is public. Backend keys (`NVIDIA_API_KEY`, `AT_API_KEY`,
  `SUPABASE_SECRET_KEY`, database URL, HMAC/encryption peppers) never appear in
  `frontend/` or in any `VITE_` variable.

---

## 2. Branches, remotes, and pull requests

Branch model (see `CONTRIBUTING.md`):

| Branch                                               | Purpose                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `main`                                               | Stable, demo-ready. Changes only through PRs from `develop`. |
| `develop`                                            | Integration branch. Feature branches merge here.             |
| `feature/steve`                                      | Developer 1: frontend and simulation experience.             |
| `feature/lennox` (brief also spells `feature/lennx`) | Developer 2: backend/AI/integrations.                        |

Workflow:

1. `git fetch origin` and update your feature branch from `develop`.
2. Work only on your feature branch. Keep commits focused and use Conventional
   Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
3. Run every quality gate in section 5 locally before pushing.
4. `git push -u origin feature/steve` and open a PR into `develop`.
5. Require green CI and one approving review; squash merge.
6. Never push directly to `main` or `develop`. Never force-push or rewrite
   shared history.
7. Do not commit `.env`, keys, learner data, or real phone numbers.

Required status checks on protected branches: `backend`, `frontend`,
`secret-scan` (Gitleaks over full history). A PR that touches the API contract
needs both developers' approval.

---

## 3. Environment and local run

### Node version

Node 22 LTS, pinned by the repository-root `.nvmrc` (contents: `22`). CI reads
`node-version-file: .nvmrc` from the repository root. There is no
`frontend/.nvmrc`; do not create one.

### Setup

```sh
cd frontend
npm ci
npm run dev
```

Vite serves the app on <http://localhost:5173>.

### The single `.env` file

There is exactly one environment file: the repository-root `.env`, copied once
from `.env.example`:

```sh
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

`frontend/vite.config.ts` sets `envDir: "..",` so Vite reads that root file. Do
not create `frontend/.env`; it will not be read. Values may stay placeholders —
the Supabase client is lazy and the app shows a "connect Supabase" message
instead of crashing.

### Public frontend variables

Only these three variables are read by the browser bundle:

| Variable                        | Meaning                                          | Example                         |
| ------------------------------- | ------------------------------------------------ | ------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project URL                             | `https://<project>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key                    | `replace_me`                    |
| `VITE_API_BASE_URL`             | FastAPI base URL; empty string means same origin | `http://localhost:8000`         |

When `VITE_API_BASE_URL` is empty, requests are sent to the same origin as the
page. That works in the Docker/Nginx build, where Nginx proxies `/api/` to
`backend:8000`. It does **not** work against the Vite dev server, which has no
`/api/` proxy — for local development set
`VITE_API_BASE_URL=http://localhost:8000` (the value already in
`.env.example`). In Docker Compose the frontend container receives these values
as build args.

CI runs the frontend job with placeholder values
(`https://example.supabase.co`, `ci-placeholder-public-key`). That is expected;
the lazy Supabase client detects the placeholders and returns `null`, and pages
render their signed-out/connect state.

### Docker run

From the repository root:

```sh
docker compose up --build
```

Then open the web app on <http://localhost:5173>, API docs on
<http://localhost:8000/docs>, and health on <http://localhost:8000/api/health>.
Compose starts the backend, the frontend (Nginx on 5173), and the consent-guarded
SMS nudge worker.

To test on a phone, serve Vite bound to your LAN address (for example
`npm run dev -- --host 0.0.0.0`) and open `http://<your-LAN-IP>:5173`. Add that
origin to `ALLOWED_ORIGINS` in the root `.env` so the backend accepts requests
from it.

---

## 4. Technology stack and configuration

| Concern        | Choice                                                   | Notes                                                                                                                           |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| UI             | React 19.1                                               | Function components and hooks only.                                                                                             |
| Routing        | react-router-dom 7.18                                    | `BrowserRouter` in `main.tsx`; routes declared in one table.                                                                    |
| Build/dev      | Vite 6.4                                                 | `@vitejs/plugin-react`; `envDir: ".."`.                                                                                         |
| Language       | TypeScript 5.8, `strict`                                 | `noUnusedLocals`, `noUnusedParameters`, `noEmit`.                                                                               |
| Styling        | Tailwind 3.4 plus hand-written CSS                       | `src/styles/index.css` holds the design tokens and most component classes; Tailwind scans `index.html` and `src/**/*.{ts,tsx}`. |
| Auth/data      | `@supabase/supabase-js` 2.50                             | Lazy client in `src/services/supabase.ts`.                                                                                      |
| Tests          | Vitest 5.1 + Testing Library + jsdom                     | `vitest run`; setup file `src/test/setup.ts`.                                                                                   |
| Formatting     | Prettier 3.5                                             | `format:check`; ignores `dist/`, `node_modules/`, `package-lock.json`.                                                          |
| Lint           | ESLint 9 + typescript-eslint + react-hooks/react-refresh | `eslint .`; ignores `dist/`.                                                                                                    |
| PWA            | Hand-written `public/sw.js` + `manifest.webmanifest`     | Registered only in production (`import.meta.env.PROD`).                                                                         |
| World renderer | Phaser 3.88                                              | `WorldCanvas` lazy-loads the Phaser scene; keyboard-accessible React controls provide equivalent location selection.            |

The Phaser scene renders only the map and location intent. React owns decisions,
accessibility, API requests, and confirmed state. The separate
`PortfolioRunPage` remains available for the portfolio-game flow.

Configuration files you will touch:

- `frontend/vite.config.ts` — Vite plus Vitest config, `envDir: ".."`.
- `frontend/tsconfig.json` — strict compiler options.
- `frontend/eslint.config.js` — flat ESLint config.
- `frontend/postcss.config.js`, `frontend/tailwind.config.js` — styling pipeline.
- `frontend/index.html` — app shell, manifest link, theme color.
- `frontend/public/manifest.webmanifest`, `frontend/public/sw.js`,
  `frontend/public/icon.svg` — PWA assets.
- `frontend/Dockerfile`, `frontend/nginx.conf` — production build and serving.

---

## 5. Quality gates

Run all of these before pushing. They are the same commands CI runs in the
`frontend` job.

```sh
npm run test          # vitest run
npm run lint          # eslint .
npm run typecheck     # tsc --noEmit
npm run build         # tsc -b && vite build
npm run format:check  # prettier --check .
```

Definitions of done for any change:

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`,
  `npm run format:check` all pass.
- New interactive behaviour has at least one Vitest/Testing Library test.
- No new dependency without a stated reason and an updated lockfile.
- No `console.log` left in committed code.
- No secrets or placeholder credentials introduced.

---

## 6. Folder map

```
frontend/
  index.html
  package.json
  vite.config.ts
  src/
    main.tsx                     App bootstrap, BrowserRouter, service-worker registration
    app/
      App.tsx                    Shell: header nav + <Routes> from the route table
      App.test.tsx               Smoke test (renders signed-out lobby)
      routes/pages.tsx           Single source of truth for paths and page components
      auth/README.md             Placeholder note for future dedicated auth screens
    features/
      mission-lobby/LobbyPage.tsx        Supabase sign-in, assigned missions, saved-run links
      briefing/BriefingPage.tsx          Mission briefing and idempotent session start
      simulation/
        SimulationPage.tsx               Route switch: portfolio run vs API-backed Mtoni simulation
        PortfolioRunPage.tsx             Confirmed-state play loop for portfolio games
        PortfolioWorldCanvas.tsx         Working: fictional metric cards per scenario
        WorldCanvas.tsx                  Lazy Phaser mount and accessible location controls
        WorldScene.ts                    Phaser map scene
        DecisionPanel.tsx                Mission-configured actions and confirmed submit
        InspectionPanel.tsx              Selected-location facts
        ResourceHUD.tsx                  Confirmed resources
        EventPanel.tsx                   Events and reflection/debrief
        TurnTimeline.tsx                 API-backed saved history
      replay/ReplayPage.tsx              Replay creation and confirmed-value comparison
      learning-report/ReportPage.tsx     Persisted outcomes and debrief
      teacher-view/TeacherPage.tsx       Mission reports and feature-phone codes
    components/
      AudioControls.tsx           Optional narration
      ContrastToggle.tsx          Contrast and text-size controls
      DemoModeBanner.tsx          Explicit local-demo disclosure
    lib/
      theme.tsx                   Display preferences
      utils.ts                    Class-name helper
    services/
      api.ts                     Typed fetch wrapper (Bearer + Idempotency-Key)
      supabase.ts                Lazy Supabase client with placeholder detection
      demo/                      Explicit local demo transport and scenario engine
      sessionCache.ts            Last confirmed simulation state for display
    types/api.ts                 Mirrors backend schemas; keep in sync
    styles/index.css             Design tokens, layout, focus, reduced-motion rules
    test/setup.ts                jest-dom matchers
    vite-env.d.ts                Vite client types
  public/
    icon.svg, manifest.webmanifest, sw.js
```

Status summary: the learner mission journey, portfolio play loop, replay,
learning report, teacher report inspection, mobile-code issuance, demo
transport, and accessibility controls have initial implementations. The API
does not provide teacher assignment editing. Continue to treat all simulation
outcomes as server-authoritative.

---

## 7. Routing

All routes live in `frontend/src/app/routes/pages.tsx` (`routePages`). `App.tsx`
maps that array into `<Link>` entries in the header and `<Route>` elements. A
catch-all renders the lobby.

| Path          | Component        | Purpose                                                                | Parameters                                                     |
| ------------- | ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/`           | `LobbyPage`      | Sign in, list assigned missions, open briefing or continue a saved run | none                                                           |
| `/briefing`   | `BriefingPage`   | Mission brief and idempotent session start                             | `mission_id`                                                   |
| `/simulation` | `SimulationPage` | API-backed Mtoni simulation or portfolio-game run                      | `session_id`, `mission_id`, or legacy `sessionId`, `missionId` |
| `/replay`     | `ReplayPage`     | Create and compare an independent replay                               | `source_session_id`, optional `replay_session_id`              |
| `/report`     | `ReportPage`     | Persisted learning report and debrief                                  | `session_id`                                                   |
| `/teacher`    | `TeacherPage`    | Assigned missions, authorized report review, mobile join codes         | none                                                           |

`/simulation` behaviour (`SimulationPage.tsx`):

- If the query string contains `sessionId` or `missionId`, it lazily loads
  `PortfolioRunPage` inside a `<Suspense>` with a `role="status"` fallback.
- Otherwise it renders the API-backed Mtoni composition (`ResourceHUD`,
  `WorldCanvas`, `InspectionPanel`, `DecisionPanel`, `EventPanel`,
  `TurnTimeline`).

`PortfolioRunPage` reads `sessionId` and `missionId` from the query string. Both
are required; if either is missing it shows "Choose a game first" with a link to
`/`. Deep links such as
`/simulation?missionId=<uuid>&sessionId=<uuid>` are the supported way to resume
a run. They can be shared or refreshed safely because the page re-fetches
confirmed state on mount.

Navigation rule: never store a session id in component state and expect a refresh
to work. Put it in the URL.

---

## 8. Authentication and the API layer

### Supabase client

`src/services/supabase.ts` creates the client lazily and caches it in a module
variable. It returns `null` when:

- `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is unset, or
- the URL contains `YOUR_PROJECT`, or
- the key equals `replace_me`.

Pages must handle `null` gracefully: show a connect message instead of calling
the API. See `LobbyPage` for the pattern (`if (!supabase) return …`).

Session handling pattern used by every authenticated page:

```ts
const [session, setSession] = useState<Session | null>(null);

useEffect(() => {
  if (!supabase) return;
  let alive = true;
  void supabase.auth.getSession().then(({ data }) => {
    if (alive) setSession(data.session);
  });
  const { data } = supabase.auth.onAuthStateChange((_event, next) => {
    if (alive) setSession(next);
  });
  return () => {
    alive = false;
    data.subscription.unsubscribe();
  };
}, [supabase]);
```

Sign-in is `supabase.auth.signInWithPassword({ email, password })`. On error,
show a generic message ("Sign-in failed. Check the school-issued account
details.") and never echo the provider message. Sign out is
`supabase.auth.signOut()`.

### Fetch wrapper

`src/services/api.ts` exports one function:

```ts
apiFetch<T>(path, init?, idempotencyKey?): Promise<T>
```

It resolves the current Supabase session, then:

- sets `Content-Type: application/json`;
- adds `Authorization: Bearer <access_token>` when a session exists;
- adds `Idempotency-Key` when the caller passes one;
- calls `fetch(`${baseUrl}${path}`, …)` where `baseUrl = VITE_API_BASE_URL ?? ""`;
- throws `new Error("API request failed (<status>)")` for any non-2xx response;
- otherwise parses and returns JSON.

Known limitations you should plan around:

- It does not surface the backend `{ "detail": "..." }` message. Extend it (or
  wrap calls) if you want specific error copy. Keep the extension in
  `services/api.ts` so every caller benefits.
- It does not attach `Idempotency-Key` automatically. Callers must generate and
  pass keys. See section 10.
- There is no timeout/abort handling yet. Add `AbortController` support if a
  screen needs cancellation.
- It does not retry. Retry is a UI-level concern so the user can see it.

---

## 9. API reference for the frontend

The authoritative table is `docs/API_CONTRACT.md`. This section restates what
the frontend must know, including failure modes that matter to the UI.

### Missions

| Endpoint                         | Auth   | Response                                                                                                                                                                          |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/missions`              | Bearer | `{ missions: MissionListItem[] }` — published missions assigned to the caller's active class. Includes latest run id/status and current turn. No grade filter.                    |
| `GET /api/missions/{mission_id}` | Bearer | `MissionDetail` — brief, objectives, action catalogue, allocation policies, plans, units, reflection choices, hint ladder, immutable `rules_version`. Unassigned mission → `404`. |

`MissionListItem` fields: `id`, `title`, `description`, `subject`,
`grade_band`, `scenario_version`, `recommended`, `recommendation_reason`,
`last_session_id`, `last_session_status`, `current_turn`.

`MissionDetail` adds: `learning_objectives`, `scenario_id`, `rules_version`,
`turn_duration`, `number_of_turns`, `units`, `action_catalogue`,
`allocation_policies`, `plans`, `reflection_choices`, `hint_ladder`.

Use `action_catalogue` to render buttons — never hard-code action lists. Each
entry is `{ action_type, ...definition }`; definitions vary by scenario (cost,
delay_turns, one_time, parameters, choices). `plans` maps plan id to
`{ label, order_quantity, price }` for the market game.

### Sessions, state, history

| Endpoint                             | Notes                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/simulations`              | Body `{ "mission_id": "uuid" }`. Optional `Idempotency-Key` (1–128 chars). `201` with `SessionCreated`. Same key + same student + same mission version returns the existing session.          |
| `GET /api/simulations/{id}/state`    | `{ session_id, turn, status, scenario_id, state }`. Owner-scoped.                                                                                                                             |
| `GET /api/simulations/{id}/history`  | Query `limit` (default 50, max 100), `offset` (>= 0). Returns `{ session_id, entries, limit, offset, total }`. Each entry: `{ turn, action, events, state, state_hash, ai_feedback_status }`. |
| `POST /api/simulations/{id}/replay`  | Optional body `{ "label": "…" }`, optional `Idempotency-Key`. Returns `ReplayResponse` (`SessionCreated` plus `parent_session_id`). The source run is unchanged.                              |
| `POST /api/simulations/{id}/advance` | Always `409` after authorization. There is no separate advance: a decision advances the simulation.                                                                                           |

The frontend currently requests `history?limit=100`. Use `limit=100` when you
need the whole run; use pagination only if history grows.

### Decisions

| Endpoint                               | Notes                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/simulations/{id}/decisions` | Body `{ action_type, parameters, expected_turn }`. **Mandatory** `Idempotency-Key` (1–200 chars). `200` with `DecisionResponse`. Student role only; other roles get `404`. |

`DecisionResponse`: `{ session_id, turn, accepted: true, state, events[],
water_accounting | null, ai_feedback_status }`.

`events[]` items: `{ event_type, turn_number, payload, engine_version }`.

`ai_feedback_status` values:

| Value            | Meaning                                                | UI treatment                                                             |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `pending`        | Mtoni turn committed; stakeholder feedback task queued | Show "feedback is being prepared"; poll or wait for a low-volume update. |
| `available`      | Feedback stored                                        | Render the feedback.                                                     |
| `ai_unavailable` | Model/validation failed                                | Show the safe fallback copy. Never imply success.                        |
| `not_requested`  | Non-Mtoni scenarios, or replay of a stored decision    | Nothing to show for feedback; the event log carries the turn.            |

Failure modes for decisions:

| Status | Cause                                                                  | UI action                                                                                         |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `400`  | Invalid action or parameters                                           | Show "that choice is not available"; refresh the catalogue from the mission detail.               |
| `401`  | Missing/invalid bearer token                                           | Return to sign-in.                                                                                |
| `404`  | Session not owned/visible, or caller is not a student                  | Show the saved-game error and offer "Back to games".                                              |
| `409`  | `expected_turn` is stale, session not active, or concurrent write lost | Discard local assumption, `GET state`, re-render from confirmed state, let the user choose again. |
| `500`  | Persistence invariant                                                  | Show a generic error and retry after refreshing state.                                            |

### Reflections

| Endpoint                                              | Notes                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /api/simulations/{id}/reflections`              | Body `{ turn_number, answer_code }` where `answer_code` is `"1"`, `"2"`, or `"3"`. Returns `ReflectionResponse`. |
| `GET /api/simulations/{id}/reflections/{turn_number}` | `{ "reflection": ReflectionResponse \| null }`.                                                                  |

`ReflectionResponse`: `{ session_id, turn_number, answer_code, misconception_tag,
accepted, idempotent_replay }`.

Rules the UI depends on:

- `turn_number` must be between 1 and the session's confirmed `current_turn`.
- Submitting the same `answer_code` again for the same turn returns the stored
  reflection with `idempotent_replay: true` — safe to retry.
- Submitting a **different** code for a turn that already has a reflection
  returns `409`. Do not silently overwrite; tell the learner the earlier choice
  is saved.
- The route does not require an `Idempotency-Key` header. The current page sends
  `reflection-<sessionId>-<turn>`; that is harmless but not load-bearing.
- Reflection choices and misconception tags come from `MissionDetail`
  (`reflection_choices`, keys `"1"`–`"3"`, each `{ tag, label }`). The tag
  `hint-requested` unlocks the hint ladder.

### Reports and debrief

| Endpoint                             | Notes                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/simulations/{id}/report`   | `{ session_id, mission_id, status, current_turn, outcomes, decisions[], events[], assessment }`. Built only from confirmed state and persisted history. |
| `POST /api/simulations/{id}/debrief` | Optional `{ student_explanation }` (max 2,000 chars). Returns `{ session_id, debrief, source, ai_feedback_status }`.                                    |

Debrief rules:

- Sending `student_explanation` for an incomplete session returns `409`.
- For scenarios other than `mtoni`, reasoning assessment is marked
  `ai_unavailable` and the debrief is a static evidence-based fallback.
- `source` is `nvidia` or `fallback`; `ai_feedback_status` is `available` or
  `ai_unavailable`. Show which one was used; do not present a fallback as model
  output.

### Mobile / teacher

| Endpoint                      | Auth          | Notes                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/mobile/classes`     | teacher/admin | `{ classes: [{ class_id, name, learners: [{ student_id, display_name }] }] }`. Teachers see their own classes; admins see their school. Students get `403`.                                                                                           |
| `POST /api/mobile/join-codes` | teacher/admin | Body `{ class_id, student_id }`. `201` with `{ join_code, expires_at, message }`. Code is 10 characters, single-use, expires in 7 days, shown once. Returns `404` for a class/learner outside scope, `503` if the join-code pepper is not configured. |

### Health

`GET /api/health` — no auth, returns `{ "status": "ok" }`. Useful for a connection
banner. Do not use it as a substitute for authorized session state.

---

## 10. Decision protocol (the core loop)

This is the sequence the player-facing screens must implement. Follow it exactly.

1. **Create or resume a session.**

   - New run: `POST /api/simulations` with `{ mission_id }` and a fresh
     `Idempotency-Key` (1–128 chars). A repeat with the same key returns the same
     session.
   - Resume an active run: navigate straight to
     `/simulation?missionId=…&sessionId=…`; the page fetches state. The lobby
     currently builds the navigation object locally from
     `last_session_id`/`current_turn` without an API call, so the destination
     page still re-fetches everything it shows.
   - Replay a completed run: `POST /api/simulations/{id}/replay` with a fresh
     key, then navigate to the new `session_id`.

2. **Load the mission detail and confirmed state in parallel.**
   `GET /api/missions/{missionId}` and `GET /api/simulations/{sessionId}/state`.
   Render only after both resolve, or render the error state with a retry.

3. **Render the confirmed snapshot.**
   Draw resources, world metrics, event log, and valid actions from the mission
   detail and the state payload. Label fictional units. Do not compute deltas.

4. **Choose an action.**

   - Read `action_catalogue` from the mission detail and render one control per
     action. For `change_allocation`, render one control per `policy_id` from
     `allocation_policies`. For the market game, render the plan choices from
     the action's `choices` (fall back to `plans`).
   - Disable controls while a request is in flight (`busy`), while the session
     is completed, and when the reflection gate applies (below).

5. **Submit the decision.**

   - Generate a **fresh unique** `Idempotency-Key` for each submission attempt
     (for example `crypto.randomUUID()`, with a timestamp fallback). Keep the
     key for the lifetime of that attempt so a retry after a network error
     replays the same key rather than creating a second decision.
   - Body:
     ```json
     {
       "action_type": "repair_main_pipe",
       "parameters": {},
       "expected_turn": 2
     }
     ```
   - `expected_turn` **must equal the session's current confirmed turn**. Use
     the `turn` from `GET state` or `state.current_turn`; they are the same
     value. Never use a locally incremented counter. A mismatch returns `409`.
   - Parameters must match the action definition. Current examples:
     `change_allocation → { "policy_id": "balanced" | "household_focus" | "farm_focus" }`;
     `conservation_campaign → { "household_reduction_ratio": 0.1 }`;
     `efficient_irrigation → { "farm_reduction_ratio": 0.1 }`;
     `install_storage → { "capacity_increase": 10 }`;
     `market_plan → { "plan_id": "value" | "steady" | "premium" }`.
     Validate ranges against the mission detail before sending; the backend
     rejects out-of-range values.

6. **Handle the response.**

   - On `200`: store the returned `turn`, `state`, `events`, and
     `ai_feedback_status` as the new confirmed truth. Render the events. Then
     render the reflection prompt for that turn (portfolio games) unless the
     scenario does not require it.
   - On `409`: the simulation moved. `GET state` again, replace the snapshot,
     and let the player choose again. Do not resend the old body.
   - On any other error: show a specific message, keep the last confirmed state
     on screen, and offer Retry (which refetches state first).

7. **Reflect (portfolio games).**
   After a confirmed turn, present the three `reflection_choices`. Save with
   `POST /reflections`. Choosing `hint-requested` reveals `hint_ladder.en[0]`
   (or `sw[0]`) and offers "next hint" up to three levels. Hints are static
   text from the mission detail; they never change state.

8. **Completion.**
   The backend marks the session `completed` when the returned turn reaches
   `mission.number_of_turns`. Treat `status === "completed"` as the authority.
   A local check (`turn >= number_of_turns`) may be used only as a defensive
   fallback; never mark complete from a client guess. On completion, offer
   Replay and link to the report.

9. **Duplicate protection recap.**
   - One `Idempotency-Key` per logical submission attempt.
   - Same key → same committed turn (idempotent replay), never a second turn.
   - Different key with a stale `expected_turn` → `409`, no state change.
   - UI disables the control for the duration of the request.

---

## 11. State and content per scenario

All numbers are fictional game units. The scenario id comes from
`MissionDetail.scenario_id` (and from `SessionStateResponse.scenario_id`).

### Scenario catalogue

| `scenario_id`  | Title                  | Turns | Units                                           | Action catalogue                                                                                                                                                                                                                                      |
| -------------- | ---------------------- | ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mtoni`        | Mtoni water resilience | 6     | fictional water units, fictional budget credits | `repair_main_pipe` (cost 25, one-time), `conservation_campaign` (cost 15, delay 1), `change_allocation` (cost 0, policy parameter), `install_storage` (cost 30, one-time, capacity 10–30), `efficient_irrigation` (cost 20, delay 1, ratio 0.05–0.25) |
| `soko_market`  | Mama Mboga Market      | 6     | fictional credits, fictional units              | `market_plan` with choices `value`, `steady`, `premium` (also exposed as `plans`)                                                                                                                                                                     |
| `mtoni_fever`  | Mtoni Fever Response   | 6     | fictional tokens, fictional points              | `install_water_point` (cost 20, delay 1), `add_handwashing` (cost 15, delay 1), `improve_clinic_readiness` (cost 10, delay 0)                                                                                                                         |
| `chama_circle` | Chama Trust Circle     | 6     | fictional tokens                                | `save_tokens`, `approve_request_a`, `approve_request_b` (no cost field)                                                                                                                                                                               |

Cost and delay fields are optional in the catalogue. Render a cost only when
the field exists, and keep the fictional-token disclaimer visible.

### State fields the UI may display

| Scenario       | Fields                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mtoni`        | `current_turn`, `reservoir_level`, `reservoir_capacity`, `demand_by_sector`, `leakage`, `budget_remaining`, `service_levels`, `unmet_demand_by_sector`, `crop_health`, `wellbeing`, `allocation_policy`, `used_actions`, `pending_effects` |
| `soko_market`  | `current_turn`, `cash_credits`, `stock_units`, `selling_price`, `total_sold`, `total_spoiled`, `completed_actions`                                                                                                                         |
| `mtoni_fever`  | `current_turn`, `budget_tokens`, `safe_water_points`, `handwashing_points`, `clinic_readiness`, `pending_effects`, `completed_actions`                                                                                                     |
| `chama_circle` | `current_turn`, `pool_tokens`, `reserve_tokens`, `outstanding_tokens`, `repayments_received`, `delayed_tokens`, `scheduled_repayments`, `completed_actions`                                                                                |

`PortfolioWorldCanvas` maps these to three labelled metric cards per scenario
and adds a scenario-specific disclaimer. Keep the mapping declarative so adding a
scenario is a data change, not a layout change.

### Response-shape differences that affect rendering

- `water_accounting` is populated only for `mtoni`; for portfolio games it is
  `null`. Do not render an accounting block unconditionally.
- `ai_feedback_status` is `not_requested` for portfolio turns (no NVIDIA call in
  the turn path) and `pending`/`available`/`ai_unavailable` for Mtoni.
- `approved_actors` exist only in the Mtoni scenario. The stakeholder panel is a
  Mtoni feature; other games show the event log instead.

### Reflection tags and hints

| Scenario       | `reflection_choices` tags                                          | Hint ladder                     |
| -------------- | ------------------------------------------------------------------ | ------------------------------- |
| `mtoni`        | `finite-resource-tradeoff`, `service-priority`, `hint-requested`   | 3 English + 3 Kiswahili strings |
| `soko_market`  | `over-order`, `price-demand`, `hint-requested`                     | 3 English + 3 Kiswahili         |
| `mtoni_fever`  | `delayed-effect`, `instant-effect-misconception`, `hint-requested` | 3 English + 3 Kiswahili         |
| `chama_circle` | `reserve-buffer`, `reserve-opportunity-cost`, `hint-requested`     | 3 English + 3 Kiswahili         |

Never invent tags. Display the chosen tag as plain text (hyphens replaced by
spaces is acceptable) and never as a diagnosis or grade.

---

## 12. Screen specifications

Mapping to the specification's required areas (§8). "Working" means the current
code implements the described flow; remaining API limitations are called out
explicitly.

### Mission lobby — `/` — `LobbyPage` (working)

Data: `GET /api/missions`.

- Signed out: email/password form.
- No Supabase config: connect message.
- Signed in: grid of mission cards with title, description, subject, suggested
  badge, and saved progress.
- New missions open the briefing; active runs can be continued, and completed
  runs link to their report.
- Errors: inline `role="alert"` plus a retry affordance.
- Empty state explains that no missions are assigned.

### Mission briefing — `/briefing` — `BriefingPage` (working)

Must explain: the problem, initial conditions, rules, controls, and
accessibility options. Source the content from `GET /api/missions/{id}`:
`title`, `description`, `learning_objectives`, `units`, `number_of_turns`,
`turn_duration`, and the fictional-values disclaimer. Add a "Start mission"
button that creates a session and navigates to `/simulation`.

### Simulation world — `/simulation` — `SimulationPage`, `PortfolioRunPage`

Two renderers:

- `PortfolioRunPage` (all four games, working): metric canvas + confirmed state
  grid + turn events + reflection + hint ladder + decision controls.
- Mtoni composition (working): `WorldCanvas` (map), `InspectionPanel`
  (selected-location facts), `ResourceHUD` (reservoir/budget/leakage),
  `DecisionPanel`, `EventPanel`, `TurnTimeline`.

Requirements for whichever renderer you keep:

- Every map selection has an equivalent button or list entry. Keyboard and
  touch must both work; hover alone is never sufficient.
- Show confirmed values only. Selected-location facts must come from the API or
  from the confirmed state payload, not from local inference.
- Provide visible focus states and a text alternative for map status.
- If you add a real renderer (Phaser, SVG, Canvas), it may draw and report
  intent only. It cannot compute outcomes.

### Decision centre (part of the simulation screen)

Render actions from `action_catalogue` / `allocation_policies` / `plans`, with
cost where present, the confirmation requirement, and disabled-while-busy
behaviour described in section 10. Confirm before submitting for costly or
one-time actions; never confirm after the fact.

### Stakeholder panel — `EventPanel` (working)

Show scripted events and the API's feedback/debrief status. The current
stakeholder feedback route does not return dialogue text, so do not invent
character dialogue. Clearly identify fictional content, expose AI status, and
never imply a numeric result the engine did not produce.

### Turn timeline — `TurnTimeline` (working)

Source: `GET /history`. Show confirmed turns in order with the action taken, the
resulting state snapshot (or a digest of key fields), and events. Do not
recompute changes client-side.

### Replay comparison — `/replay` — `ReplayPage` (working)

Source: `POST /replay` for the new child run and `GET /report` or
`GET /history` for both runs. Compare original and alternative runs side by
side: turns, actions, final state, key events. If time does not allow a full
tool, the specification permits showing recorded replay data and a comparison
summary. Never mutate the source run.

### Learning report — `/report` — `ReportPage` (working)

Source: `GET /report` and optionally `POST /debrief`. Show objective, outcomes,
decisions, events, reasoning evidence, and the next-step recommendation.
Include the `source` and `ai_feedback_status` so a fallback is identifiable.
Do not present reflections as grades.

### Teacher console — `/teacher` — `TeacherPage` (working)

Data: `GET /api/mobile/classes`, `POST /api/mobile/join-codes`.

- Teacher/admin sign-in, roster grouped by class, learner select filtered by the
  chosen class.
- Issue a one-time code, display it once in a large monospace value, with expiry
  and single-use warnings.
- Privacy note about linking versus reminder opt-in.
- Assignment editing is not supported by the current API. The mobile roster
  and one-time join-code endpoints are available to authorized teachers.

---

## 13. Rendering boundary, offline, and PWA

- The server owns outcomes. The client renders.
- Persist the last confirmed state for display only; the server remains
  authoritative for actions.
- Queue user input locally only if the backend can revalidate it later. Never
  label a queued decision as accepted.
- Local demo transport is opt-in with `VITE_USE_MOCKS=true` and displays an
  explicit demo banner. It stores demo runs locally; do not treat them as
  server-backed data or enable it in a production build.
- `public/sw.js` is registered in production only. It caches the shell
  (`/`, `manifest.webmanifest`, `icon.svg`), caches same-origin GET responses,
  **skips `/api/` entirely**, and falls back to the cached shell for
  navigations when offline. Consequences to respect:
  - Game data is never served from cache; a stale cache cannot fake a turn.
  - If you add precache entries, keep them small and static.
  - If you change caching, bump `CACHE_NAME` so old caches are dropped on
    activate.
- Media must be compressed and lazy-loaded; no large asset may block first
  paint. Keep the responsive layout intact from 320 px upward.
- USSD is a constrained alternative participation mode, not a visual-world
  equivalent. Do not promise feature parity.

---

## 14. Interaction, loading, and error states

Every route that talks to the API needs, at minimum:

| State              | Implementation                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Loading            | `role="status"` text or a skeleton; never a blank screen.                                                |
| Saving             | Disable the submit control, show "Saving… the display will update after confirmation."                   |
| Confirmed          | Replace the snapshot only after the response resolves.                                                   |
| Error              | `role="alert"`, plain-language cause, and a Retry control.                                               |
| Empty              | Explain why the list is empty (for example no assigned games).                                           |
| Offline/disconnect | Keep the last confirmed state visible, show a reconnect/retry action, and never claim a write succeeded. |

Live-region etiquette already used in `PortfolioRunPage`:
`aria-live="polite"` for turn results, reflection-saved notices, and hint text;
`role="alert"` for errors; `role="status"` for busy/loading. Keep that pattern.

Realtime guidance: use Supabase Realtime for low-volume, meaningful updates
(session status, completed turn, new report, teacher dashboard refresh). Do not
stream frames or ticks. On disconnect, retain the last confirmed state,
reconnect, then fetch the current session state. Realtime is not implemented
yet; polling `GET state` after a mutation is acceptable for the prototype.

---

## 15. Accessibility checklist

Spec §12. Concrete state of the code and what to build.

Already present:

- Visible `:focus-visible` outlines for buttons, links, and inputs
  (`styles/index.css`).
- Minimum target sizes: `2.75rem` for buttons, links, inputs, selects.
- `@media (prefers-reduced-motion: reduce)` disables animations and smooth
  scrolling globally.
- Semantic landmarks in `App.tsx` (`header`, `nav` with `aria-label`, `main`).
- ARIA labelling patterns in the working pages (`aria-labelledby`,
  `aria-label`, `aria-busy`, `role="status"`, `role="alert"`, `aria-live`).
- Responsive breakpoints for narrow screens.

Still required (each maps to a placeholder or a future feature):

- [ ] High-contrast theme toggle and adjustable text size
      (`components/ContrastToggle.tsx` is a TODO). Persist the preference and
      make sure no signal relies on colour alone.
- [ ] Text alternative for map status, and announcements for important state
      changes (`WorldCanvas`, `InspectionPanel`).
- [ ] Keyboard/touch equivalents for every map action; no hover-only affordance.
- [ ] Optional narration controls with a text alternative; audio must never be
      required to finish (`components/AudioControls.tsx`).
- [ ] One decision at a time, consistent controls, short instructions,
      glossary/optional hints.
- [ ] Reduced-motion mode honoured by any animation you add (the global media
      query is the floor, not the ceiling).
- [ ] Accessibility tests: keyboard walk-through of the decision loop and a
      screen-reader pass on the lobby and report.

---

## 16. Language and content review

- Prototype language is teacher-reviewed English. Kiswahili strings exist for
  hint ladders and SMS/USSD menus but still need fluent-educator review.
- `hint_ladder` keys are `en` and `sw`, each an ordered list of three strings.
  Index them by hint level; never show more than three.
- There is no web language switcher yet. If you add one, store the choice
  locally and use it only for UI/hint language; never send it to the engine.
- Do not invent scenario copy. All scenario text comes from the checked-in
  scenario JSON through the mission detail.

---

## 17. Testing

Runner: `npm run test` (`vitest run`, jsdom, setup file
`src/test/setup.ts` which imports `@testing-library/jest-dom/vitest`).

Current coverage: one smoke test (`App.test.tsx`) asserting the signed-out lobby
renders. That is the floor, not the target.

What to test as you build:

- Route rendering for signed-out, signed-in, and error states.
- `apiFetch` header construction: bearer token present/absent, idempotency key,
  error throwing on non-2xx.
- The decision loop: a confirmed response replaces state; a `409` triggers a
  state refetch; duplicate submits are blocked while busy.
- Reflection: saving a choice, retrying the same choice (`idempotent_replay`),
  and refusing to overwrite a different choice.
- Teacher code issuance: roster rendering, learner filtering, code display.
- Accessibility: at minimum accessible-name checks on primary controls.

Mocking approach that keeps tests honest:

- Unit-test components with `vi.mock` on `../../services/api` and
  `../../services/supabase`; inject resolved promises, not real network calls.
- Use deterministic fixtures copied from `docs/API_CONTRACT.md`, clearly
  fictional values.
- Mock only transport. Assertions about outcomes must be about _displaying_ the
  mock's values, never about values the test computed itself.
- Run the dev server against the real backend during manual verification; tests
  must not depend on it.

---

## 18. Known TODO inventory

The main learner journey and teacher views are implemented. Remaining work
should follow the live API contract rather than inventing unsupported
capabilities:

| Area                         | Remaining work                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Teacher assignments          | The API lists assigned missions but has no create/edit assignment endpoint. Add that only after the backend contract is extended. |
| Stakeholder dialogue         | The current feedback response exposes status, not dialogue text. Add dialogue UI only when a response contract exists.            |
| Charts and responsive polish | Consider visual trend charts and mobile-specific layout improvements; preserve accessible table/list alternatives.                |
| Authenticated integration    | Verify Supabase role scoping and API access against the configured backend.                                                       |
| Acceptance                   | Continue checking keyboard/touch access, reduced motion, offline recovery, and API error states on each changed route.            |

---

## 19. Common pitfalls

- **Treating Phaser as the simulation engine.** Phaser renders the map only;
  FastAPI owns all authoritative simulation outcomes.
- **Creating `frontend/.env`.** Vite reads the root `.env` (`envDir: ".."`).
- **Using the wrong env var name.** It is `VITE_API_BASE_URL`, not
  `VITE_API_URL`. The Supabase key is `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Leaving `VITE_API_BASE_URL` empty in local development.** The Vite dev
  server has no `/api/` proxy; only the production Nginx config does. Set it to
  `http://localhost:8000` when running `npm run dev`.
- **Sending `expected_turn` from a local counter.** Use the confirmed turn from
  `GET state` (or `state.current_turn`). Anything else yields `409`.
- **Generating a new idempotency key on retry.** Retrying after a network error
  should reuse the same key so the server returns the committed turn instead of
  rejecting a stale turn or double-applying.
- **Treating a `409` as a failure to hide.** It means the world moved; refetch
  and let the player continue.
- **Calling `/advance`.** It always returns `409`; decisions advance the turn.
- **Hard-coding actions, costs, plans, or reflection choices.** They come from
  `MissionDetail` and the scenario version. A rules change should require no
  frontend edit.
- **Computing outcomes client-side.** Bars and formatting are fine; numbers that
  the player would treat as results are not.
- **Showing a fallback as AI output.** Always expose `source` /
  `ai_feedback_status`.
- **Forgetting that only students can submit decisions.** Teachers get `404`
  from `/decisions`; the teacher UI must not offer play.
- **Putting a secret in a `VITE_` variable.** It ships in the browser bundle and
  in Gitleaks' sights.
- **Committing `.env`.** Never. Rotate anything that slips through.
- **Writing free-text explanations to reflections.** The API accepts only
  `answer_code`; there is no free-text field, by design.

---

## 20. Definition of done and PR checklist

A frontend PR is ready when:

- [ ] Every changed route has accessible loading, error, and empty states.
- [ ] `npm run lint`, `typecheck`, `test`, `build`, `format:check` pass.
- [ ] No secrets are bundled; no new `VITE_` value contains a credential.
- [ ] The UI reflects only confirmed server state; no client-computed outcome.
- [ ] Duplicate submits are impossible while a request is in flight, and every
      write sends an `Idempotency-Key`.
- [ ] Responsive and reduced-motion behaviour is respected.
- [ ] API-contract changes are reviewed by both developers.
- [ ] Tests cover the new behaviour.
- [ ] Screenshots and the relevant acceptance IDs (SIM-, AI-, DB-, AT-, MOB-,
      REP- from §14) are in the PR description.
- [ ] The branch is up to date with `develop` and CI is green.

---

## 21. Eleven-hour plan mapping (spec §13, Developer 1)

The original plan, annotated with the current state of this repository:

1. **0–1h:** layout, world-renderer skeleton, API shapes; joint contract
   checkpoint. _Routing, typed API wrapper, and API-backed Phaser renderer are
   implemented._
2. **1–3h:** routes and briefing; align mission variables. _Mission lobby and
   briefing flow are implemented._
3. **3–5h:** world view with keyboard/touch-selectable locations. _Map and
   equivalent location controls are implemented._
4. **5–7h:** HUD, decision/confirmation, timeline; protect the vertical slice.
   _Confirmed-state HUD, idempotent decisions, and saved timeline are
   implemented._
5. **7–9h:** stakeholder/event panel and loading/error states. _Scripted event
   and debrief panels are implemented; the current API does not provide
   stakeholder dialogue text._
6. **9–11h:** report, replay comparison, responsive/accessibility polish, demo
   rehearsal. _Reports, replay comparison, teacher views, and explicit local
   demo mode are implemented; continue polishing and verifying against the live
   backend._

Cut line reminder: at hour 7, stop adding features and protect the end-to-end
mission. Do not cut deterministic state validation, persistence, key security,
or error handling.

---

## 22. Reference documents

- `docs/API_CONTRACT.md` — endpoint table, decision shape, operational limits.
- `docs/GAME_PORTFOLIO.md` — the four games, reflection/hint design, SMS/USSD.
- `docs/SIMULATION_RULES.md` — deterministic rules, bounds, and replay.
- `docs/BACKEND_GUIDE.md` — backend/mobile setup and Africa's Talking testing.
- `docs/INTEGRATION_STATUS.md` — what has been verified and what remains.
- `docs/FRONTEND_UI_GUIDE.md` — visual system, responsive layouts, and chart design guidance.
- `CONTRIBUTING.md` — branch model, PR rules, commit style.
- `README.md` — run the whole stack with Docker Compose.
