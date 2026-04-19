# Stride Atlas — Your Running Dashboard

A Next.js port of the Stride Atlas design. Two modes:

- **Offline (your own data, local)**: drop a Strava export into `activities/strava/`, run `npm run ingest` → `data/runs.json` → `npm run dev`.
- **Online (per-user via Strava OAuth)**: visitors sign in with Strava, the app fetches their activities live. See [Strava OAuth setup](#strava-oauth-integration) below.

## Workflow (offline mode)

### 1. Drop activities in `activities/`

Put `.fit` files there. Two ways to get them:

**Garmin (recommended — richest data):**
- Garmin Connect → open activity → gear menu → **Export Original** → `.fit` file
- Or bulk: https://www.garmin.com/en-US/account/datamanagement/exportdata/

**Strava:**
- Settings → My Account → **Download or Delete Your Account** → Download Request
- Unzip; the `activities/` folder inside contains `.fit`/`.gpx`/`.tcx`. Copy the `.fit` ones.
- Note: Strava may have re-encoded Garmin files; some power/dynamics fields can be missing.

### 2. Ingest

```bash
npm run ingest
```

This parses every `.fit` file into `data/runs.json`, deriving:
- Workout type (easy/tempo/long/intervals/race/recovery) from lap structure + HR + pace
- Route clusters (same start point within 300m + within 15% distance)
- HR zones (% time in Z1–Z5, based on HRmax config)
- PRs (best time per route+type combo)

Tune your HRmax so zones are right:
```bash
HR_MAX=188 PROFILE_NAME="Alex" PROFILE_CITY="Brooklyn" npm run ingest
```

All ingest env vars:
- `HR_MAX` — your true max HR (default 190)
- `PROFILE_NAME`, `PROFILE_CITY`, `PROFILE_SINCE`, `PROFILE_GOAL` — shown in the header
- `PROFILE_EMAIL` — contact email sent in the Nominatim `User-Agent` if geocoding is enabled
- `GEOCODE=1` — opt in to reverse-geocoding route start points (see below)

### Route names

After ingest, routes come out as `Route 1`, `Route 2`, … Two ways to make them useful:

1. **Reverse geocode (one-time, opt-in):**
   ```bash
   GEOCODE=1 PROFILE_EMAIL="you@example.com" npm run ingest
   ```
   Calls OpenStreetMap's free Nominatim API (~1 req/sec, rate-limited). Results are cached in `data/routes.cache.json` so subsequent ingests are fast. Names become e.g. `Runs near Prospect Park`.

2. **Manual overrides:** create `data/routes.local.json`:
   ```json
   {
     "route-1": "Central Park Loop",
     "route-6": "Riverside Out-and-Back",
     "indoor": "Treadmill"
   }
   ```
   Override names take precedence over geocoded names. Both files are git-ignored so personal location data never leaves your machine.

### Missing data (mixed devices)

If your export mixes Garmin (full data) and Amazfit / older devices (may skip HR):
- Runs without valid HR are stored as `hr: null` and excluded from Aerobic Efficiency / Pace Ribbon (HR mode) rather than plotted at zero.
- Tooltips and cards show `—` in place of `0 bpm`.

### 3. Run

```bash
npm run dev       # http://localhost:3000
npm run build     # production build
```

### 4. Deploy to Vercel

```bash
# First, make sure you want to commit your activities/data files or not.
# By default .gitignore excludes activities/ and data/runs.json.
# For Vercel, you'll want data/runs.json committed so it's available at build time.
# (The activities/ folder isn't needed at runtime — only the generated JSON.)

# Remove data/runs.json from .gitignore, commit it, and:
vercel
```

Alternatively, keep runs.json out of git and add a build step in Vercel that ingests at build time — but you'd need to ship your .fit files somewhere (private bucket, env-configured URL, etc.).

## What derives cleanly from the FIT file

| Design field | Source |
|---|---|
| `distance` | `session.totalDistance` ÷ 1000 |
| `pace` | `totalTimerTime` ÷ `totalDistance` (min/km) |
| `duration` | `totalTimerTime` ÷ 60 |
| `hr` | `session.avgHeartRate` |
| `elev` | `session.totalAscent` |
| `zones` | Walk `record` stream, bucket by `heartRate` ÷ HRmax |
| `date`/`dow` | `session.startTime` |
| `routeId` | Cluster by start GPS + distance similarity |
| `pr` | Post-process: best time per (route, type) |

## What requires inference

| Field | Why / How |
|---|---|
| `type` (workout kind) | FIT files don't label runs as "tempo" vs "easy" for free runs. Heuristic tree: long (>15km), recovery (<5.5km + low HR), intervals (short varied laps), tempo (high HR + moderate pace), race (very high HR + fast + ≥3km), else easy. Override via Strava workout labels if you want higher accuracy later. |
| Route names | Currently "Route 1", "Route 2", etc. You can rename them in `data/runs.json` after ingest. |
| `note` | FIT files don't reliably carry activity titles. Blank by default. |

## Re-ingesting

Every time you add a new `.fit` file to `activities/`, re-run `npm run ingest`. The dashboard will pick up `data/runs.json` on the next dev reload / build.

## Tweaks

Click the **Tweaks** pill bottom-right to switch visual style (Editorial / Editorial Dark / Telemetry / Field Notebook / Data-Art), time range, and primary metric. Settings persist in localStorage.

---

## Strava OAuth integration

The app can also fetch data live from Strava's API via OAuth. Each visitor signs in with Strava and sees **their own** dashboard.

### 1. Register a Strava app (1 minute)

1. Go to <https://www.strava.com/settings/api>.
2. Click **Create & Manage Your App**.
3. Fill in the form. For development, set **Authorization Callback Domain** to `localhost`. (Add your Vercel domain later for production.)
4. Save. Note your **Client ID** and **Client Secret**.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` (gitignored) and fill in:

```
STRAVA_CLIENT_ID=<your id>
STRAVA_CLIENT_SECRET=<your secret>
STRAVA_REDIRECT_URI=http://localhost:3000/api/auth/strava/callback
SESSION_SECRET=<openssl rand -hex 32>
PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run

```bash
npm run dev
```

Visit `http://localhost:3000`. You'll see the offline demo (if you've ingested data) with a **Connect with Strava** banner. Click it, approve the scope, and you're back on the dashboard with your own data.

### What works today (summary-mode MVP)

Fetching **summaries only** from Strava — no per-activity streams — already fills 8 of the 9 panels:

- Run Atlas · Pace Ribbon · Aerobic Efficiency (avg HR) · Distance × Pace · Run Cards · Same-Route Duel · Week Comparator · Season Arc

**Personal Records** shows a placeholder until streams are fetched — those require one extra API call per activity to compute rolling 1 km / 5 km / 10 km / HM / Marathon splits. Coming in Phase 2.

### Deploy to Vercel

1. Push the repo (private is fine) to GitHub and import it on Vercel.
2. Project Settings → Environment Variables: add the five variables above, using your production domain for `STRAVA_REDIRECT_URI` and `PUBLIC_APP_URL`.
3. Back on Strava's app settings, add your Vercel domain to **Authorization Callback Domain**.
4. Redeploy. Test the OAuth flow end-to-end.
