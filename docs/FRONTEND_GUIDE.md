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
- `features/simulation/WorldScene.ts`: Phaser scene; `WorldCanvas.tsx`: mount/bridge; `worldLocations.ts`: shared location list for the map and its button equivalents; other panels are React UI.
- `components/`: reusable accessible controls; `services/api.ts`: typed FastAPI wrapper; `services/sessionCache.ts`: last confirmed session for offline display; `services/supabase.ts`: lazy Supabase client; `types/`: shared API/database types; `styles/`: Tailwind and global styles.
- Planned with the UI system below: `components/ui/` (generated shadcn primitives — do not hand-edit beyond token tweaks), `components/layout/` (AppShell, AppSidebar, TopNav, MobileTabBar, PageHeader), `components/charts/` (chart wrappers with table fallbacks), `lib/utils.ts` (`cn()`), `lib/theme.tsx` (theme/contrast/text-size/motion preferences).

Phaser may draw scene assets and report a selected location/action intent. It cannot compute official state. React receives that intent, sends it to FastAPI, and updates official state only after the confirmed response. Provide equivalent buttons/list entries for every map selection.

## Required screens (§8)

- Required: mission lobby; briefing; simulation world; decision centre; stakeholder panel (1–2 AI interactions); turn timeline; learning report; basic teacher console.
- The current API cannot edit teacher assignments or list learners. Its stakeholder feedback endpoint returns a status rather than dialogue text; the UI must state these limits instead of fabricating data.

### Current status (audit, 2026-11-24)

| Area               | Implemented                                                                                                                                                                        | Still to do                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell          | Skip link, brand header, flat horizontal `NavLink` list, footer, contrast + text-size toggle                                                                                     | Responsive navbar, collapsible sidebar, mobile hamburger/sheet, bottom tab bar, breadcrumbs, persisted preferences, dark theme, route-level lazy loading, 404 page (unknown routes currently render the lobby) |
| Navigation context | Pages read `session_id` / `mission_id` / `source_session_id` from the query string                                                                                           | Main nav links drop these params, so moving Simulation → Report from the header loses the session. Nav must carry the active session (see _Navigation_)                                                     |
| Mission lobby      | Mission cards from `GET /api/missions`, loading/error/empty notices, briefing link                                                                                               | shadcn `Card` + skeletons, icons, estimated play time, motion on enter                                                                                                                                       |
| Briefing           | Objectives, facts, action catalogue, controls list, optional read-aloud, start mission                                                                                             | Journey stepper, glossary/hints (`Accordion`/`Tooltip` with tap support), sticky start CTA on phones                                                                                                       |
| Simulation         | Phaser world (lazy chunk), location buttons, inspection, HUD with `<meter>`, decision form with idempotency + expected turn, event panel, timeline, offline last-confirmed state | Mobile layout (map / decide / timeline tabs, decision `Drawer`), HUD charts, water-accounting chart per turn, toasts for confirmed turns, connection badge in navbar                                         |
| Replay             | Two-run comparison table, decision lists                                                                                                                                           | Grouped bar + paired line charts, table toggle                                                                                                                                                                 |
| Learning report    | Outcomes grid, service-level meters, decisions, events, debrief generation, rubric criteria                                                                                        | Service-level bar chart, reservoir/budget trend from history, printable layout                                                                                                                                 |
| Teacher view       | Session-report lookup and summary                                                                                                                                                  | Card/table layout, report charts; assignment editing and learner lists remain blocked by the API                                                                                                               |
| Shared components  | `ContrastToggle`, `AudioControls`                                                                                                                                              | `LoadingState` and `AccessibleButton` are still TODO stubs — replace with shadcn `Skeleton`/`Button`-based versions                                                                                   |
| Styling            | ~2,000 lines of hand-written CSS classes in `styles/index.css`; Tailwind 3 installed but unused (`theme.extend` is empty)                                                      | Design tokens, shadcn primitives, migrate screens off legacy classes one at a time                                                                                                                             |
| Accessibility      | Labelled controls, `role="status"` regions, high-contrast theme, text scale, reduced-motion CSS                                                                                  | Checklist items below are not yet verified end to end                                                                                                                                                          |

## UI system

The goal is a calm, legible learning tool that feels alive without hiding information behind motion or colour. Everything in this section is presentation only: no component may derive or forecast simulation values.

### Stack

