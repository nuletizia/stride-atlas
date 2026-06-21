# Stride Atlas — orientation for agents

A Next.js 16 App Router dashboard that turns a Strava athlete's runs into a one-page progress view. Nine panels, five theme palettes, no server DB for activity data. Deployed to Vercel at `stride.letizia.tech`.

## Runbook

```bash
npm run dev        # http://localhost:3000
npm run build      # production build (use this, not `lint`, to verify)
npm run ingest     # offline: activities/ → data/runs.json
```

There is no test suite. Verify changes by running `next build` and by clicking through the UI in a browser. For UI tweaks, load `/demo` (bundled sample data) — it works without any Strava env vars.

## Routing (App Router)

| Path | File | Auth | Purpose |
|---|---|---|---|
| `/` | `app/page.jsx` | public | Landing. Logged-in users are `redirect('/app')`'d. |
| `/app` | `app/app/page.jsx` | required | Real user dashboard. Fetches Strava, renders `<Dashboard mode="user">`. |
| `/demo` | `app/demo/page.jsx` | public | Same dashboard from bundled `data/runs.json`, `mode="demo"`. |
| `/privacy` | `app/privacy/page.jsx` | public | Plain-English privacy policy. Keep it in sync with actual data flow. |
| `/api/auth/strava` | OAuth initiate | — | Redirects to Strava with CSRF `state`. |
| `/api/auth/strava/callback` | OAuth callback | — | Exchanges code → tokens → session. |
| `/api/auth/logout` | clear session | — | POST; redirects to `/`. |
| `/api/runs` | — | required | Force-refresh Strava data (handles token refresh). |
| `/api/debug/strava-raw` | — | required | Dev-only raw activity dump. |

Favicon/OG are Next dynamic: `app/icon.svg` (static SVG), `app/apple-icon.jsx` (180×180 ImageResponse), `app/opengraph-image.jsx` (1200×630 ImageResponse).

## Data flow

Two sources feed the *exact same* `STRIDE_DATA` shape:

1. **Offline** — `scripts/ingest.mjs` parses FIT/TCX/GPX from `activities/` → `data/runs.json`. `/demo` reads this file.
2. **Live** — `/app` server component calls Strava's `/athlete/activities` (summary only) → `summaryToRun` → `buildStrideData`. Cached per athlete for 1h in an in-memory `Map` on the server module. Cold-start wipes it; that's fine.

Both paths converge in `lib/ingest-runtime.js` (`buildStrideData`, `summaryToRun`, `inferType`, `clusterRoutes`, `isoWeek`). That file must stay pure: no `fs`, no `fetch`, no `process.env`.

Personal Records that depend on rolling splits (`bestSplits`) are **gated** in summary mode — they require per-activity streams (one Strava call each), which is Phase 2. The PersonalRecords panel handles the `streamsSynced=false` case itself.

### The run record (what every panel consumes)

```
{ id, date, dow, type, routeId, routeName,
  distance, pace, duration, hr, maxHr, elev, temp,
  zones, bestSplits, pr, routePR, note,
  isRace, isLong, isRecovery, sufferScore }
```

- `distance` is km; `pace` is min/km; `duration` is minutes; `elev` is meters. **All unit conversion happens at display time** via helpers in `lib/shared.jsx` (`kmToDisplay`, `paceToDisplay`, `elevToDisplay`, …). Don't mutate the data layer to miles.
- `type` ∈ `easy | tempo | long | intervals | race | recovery`. Internal keys never change (CSS vars `--type-easy` etc. depend on them); the display label comes from `TYPE_META[type].label` (e.g., `tempo` → "Moderate", `intervals` → "Hard").
- `type` is **re-inferred client-side** inside `DataProvider` whenever HR max changes, so the user's HR-max override re-shuffles intensity labels live without a refetch.

## Context providers (all defined in `lib/shared.jsx`)

Wrapping order set in `components/Dashboard.jsx`:

```
HrMaxProvider → DataProvider → TweakProvider → TooltipProvider → LinkProvider
```

- **HrMaxProvider** — base HR max from data + user override (localStorage `stride.hrMaxOverride`, 140–230 guardrail). `useHrMax()` returns `{ baseHrMax, override, effective, setOverride }`. `effective` is what the rest of the app reads.
- **DataProvider** — takes raw `data`, re-runs `inferType` per run with the current `effective` HR max. Exposes `useData()`.
- **TweakProvider** — style / timeRange / metric / units / tempUnits / customRange, persisted as a single JSON blob in localStorage `stride-atlas-tweaks-v1`. `useTweaks()`. Applies theme via `applyTheme(style)` which writes CSS vars to `<html>`. `units` is `km`/`mi` (distance/pace/elev); `tempUnits` is `c`/`f` (temperature only, independent toggle).
- **TooltipProvider** — one global floating tooltip. Panels call `show(content, x, y)` / `hide()`.
- **LinkProvider** — cross-panel linking (see below). `useLink()`.

`useFilteredRuns()` returns runs filtered by `timeRange` (`1m / 3m / 6m / 1y / all / custom`). "now" is anchored to the most recent run's date, not wall clock — so imported datasets always produce a populated window.

## Cross-panel linking (the important part)

Click a dot/bar/cell anywhere in any panel → the corresponding RunCard scrolls into view and expands. The machinery:

- `hovered` — `{ runId, routeId, type, date }` — read by every panel to dim/highlight matches.
- `focusRequest` — one-shot signal: a panel writes `runId`, RunCards consumes it in a `useEffect` (scrolls + expands + flashes), then writes `null` back.
- `requestFocus(id)` — wraps `setFocusRequest` with a **two-tap gate on touch devices**. On `hover: none`:
  - first tap → marks `pendingFocusId = id`, returns `false` (tooltip gets read)
  - second tap on the same target → commits focus, returns `true`
  - On hover-capable devices, one tap commits immediately. Callers use the return value to decide whether to dismiss the tooltip.
