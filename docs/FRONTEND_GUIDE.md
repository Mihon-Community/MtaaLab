# Frontend guide

## Ownership

The browser application is React; do not add a parallel Streamlit UI. React owns routes, controls, accessibility, loading states, and presentation. Phaser renders the simulation world and reports user intent.

**FastAPI owns every authoritative simulation decision.** The client displays confirmed API state and must never calculate, predict, or persist official outcomes.

## Local setup

Use Node 22 LTS, pinned by the repository `.nvmrc`:

Create the one local environment file at the repository root from `.env.example` (PowerShell: `Copy-Item .env.example .env`). Do not create a second `frontend/.env`.

```sh
cd frontend
npm ci
npm run dev
```

Before opening a frontend PR, run `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run format:check` from `frontend/`. The package manifest and lockfile are the source of truth for dependencies; do not install packages globally.

## Folder map and rendering boundary

- `app/routes/`: page route table; `app/auth/`: authentication UI.
- `features/mission-lobby/`, `briefing/`, `simulation/`, `replay/`, `learning-report/`, `teacher-view/`: feature screens.
- `features/simulation/WorldScene.ts`: Phaser scene; `WorldCanvas.tsx`: mount/bridge; `worldLocations.ts`: shared location list for the map and its button equivalents; other panels are React UI.
- `components/`: reusable accessible controls; `services/api.ts`: typed FastAPI wrapper; `services/sessionCache.ts`: last confirmed session for offline display; `services/supabase.ts`: lazy Supabase client; `types/`: shared API/database types; `styles/`: Tailwind and global styles.
- `components/ui/`: project-owned shadcn-style primitives; `components/layout/`: shared app chrome; `components/charts/`: charts and accessible table alternatives; `lib/`: shared utilities and preferences.

Phaser may draw scene assets and report a selected location/action intent. It cannot compute official state. React sends the intent to FastAPI and updates the UI only after a confirmed response. Every map selection must also be available through keyboard-operable controls outside the canvas.

## Required screens (§8)

- Required: mission lobby; briefing; simulation world; decision centre; stakeholder panel (1–2 AI interactions); turn timeline; learning report; basic teacher console.
- The current API contract defines the available teacher and stakeholder capabilities. Render only fields and actions the API actually supports; show pending or unavailable feedback as such rather than fabricating dialogue.

The guide describes design and behavior requirements, not a live implementation audit. Check the current source and API contract before treating any screen, endpoint, or component as implemented.

## UI system

The goal is a calm, legible learning tool that feels alive without hiding information behind motion or colour. Everything in this section is presentation only: no component may derive or forecast simulation values.

### Stack

