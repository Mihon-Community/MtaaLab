# Frontend UI design guide

This document keeps the visual and interaction guidance for the React client in
one place. It describes design rules and target patterns; use
[`FRONTEND_GUIDE.md`](FRONTEND_GUIDE.md) and [`API_CONTRACT.md`](API_CONTRACT.md)
for the current implementation and supported data. Do not treat a proposed
layout or interaction here as proof that its feature is already implemented.

## Design principles

- Keep the interface calm, legible, and responsive without hiding information
  behind motion or colour.
- React owns navigation, controls, accessibility, and presentation. Phaser
  renders the world and sends user intent; FastAPI owns authoritative outcomes.
- Show only confirmed API state. Never present a predicted result or imply a
  write succeeded before the server confirms it.
- Use the project’s shared components and tokens before creating a one-off
  pattern.

## UI stack

| Area                | Project approach                                                                        |
| ------------------- | --------------------------------------------------------------------------------------- |
| Components          | Project-owned shadcn-style primitives built on Radix, in `frontend/src/components/ui/`. |
| Icons               | Named imports from `lucide-react`; pair meaningful icons with visible text.             |
| Styling             | Tailwind CSS 3.4 plus CSS variables in `frontend/src/styles/index.css`.                 |
| Motion              | `motion/react`; honor the OS preference and the in-app reduced-motion setting.          |
| Charts              | Recharts through shared components in `frontend/src/components/charts/`.                |
| Drawers and notices | Existing Radix primitives, `vaul`, and `sonner`. Show success only after confirmation.  |

Use existing dependencies where possible. shadcn/ui describes a component
pattern, not a reason to add another runtime component library. Kokonut UI may
be used as a source of design ideas, but do not copy it wholesale or add an
overlapping component system.

## Loading and bundle size

- Keep the route table lazy-loaded with a page skeleton fallback.
- Keep Phaser and chart code out of the shared application shell; load them with
  the screens that use them.
- Avoid remote fonts and images at runtime. Prefer the system font stack and
  inline SVG or small, compressed assets.
- Check the production build output after changing route or chart imports.

## Themes and colour

Appearance mode (`light`, `dark`, or `system`) is independent of the selected
palette. The six palettes are `mtoni`, `ocean`, `savanna`, `terracotta`,
`jacaranda`, and `contrast`; the last is the high-contrast palette. Text scale
is clamped to 90–125%, and reduced motion can follow the system or be enabled in
the app. Preferences are applied before first paint and persisted locally.

Use CSS variables from the theme rather than hard-coded surface colours. Keep
body text at 4.5:1 contrast and meaningful control boundaries at 3:1. Never
communicate status through colour alone: pair colour with a label, icon, shape,
or pattern. In the high-contrast palette, charts should also distinguish series
with line patterns or other non-colour cues.

For charts, keep sector colours associated with the same sector across screens
and palettes. Use direct value labels and a visible table alternative, since
some series colours are not sufficient on their own for light surfaces.

## Layout and navigation

Design mobile-first for a minimum width of 320px. Use the Tailwind breakpoints:
phone below 768px, tablet from 768px to 1023px, desktop from 1024px, and wide
desktop from 1440px.

- On desktop, keep the collapsible sidebar beside the page content. On phones,
  open it as a focus-managed sheet and use the bottom tab bar for primary
  destinations.
- Keep the top navigation sticky and include a breadcrumb, connection state,
  account controls, and display settings.
- Build session-aware links through `useSessionContext`; do not silently drop a
  session or mission identifier when moving between simulation, report, and
  replay.
- After route changes, move focus to the page heading, announce the new page in
  a polite live region, and return scroll to the top.
- Keep touch targets at least 44×44px on phones. Do not make any action
  available only on hover.

Suggested screen layouts:

| Screen     | Phone                                                                          | Desktop                                                            |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Lobby      | Single-column mission cards beneath a compact hero.                            | Two or three card columns beneath the hero.                        |
| Briefing   | Stacked sections; keep the start action easy to reach.                         | Main briefing beside a mission summary.                            |
| Simulation | Separate map, decision, and timeline views where useful; keep the HUD compact. | HUD above the map and decision panels, with the timeline below.    |
| Replay     | Stack comparison metrics, charts, and the table.                               | Place charts side by side and keep the comparison table available. |
| Report     | Outcomes, charts, decisions, then debrief.                                     | Give outcomes/charts and debrief room to sit beside each other.    |
| Teacher    | Session lookup followed by the report.                                         | Keep lookup and report detail clearly grouped.                     |

## Components and graphics

Prefer shared `Card` primitives. Keep interactive cards to one link or button;
do not nest interactive controls. Pair numeric values with units and use
`tabular-nums` for values that change.

Icons are decorative when visible text already names the action. Icon-only
buttons need an accessible name. Use approximately 16px inline and 20px in
navigation with a consistent stroke weight.

Use theme-token inline SVG for the Mtoni illustration so it works offline and
adapts to palette changes. Map markers need a text alternative and distinct
shapes. Stakeholder portraits are fictional; use initials as a fallback.

## Motion

Motion can explain a confirmed change, but it must never be the only way to
understand it. Keep page transitions short and restrained. Animate confirmed
turn changes only after the server response; show a pending label while a write
is in flight and do not optimistically change the HUD. Under reduced motion,
replace transitions and count-ups with immediate updates. Never animate layout
during a decision submission.

## Charts

Chart only values returned by the API. Formatting a value for display is fine;
forecast lines and client-computed outcomes are not. Use shared chart frames so
each chart has a visible title, a one-sentence summary, units, and a table with
the same values as the plot.

| Screen     | Data                                    | Guidance                                                                          |
| ---------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Simulation | Confirmed water accounting              | Show inflow, sector withdrawals, leakage, and overflow with direct value labels.  |
| Report     | Confirmed history and scenario outcomes | Keep water and budget on separate charts because they use different units.        |
| Replay     | Two saved reports and histories         | Compare confirmed outcomes; label original and alternative runs clearly.          |
| Teacher    | Authorized learner report               | Reuse report components; do not invent class aggregates the API does not provide. |

Enable Recharts’ keyboard accessibility layer. Make tooltips available by
focus and touch, use visible legends for multiple series, and keep a table
alternative available. On phones, prefer horizontal bars and allow long labels
to wrap. Only show charts for scenarios whose API response contains the
required fields.

## Review checklist

- Check the interface at phone and desktop widths, at 125% text size, in light,
  dark, and high-contrast palettes.
- Confirm that keyboard and screen-reader users can reach controls and
  understand map, loading, error, and confirmed states.
- Respect reduced motion and avoid colour-only information.
- Keep chart values, labels, and tables tied to the same confirmed API data.
