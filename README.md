# Stride Atlas

A compact, editorial-styled running dashboard that tells the progress story across 9 panels — calendar overview, pace trends per workout type, aerobic efficiency, distance × pace curve, personal records, run cards, same-route duels, week comparator, and year-over-year arc.

Built on Next.js. Feeds from two sources:

- **Local ingest** — drop a Strava export into `activities/strava/` and run `npm run ingest`. Useful for first-time setup and development.
- **Strava OAuth** — visitors click "Connect with Strava" and see their own dashboard rendered from Strava's API. (Summary-mode MVP; Personal Records PRs require per-activity streams and are gated.)

## Quickstart (local, with your own Strava export)

```bash
npm install
# Drop your Strava export zip contents into activities/strava/
#   (activities.csv + activities/*.fit.gz / *.tcx.gz / *.gpx.gz)
npm run ingest     # parses your files → data/runs.json
npm run dev        # http://localhost:3000
```

See [`SETUP.md`](./SETUP.md) for full ingest options (HR_MAX tuning, reverse-geocoded route names, manual route renames) and the Strava OAuth setup.

## Architecture at a glance

```
app/
  page.jsx                  server component, session-aware; renders Dashboard
  layout.jsx                fonts, metadata
  globals.css               editorial/telemetry/fieldbook/dataart theme tokens
  api/
    auth/strava/            OAuth initiate + callback
    auth/logout/            clear session
    runs/                   fetch + transform Strava activities (cached 1h)
components/                 Dashboard + 9 panels
lib/
  shared.jsx                contexts, hooks, formatters
  theme.js                  palette + workout-type colors per style
  strava.js                 Strava API client (OAuth, activities)
  session.js                iron-session wrapper
  ingest-runtime.js         pure transforms shared by API route + offline script
scripts/
  ingest.mjs                offline: parses FIT/TCX/GPX → data/runs.json
data/
  runs.json                 committed demo dataset (the original author's data)
```

## Deploy (Vercel)

1. Push to a (private) GitHub repo. `git init && git add -A && git commit && git push`.
2. Import the repo on Vercel.
3. Set environment variables (see [`.env.example`](./.env.example)): `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `SESSION_SECRET`, `PUBLIC_APP_URL`.
4. Add your Vercel domain to the **Authorization Callback Domain** list on your Strava app settings (https://www.strava.com/settings/api).
5. Deploy.

## Credits

Design originated as a handoff from Claude Design (archived in `_design/` locally, not committed). Data pipeline and Strava integration built on top.