| Concern                | Choice                                                                                      | Notes                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Primitives             | [shadcn/ui](https://ui.shadcn.com) (Radix-based, copied into `components/ui/`)             | Accessible keyboard/focus behaviour out of the box                                                                       |
| Icons                  | `lucide-react`                                                                            | Tree-shaken named imports only; never `import * as Icons`                                                              |
| Styling                | Tailwind CSS v4 + CSS variables                                                             | Current shadcn targets Tailwind v4 and React 19. If the upgrade is blocked, pin `shadcn@2.3.0` for Tailwind v3 instead |
| Motion                 | `motion` (`motion/react`) with `LazyMotion` + `domAnimation` and `m.*` components | Keeps the motion bundle small; `MotionConfig reducedMotion="user"` at the root                                         |
| Charts                 | shadcn `chart` (Recharts)                                                                 | Loaded only on routes that chart; every chart has a table view                                                           |
| Mobile drawer / toasts | shadcn `drawer` (vaul), `sonner`                                                        | Toasts only for server-confirmed events                                                                                  |

### Setup steps

Run each step as its own PR-sized change and keep all checks green between them.

```sh
cd frontend
# 1. Tailwind v3 -> v4 (review the diff; legacy classes in index.css should survive)
npx @tailwindcss/upgrade
npm i -D @tailwindcss/vite
# 2. Path alias: add "baseUrl": ".", "paths": { "@/*": ["./src/*"] } to tsconfig.json
#    and resolve.alias { "@": path.resolve(__dirname, "src") } + tailwindcss() plugin in vite.config.ts
# 3. shadcn
npx shadcn@latest init
npx shadcn@latest add button card badge separator sheet sidebar tooltip dropdown-menu \
  tabs drawer dialog alert-dialog accordion progress skeleton scroll-area table \
  breadcrumb toggle-group radio-group slider label textarea sonner chart
# 4. Motion
npm i motion
```

`shadcn init` installs `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, and `tw-animate-css`. Pin exact versions in `package.json` to match the rest of the repo.

### Bundle and bandwidth budget

- Lazy-load every route with `React.lazy` + `Suspense` (fallback: page skeleton). Phaser is already a separate chunk; keep it that way.
- Recharts loads only with Simulation, Replay, Report and Teacher chunks — never in the shell.
- Target: shell + lobby under ~180 KB gzip JS. Check `npm run build` output in every UI PR.
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
| Teacher    | Session lookup card, report cards                                                                                                                                          | Lookup + summary in the header, report detail in a tabbed panel. State the API limits in an inline `Alert`                                     |

### Cards

Use shadcn `Card` everywhere instead of `surface-card`, `metric-card`, and `mission-card`. Define a few variants with `cva` in `components/ui/card.tsx`:

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

Build rules (shared `components/charts/ChartFrame.tsx`):

- Wrap each chart in `<figure>` with a visible title, a one-sentence `figcaption` summary generated from the values (e.g. "Reservoir fell from 800 to 640 water units over 3 turns"), units on axes, and a **Chart / Table** `ToggleGroup`. The table uses shadcn `Table` with the same numbers.
- Use 2px lines and thin bars with 4px rounded data ends and a 2px gap between adjacent bars. Grid lines and axes are recessive (`--border`), with a legend for ≥ 2 series.
- Tooltips show on hover **and** on focus/tap. Each mark has a hit target ≥ 24px.
- Use `ChartContainer` + `ChartConfig` from shadcn `chart` and map series colours to the tokens above via CSS variables, so themes swap in one place. In high-contrast mode, add dash patterns to lines and texture to bars.
- Charts render inside `aspect-[16/9] md:aspect-[2/1]` containers with a min-height of 200px. On phones, prefer horizontal bars and let long axis labels wrap.

## Build prompts

Copy-paste prompts for implementing each piece with an AI assistant or as a ticket. Each assumes the setup steps above are done and that the assistant reads this guide, `docs/API_CONTRACT.md`, and the existing feature file first. Run one prompt per PR.

**1. Tokens and themes**

> In `frontend/`, map the colour tokens from `docs/FRONTEND_GUIDE.md` → _Theme and colour tokens_ and _Data colours_ onto shadcn CSS variables in `src/styles/index.css` for light, dark (`.dark`), and `[data-contrast="high"]`. Create `src/lib/theme.tsx` with a `ThemeProvider` persisting theme (light/dark/system), high contrast, text scale (0.9–1.25), and reduced-motion override in `localStorage`. Apply it on `<html>` before paint via an inline script in `index.html`. Replace `ContrastToggle` with a `DisplaySettings` dropdown (lucide `Settings2`, `Sun`, `Moon`, `Contrast`). Keep existing tests passing and add tests for persistence.

**2. App shell and navigation**

> Replace the header in `src/app/App.tsx` with an `AppShell` using shadcn `Sidebar` (`collapsible="icon"`), `SidebarInset`, a sticky `TopNav` (SidebarTrigger, Breadcrumb, connection badge, DisplaySettings), and a phone-only `MobileTabBar`, exactly as described in _Layout and navigation_. Group routes in `routePages` with `group` and `icon` fields. Add `useSessionContext()` so nav links preserve `session_id`/`mission_id` and session-only routes are disabled with a visible reason. Lazy-load routes with `React.lazy`, add a real 404 page, and move focus to the page `<h1>` on navigation. Keep the skip link. Test keyboard navigation, sheet focus trap/return, and preserved query params.

**3. Shared states**

> Replace the stub `LoadingState` and `AccessibleButton` with shadcn-based components: `LoadingState` (skeleton variants for card grid, page, chart; `role="status"` text), `ErrorState` (icon, message, Retry button with `RotateCw`), `EmptyState`, and `OfflineBanner` ("Offline — showing last confirmed state"). Update every page to use them. Do not change data fetching behaviour.

**4. Lobby and briefing**

> Restyle `LobbyPage` and `BriefingPage` with shadcn `Card` variants (`interactive`, `stat`), lucide icons from the _Icon map_, an inline SVG Mtoni hero built from theme tokens, the journey stepper, an `Accordion` glossary, and a sticky mobile "Start mission" bar. Add `motion` page-enter and card stagger that respect reduced motion. Keep all existing roles, labels and test IDs, and keep tests green.

**5. Simulation responsive layout**

> Rework `SimulationPage` into the desktop 12-column grid and the phone `Tabs` layout (Map / Decide / Timeline) from _Screen layouts_. On phones the decision form opens in a shadcn `Drawer` and shows one action at a time. Convert `ResourceHUD` to `stat` cards with lucide icons, units, and status badges (icon + text). Animate HUD values and the timeline only after the server confirms a decision, and fire a `sonner` toast "Turn N confirmed". Keep idempotency, expected-turn, duplicate-submit protection, and offline behaviour unchanged. Add tests for the phone layout and for no state change before confirmation.

**6. Charts**

> Add `src/components/charts/` with `ChartFrame` (figure, title, generated summary caption, Chart/Table toggle, shadcn `Table` fallback) and these charts using shadcn `chart`: `ReservoirTrendChart`, `BudgetTrendChart`, `WaterAccountingChart`, `ServiceLevelChart`, `RunComparisonChart`. Follow _Charts_ and _Data colours_ exactly: no dual axis, sector colours fixed per entity, direct labels, focus/tap tooltips, high-contrast patterns, animation off under reduced motion. Plot only API values. Use them in Simulation, Report, Replay and Teacher views. Test that table views match the data, and that the charts are absent from the shell chunk.

**7. Report, replay, teacher polish**

> Restyle `ReportPage`, `ReplayPage` and `TeacherPage` with `stat` cards, the chart components, `Tabs` for detail sections, and print styles for the report (`@media print`: hide nav, single column). In `TeacherPage`, show the API limits (no assignment editing or learner list) in an inline `Alert` with `Info` icon. Keep all API behaviour unchanged.

**8. Accessibility and responsive pass**

> Audit every route at 320, 375, 768, 1024 and 1440px in light, dark and high-contrast themes, with 125% text and reduced motion. Fix overflow, target sizes under 44px on touch, missing focus rings, colour-only signals, and hover-only interactions. Tick the _Accessibility checklist_ only for verified items and note anything outstanding in the PR.

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

## 11-hour plan mapping (§13, Developer 1)

1. **0–1h:** layout, Phaser skeleton, API shapes; joint contract checkpoint.
2. **1–3h:** app/routes and briefing; align mission variables.
3. **3–5h:** world view and keyboard/touch-selectable locations.
4. **5–7h:** HUD, decision/confirmation, timeline; protect vertical slice at hour 7.
5. **7–9h:** stakeholder/event panel and loading/error states. Joint checkpoint: one decision changes confirmed backend state.
6. **9–11h:** report, replay comparison, responsive/accessibility polish, demo rehearsal. Joint checkpoint: API decision works, feedback grounded, sandbox USSD/SMS shown or limitations accurately stated.

The UI system work (build prompts 1–8) is polish on top of a working vertical slice. If time is short, do prompts 1–3 and 5 first. Charts and motion come after the end-to-end mission is protected (spec cut line).

## Mock before backend is ready

Build to `docs/API_CONTRACT.md`. Use typed fixtures with clearly fictional values, injected fetch/client functions, and a deterministic mock server in tests. Mock only transport responses; keep all decision result values supplied by the mock API, never derived by UI calculations. Contract changes require both developers' review.

## Frontend PR done

Every changed route has accessible loading/error/empty states, tests and lint/typecheck/build pass, no secrets are bundled, UI reflects only confirmed server state, responsive/reduced-motion behavior is respected, API contract changes are jointly reviewed, and screenshots plus relevant acceptance IDs are in the PR. UI PRs also include screenshots at phone and desktop widths in light, dark and high-contrast themes, and note the gzip size of the main chunk.