| Concern                | Default                                                                                     | Guidance                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Components             | [shadcn/ui](https://ui.shadcn.com) patterns and Radix primitives                             | Keep generated/copied components in `src/components/ui/`; adapt them to the project rather than adding a second system. |
| Icons                  | [`lucide-react`](https://lucide.dev/guide/packages/lucide-react)                             | Use named imports; pair meaningful icons with visible text.                                                            |
| Styling                | Existing Tailwind CSS 3.4 and CSS variables                                                 | Preserve the installed Tailwind major version. Do not migrate to Tailwind 4 as part of feature work.                    |
| Optional components    | [Kokonut UI](https://kokonutui.com)                                                         | Use selectively as a source of React/Tailwind patterns. Adopt one component at a time and align it with app tokens, accessibility, and existing shadcn primitives. |
| Motion                 | [`motion`](https://motion.dev)                                                              | Respect the reduced-motion preference; motion must not convey information by itself.                                   |
| Charts                 | Recharts via the shared chart components                                                   | Load charts with the pages that need them and provide a text summary and data table.                                     |
| Drawers / notifications| Radix-based dialog primitives, `vaul`, and `sonner`                                         | Use for mobile decision flows and concise status messages; only report success after server confirmation.             |

Use the existing project dependencies where possible. shadcn/ui is a component-generation approach, not a reason to install a second runtime component library. Before adding a component, check `src/components/ui/`, the package manifest, and existing feature components. Do not copy Kokonut UI wholesale or introduce overlapping primitives.

### Bundle and bandwidth budget

- Lazy-load every route with `React.lazy` + `Suspense` (fallback: page skeleton). Phaser is already a separate chunk; keep it that way.
- Load Recharts only with chart-enabled routes, never in the app shell. Check `npm run build` output when changing route or chart imports.
- No remote fonts or images at runtime. Use the system font stack, or one self-hosted variable `woff2` with `font-display: swap`.
- Illustrations are inline SVG or small compressed WebP; lazy-load anything below the fold.

### Theme and colour tokens

Themes: **light** (default), **dark**, **high contrast** (existing `data-contrast="high"`), and **system** (follows `prefers-color-scheme`). The high-contrast theme overrides both light and dark. Store the choice, text scale (90–125%), and a reduced-motion override in `localStorage`. Apply them on `<html>` before first paint (small inline script in `index.html`) to avoid a flash. Also honour `prefers-contrast: more`.

Map the existing brand palette onto shadcn variables in `styles/index.css`:

| Token                    | Light               | Dark        | Use                                    |
| ------------------------ | ------------------- | ----------- | -------------------------------------- |
| `--background`         | `#fffefa` (paper) | `#101a18` | Page                                   |
| `--foreground`         | `#153b35` (ink)   | `#e8f0ec` | Body text                              |
| `--card`               | `#ffffff`         | `#16231f` | Cards, panels                          |
| `--muted-foreground`   | `#627772`         | `#9fb3ad` | Secondary text                         |
| `--border`             | `#dce5dc`         | `#2a3a35` | Dividers, card borders                 |
| `--primary`            | `#176f5d` (green) | `#3fae8f` | Primary actions, active nav            |
| `--primary-foreground` | `#ffffff`         | `#06231c` | Text on primary                        |
| `--accent`             | `#d5ef91` (lime)  | `#2f4a1c` | Highlights, selected location          |
| `--destructive`        | `#b95e3e` (rust)  | `#e07a55` | Destructive/irreversible confirmations |
| `--ring`               | `#105544`         | `#7fd6bb` | Focus ring (3px, always visible)       |
| `--sidebar`            | `#f4f8f2`         | `#0c1513` | Sidebar surface                        |

Rules: body text must reach 4.5:1 contrast and UI boundaries 3:1 in every theme. Never put meaning in colour alone; pair every colour with an icon, label, or pattern.

### Data colours (validated)

Sector colours are fixed to the entity, never to its rank or sort order:

| Slot | Entity                    | Light       | Dark        | Icon         |
| ---- | ------------------------- | ----------- | ----------- | ------------ |
| 1    | Households / original run | `#2a78d6` | `#3987e5` | `House`    |
| 2    | School / alternative run  | `#eb6834` | `#d95926` | `School`   |
| 3    | Clinic                    | `#1baf7a` | `#199e70` | `Hospital` |
| 4    | Farms                     | `#eda100` | `#c98500` | `Wheat`    |

This order passed the colour-blind and normal-vision separation checks (`dataviz` validator) in both modes. On light surfaces, slots 3 and 4 are below 3:1 contrast, so sector charts **must** show direct labels or a visible table view. Reservoir magnitude uses a single blue ramp (`#cde2fb` → `#0d366b`).

Status colours are reserved and always ship with an icon and text: good `#0ca30c` (`CircleCheck`), warning `#fab219` (`TriangleAlert`), serious `#ec835a` (`CircleAlert`), critical `#d03b3b` (`OctagonAlert`). Do not reuse them as series colours. Value labels and legends use text tokens, never the series colour.

### Layout and navigation

Breakpoints (Tailwind defaults): phone `< 768px`, tablet `768–1023px`, desktop `≥ 1024px`, wide `≥ 1440px`. Minimum supported width is 320px. Design mobile-first.

```
Desktop ≥1024                         Phone <768
┌──────────┬──────────────────────┐   ┌──────────────────────┐
│ ▣ MtaaLab│ ☰  Simulation › Turn 3│   │ ☰  Simulation   ◐ ⚙ │  TopNav (sticky)
│──────────│  ● Online  ◐  ⚙       │   ├──────────────────────┤
│ MISSION  ├──────────────────────┤   │                      │
│ ⊞ Lobby  │                      │   │   page content       │
│ 📖 Brief │   page content       │   │                      │
│ 🗺 World │   (max-w-7xl)        │   │                      │
│ REVIEW   │                      │   ├──────────────────────┤
│ ⇄ Replay │                      │   │ ⊞   📖   🗺   📊   ⋯ │  MobileTabBar
│ 📊 Report│                      │   └──────────────────────┘
│ TEACHER  │                      │   ☰ opens the sidebar as a Sheet
│ 🎓 View  │                      │
│ « Collapse                      │
└──────────┴──────────────────────┘
```

- **AppShell** (`components/layout/AppShell.tsx`): `SidebarProvider` → `AppSidebar` + `SidebarInset` containing `TopNav`, `<main id="main-content" tabIndex={-1}>`, and `MobileTabBar`. Keep the skip link as the first focusable element.
- **AppSidebar** (shadcn `Sidebar`, `collapsible="icon"`): groups _Mission_ (Lobby `LayoutGrid`, Briefing `BookOpen`, Simulation `Map`), _Review_ (Replay `GitCompareArrows`, Learning report `ChartColumn`), _Teacher_ (Teacher view `GraduationCap`). The footer holds a collapse button (`PanelLeftClose` / `PanelLeftOpen`, `aria-expanded`, label "Collapse sidebar") and the display settings. Desktop opens expanded; tablet starts as the icon rail. The collapsed state persists via the sidebar cookie. In icon mode every item keeps an `aria-label`, and tooltips also open on keyboard focus — never hover-only.
- **TopNav** (sticky, `h-14`, blurred translucent background): `SidebarTrigger` (hamburger `Menu` on phones, `aria-label="Open navigation"`), `Breadcrumb` (_Mission › Simulation › Turn 3 of 6_), connection badge (`Wifi` / `WifiOff` with text "Online" / "Offline — showing last confirmed state"), and a display-settings `DropdownMenu` (`Settings2`: theme, high contrast, text size, reduced motion).
- **Phones:** the sidebar renders as a `Sheet` sliding from the left. It traps focus, closes on route change and on `Esc`, and returns focus to the hamburger. `MobileTabBar` is a fixed bottom bar for Lobby, Briefing, World, Report, and _More_ (opens the sheet). It has 44×44px targets, the active state uses icon + label + indicator bar, and it respects `env(safe-area-inset-bottom)`. Hide it while the decision drawer is open.
- **Session-aware links:** derive nav hrefs from one `useSessionContext()` hook (reads `session_id`/`mission_id` from the URL, falling back to `sessionCache`). Disable routes that need a session (Simulation, Replay, Report) until one exists, and show a reason ("Start a mission first"). Never silently drop the session.
- **Route transitions:** on navigation, move focus to the page `<h1>` and announce the page title in a polite live region. Restore scroll to the top. Fade content in 150ms (none under reduced motion). Keep the shell static so navigation feels instant.
- **Journey stepper:** Briefing, Simulation and Report show the spec §3 journey (Enter → Investigate → Decide → Advance → Respond → Reflect) as a compact horizontal stepper (vertical on phones). Use `aria-current="step"` and text status, not colour alone.

### Screen layouts

| Screen     | Phone                                                                                                                                                                      | Desktop                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lobby      | Single-column mission cards, hero banner with mission illustration                                                                                                         | 2–3 column card grid, hero with stats                                                                                                           |
| Briefing   | Stacked sections, `Accordion` for rules/glossary, sticky bottom "Start mission" bar                                                                                      | Two columns: content left, sticky summary card (turns, budget, objectives) right                                                                 |
| Simulation | `Tabs`: **Map** (canvas + location chips) / **Decide** (opens `Drawer` with one action at a time) / **Timeline**. HUD collapses to a 2×2 stat strip | 12-col grid: HUD row full width; map 8 cols + inspection 4 cols; decision panel and event panel side by side below; timeline in a `ScrollArea` |
| Replay     | Metric cards with original vs alternative, charts stacked, table toggle                                                                                                    | Charts side by side with the comparison table below                                                                                              |
| Report     | Outcome stat cards → charts → decisions → debrief, print-friendly                                                                                                       | Two-column: outcomes/charts left, debrief/rubric right                                                                                           |
| Teacher    | Session lookup card, report cards                                                                                                                                          | Lookup + summary in the header, report detail in a tabbed panel. Show only actions and data supported by the current API.                       |

### Cards

Prefer the shared shadcn `Card` primitives over one-off card markup. Add variants with `cva` in `components/ui/card.tsx` only when multiple screens need the same treatment:

- `default`: `rounded-2xl border bg-card shadow-sm`, padding `p-5 md:p-6`.
- `interactive` (mission cards, location chips): hover/focus lifts 2px with `shadow-md` and a `ring-primary` focus ring. The whole card is one link or button, not nested buttons.
- `stat` (HUD and report KPIs): icon in a tinted 40px rounded square, label (`text-sm text-muted-foreground`), large tabular value (`text-3xl font-semibold tabular-nums`), unit (_water units_, _budget credits_), and an optional status `Badge` with icon.
- `alert` (critical alerts, AI unavailable): left 4px border in the status colour plus icon and heading.
- `muted` (pending/AI-generated notes): dashed border with an "AI-generated, teacher-reviewable" badge.

Always label quantities with units. Use `tabular-nums` for changing numbers so layouts do not jitter.

### Icon map (lucide-react)

| Meaning             | Icon                              | Meaning               | Icon                      |
| ------------------- | --------------------------------- | --------------------- | ------------------------- |
| Reservoir           | `Waves`                         | Repair leaking pipe   | `Wrench`                |
| Pipes / leakage     | `Droplets`                      | Conservation campaign | `Megaphone`             |
| Households          | `House`                         | Change allocation     | `SlidersHorizontal`     |
| School              | `School`                        | Install storage       | `Container`             |
| Clinic              | `Hospital`                      | Efficient irrigation  | `Sprout`                |
| Farms               | `Wheat`                         | Rainfall / inflow     | `CloudRain`             |
| Budget              | `Coins`                         | Turn                  | `Hourglass`             |
| Wellbeing           | `HeartPulse`                    | Crop health           | `Leaf`                  |
| Stakeholder message | `MessageSquareText`             | AI unavailable        | `BotOff`                |
| Replay              | `GitCompareArrows`              | Read aloud            | `Volume2` / `VolumeX` |
| Theme               | `Sun` / `Moon` / `Contrast` | Retry                 | `RotateCw`              |

Icons are decorative (`aria-hidden="true"`) when a visible label is next to them. Icon-only buttons need an `aria-label`. Default size is 16px inline and 20px in nav, with `strokeWidth={2}`.

### Graphics

- Lobby/briefing hero: an inline SVG illustration of Mtoni (hills, reservoir, roofs) built from theme tokens, so it recolours in dark and high-contrast modes. Under ~15 KB.
- The Phaser world keeps 2D/2.5D tiles (spec §3: no 3D). Status markers on locations use icon + shape (circle = OK, triangle = warning, octagon = critical), not colour alone. The canvas has a text caption summarising the map state.
- Empty states: small line illustration + one sentence + one action (e.g. `CloudOff` "Can't reach the server. Your last confirmed turn is shown." + Retry).
- Stakeholder portraits are static, fictional illustrations (spec §15: no real people). Use initials as a fallback via `Avatar`.

### Motion

Motion explains change; it never carries the only copy of information.

| Pattern                  | Spec                                                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page enter               | Fade + 8px rise, 180ms, `easeOut`                                                                                                                                                            |
| Card list                | Stagger 40ms, max 6 items animated                                                                                                                                                             |
| Sidebar collapse / sheet | Use shadcn defaults (~200ms)                                                                                                                                                                   |
| Confirmed turn           | After the server response only: HUD numbers count to the new value (400ms), changed stat cards pulse once, timeline appends the new entry with a slide-in, `sonner` toast "Turn 3 confirmed" |
| Pending request          | Button shows a `Loader2` spinner + "Submitting…" text. No optimistic state changes                                                                                                          |
| Charts                   | Recharts animation ≤ 400ms; `isAnimationActive={!reducedMotion}`                                                                                                                            |
| Hover/press              | `active:scale-[0.98]`, 120ms colour transitions                                                                                                                                              |

Under reduced motion (OS setting **or** the in-app toggle), all transforms and count-ups become instant swaps and the toast stays. Wrap the app in `<MotionConfig reducedMotion="user">` and use a `useReducedMotionPreference()` hook that merges the in-app toggle. Never animate layout during a decision submit.

### Charts

Chart only values the API returned. Reformatting for display is allowed (e.g. reservoir level ÷ capacity as a percentage). Forecasts, "what if" lines, and recomputed effects are not.

| Where                        | Chart                           | Data source                                             | Form                                                                                                         |
| ---------------------------- | ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Simulation HUD               | Reservoir fill                  | `state.reservoir_level` / `reservoir_capacity`      | Stat card + horizontal progress bar with label "640 / 1,000 water units" (not a gauge)                       |
| Simulation, after each turn  | Water accounting                | `DecisionResponse.water_accounting`                   | Horizontal bar: inflow vs withdrawals by sector, leakage, overflow; direct value labels                      |
| Simulation timeline / report | Reservoir and budget over turns | `GET .../history` → `entries[].state`              | **Two separate** small line charts (different units — never a dual axis), markers ≥ 8px at each turn |
| Report                       | Service level by sector         | `outcomes.service_levels`, `unmet_demand_by_sector` | Horizontal bars, sector colour + icon + direct % label                                                       |
| Replay                       | Original vs alternative         | Both sessions' reports/history                          | Grouped bars per outcome metric (slot 1 vs slot 2) + paired reservoir lines; legend + direct labels          |
| Teacher                      | Learner session outcome         | Session report                                          | Same components as the report; no class aggregates until the API provides them                               |

Build charts through shared components (for example `components/charts/ChartFrame.tsx`) so every screen follows the same rules. Use a restrained shadcn-style card with theme-token surfaces and borders. When using Recharts, enable its keyboard accessibility layer so chart navigation can expose the tooltip values to keyboard users.

- Wrap each chart in `<figure>` with a visible title, a one-sentence `figcaption` summary generated from the values (e.g. "Reservoir fell from 800 to 640 water units over 3 turns"), units on axes, and a **Chart / Table** `ToggleGroup`. The table uses shadcn `Table` with the same numbers.
- Use 2px lines and thin bars with 4px rounded data ends and a 2px gap between adjacent bars. Grid lines and axes are recessive (`--border`), with a legend for ≥ 2 series.
- Tooltips show on hover **and** on focus/tap. Each mark has a hit target ≥ 24px.
- If using shadcn's copied `chart` component, use `ChartContainer` + `ChartConfig` and map series colours to the tokens above via CSS variables. In high-contrast mode, distinguish series with dash patterns and textures as well as colour.
- Charts render inside `aspect-[16/9] md:aspect-[2/1]` containers with a min-height of 200px. On phones, prefer horizontal bars and let long axis labels wrap.

## Delivery order

For substantial UI work, deliver small reviewable changes and keep the existing checks green:

1. Protect the end-to-end mission path: load a mission, create or resume a session, submit a decision, and display only the confirmed response.
2. Improve shared navigation, session context, loading/error/empty/offline states, and mobile layouts without changing API behavior.
3. Polish the feature screens and introduce charts only where the API supplies suitable data.
4. Finish with keyboard, screen-reader, contrast, reduced-motion, narrow viewport, and bundle checks.

Before implementing a screen, read its feature code and `docs/API_CONTRACT.md`. Keep API contract changes coordinated with backend work. Do not treat this guide as evidence that a feature or endpoint already exists.

## Interaction rules

Disable duplicate submit while a request is running; send a unique `Idempotency-Key` and expected turn. Show loading, retry, API-error, and AI-unavailable states. Never imply success before server confirmation. After Realtime disconnect, retain last confirmed state, reconnect, and fetch current session state. Use Realtime for low-volume turn/report/status updates, not frames.

## Accessibility checklist (§12)

- [ ] Keyboard/switch and touch equivalent for every map action; visible focus.
- [ ] Semantic headings, labelled controls, text alternative for map status, announcements for important state changes.
- [ ] High-contrast theme and adjustable text; no colour-only signal.
- [ ] Reduced-motion mode; no animation-only information.
- [ ] One decision at a time, consistent controls, short instructions, glossary/optional hints.
- [ ] Audio is optional and has text alternative; audio is never required to finish.
- [ ] Sidebar, sheet, drawer and dropdowns are fully keyboard operable, trap focus while open and return it on close.
- [ ] Every chart has a text summary and a table view; tooltips work on focus and tap.
- [ ] Layout works from 320px to wide desktop at 125% text without horizontal scrolling (the map canvas may pan).
- [ ] Touch targets are at least 44×44px on phones.

## Low bandwidth and PWA

Cache the static shell and approved mission content. Keep last confirmed state available for display. Queue user input only if backend can later revalidate it; never call it accepted offline. Compress/lazy-load media and show a clear reconnect/retry action. USSD is a constrained alternative, not a visual-world equivalent. Keep the shell free of chart, motion-heavy, and Phaser code so first load stays fast on constrained connections.

## Supabase

Use only `VITE_SUPABASE_URL` and the publishable key in the browser; all `VITE_` values are public. Use Supabase Auth session and pass its JWT as Bearer token to FastAPI. RLS remains required. Use Realtime for private, scoped meaningful updates; reconnect and refresh state after disconnect. Never write authoritative simulation state directly from the client.

## Mock before backend is ready

Build to `docs/API_CONTRACT.md`. Use typed fixtures with clearly fictional values, injected fetch/client functions, and a deterministic mock server in tests. Mock only transport responses; keep all decision result values supplied by the mock API, never derived by UI calculations. Contract changes require both developers' review.

## Frontend PR done

Every changed route has accessible loading/error/empty states, tests and lint/typecheck/build pass, no secrets are bundled, UI reflects only confirmed server state, responsive/reduced-motion behavior is respected, API contract changes are jointly reviewed, and screenshots plus relevant acceptance IDs are in the PR. UI PRs also include screenshots at phone and desktop widths in light, dark and high-contrast themes, and note the gzip size of the main chunk.