- Every interactive `<g>` in the SVG panels is tagged `data-tap-focus="true"`. `TouchDismissHandler` listens for document `pointerdown`s outside any `data-tap-focus` element and clears `hovered` / `pendingFocusId` / tooltip — this kills stuck tooltips on mobile.
- `RunCards` hover state is **local** (`hoveredCardId`), intentionally decoupled from the global `hovered`, so hovering a card doesn't ripple into SameRouteDuel / other panels.
- Outside-click-to-collapse for expanded run cards is scoped to `!panelRef.current.contains(e.target)` — outside the **panel**, not just outside the card — so chips and the View FAB don't trip it.

If you add a new interactive element that should be "tap to focus a run," follow the pattern: call `requestFocus(runId)` on click, tag the SVG group with `data-tap-focus="true"`, dismiss tooltip iff the call returns `true`.

## Panels

| Component | Role |
|---|---|
| `RunAtlas` | Calendar heatmap — every run as a cell. Global. |
| `PersonalRecords` | Rolling splits per standard distance. Gated on `streamsSynced`. |
| `PaceRibbon` | Trend ribbons per workout type. Has its own `MetricToggle` (pace/distance/hr/efficiency) — this is the **only** place metric matters. |
| `AerobicEfficiency` | Pace ÷ HR over time. |
| `DistancePaceCurve` | Scatter: distance × pace, with per-type fit lines. |
| `RunCards` | Per-run cohort comparison (same type, similar distance). The destination of every `focusRequest`. |
| `SameRouteDuel` | First-vs-best attempt on a chosen route. Ringed bar = PR. Needs ≥2 runs on a route. |
| `WeekComparator` | Week-over-week mix + totals. |
| `SeasonArc` | Year-over-year season comparison. |

Panel boundaries: `RunCards` is the **interactive deep-dive for a single run**; every other panel shows aggregate/trend data. Don't duplicate cohort-comparison logic outside `RunCards`.

Each panel is wrapped in a `PanelErrorBoundary` in `Dashboard.jsx` — one panel crashing doesn't take the page down.

## Theming

Five palettes (`editorial`, `editorial_dark`, `telemetry`, `fieldbook`, `dataart`) defined in `lib/theme.js`. `applyTheme(style)` writes `--bg`, `--ink`, `--accent`, `--type-easy`, etc. onto `<html>` and sets `data-theme` + `data-style`. **Every component reads CSS vars** — no hard-coded colors. If you're adding UI, use `var(--ink)` / `var(--accent)` / `var(--type-{kind})` etc.

Fonts are loaded in `app/layout.jsx`. Don't add new families unless you also wire them into a palette.

The **View panel** (`components/TweakPanel.jsx`, FAB bottom-right) exposes Visual style + Time range + Units. Metric used to live here — it was removed because PaceRibbon has its own toggle. Don't add it back.

## Conventions & gotchas

- **Copy style**: user-facing strings avoid em-dashes (they "look AI-generated"). Use periods or commas. Also avoid framing the app as a "journal" — the pitch is "see your progress over time." Dashboard eyebrow is "Your Running Progress · v1".
- **Server vs client**: route pages under `app/` are server components by default. `components/Dashboard.jsx` is `'use client'` and all panels are client components. Don't try to import server-only modules (`lib/session`, `lib/strava`) into client code.
- **Data shape is king**: if you need a new field per run, add it in `summaryToRun` **and** in `scripts/ingest.mjs`'s FIT/TCX/GPX branches, then surface it through `buildStrideData`. Mismatched fields between the two ingest paths cause panels to silently break for one mode.
- **Dates are ISO `YYYY-MM-DD` strings** everywhere in the data layer. Compare with `localeCompare`; construct `Date` via `new Date(iso + 'T00:00:00')` to avoid UTC-drift off-by-ones.
- **Routes** are clustered by start GPS + distance similarity (≤500m + ≤15% distance). `indoor` is a reserved routeId for treadmill runs (no GPS).
- **PR flags** are post-processed two-pass in `buildStrideData`: the *actual best* gets the flag, not the first seen. Don't "stream" PR detection.
- **In-memory cache** (`/app/page.jsx`): 1h TTL per athlete, lives in a module-scoped `Map`. Resets on serverless cold-start — that's the design, not a bug. If you need cache invalidation, the user can hit `/api/runs`.
- **Session** is an iron-session encrypted cookie (`stride_session`, 30-day rolling). No users table exists. Tokens auto-refresh in `withFreshToken` during API-route handling; server components can't refresh (can't mutate cookies), so if `session.expiresAt` is near-expiry they bail and the page shows a reconnect message.

## Env vars

See `.env.example`. Required for the live-Strava path: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `SESSION_SECRET` (≥32 chars), `PUBLIC_APP_URL`. Without `SESSION_SECRET` the app still runs in demo-only mode — `getSession()` returns a no-op stub.

Production domain is `stride.letizia.tech`. Strava's "Authorization Callback Domain" is set to the host only (no protocol, no path); `STRAVA_REDIRECT_URI` is the full `https://stride.letizia.tech/api/auth/strava/callback`.

## When editing

- Prefer editing existing panels over adding new ones.
- Don't change internal type keys (`tempo`, `intervals`) — too much depends on them. Change `TYPE_META[k].label` instead.
- Don't add a metric toggle outside PaceRibbon.
- If adding cross-panel navigation from a new element: use `requestFocus`, tag with `data-tap-focus`, respect the two-tap return value.
- UI changes need a browser check (mobile + desktop). `npm run build` only proves code compiles.
