import fs from 'node:fs';
import path from 'node:path';
import Dashboard from '@/components/Dashboard';
import { getSession, isLoggedIn } from '@/lib/session';
import { withFreshToken, fetchActivities, fetchAthlete } from '@/lib/strava';
import { summaryToRun, buildStrideData } from '@/lib/ingest-runtime';

// Small in-memory cache so re-rendering doesn't refetch on every request.
// Same shape + TTL as /api/runs. Safe to share since it's server-only module state.
const CACHE_TTL_MS = 60 * 60 * 1000;
const userCache = new Map();

function loadDemoData() {
  const p = path.join(process.cwd(), 'data', 'runs.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function loadUserData(session) {
  const hit = userCache.get(session.athleteId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  const accessToken = await withFreshToken(session);
  await session.save(); // persist any rotated tokens

  const [athlete, activities] = await Promise.all([
    fetchAthlete(accessToken),
    fetchActivities(accessToken, { page: 1, perPage: 200 }),
  ]);

  const runs = (activities || [])
    .filter((a) => a?.type === 'Run' || a?.sport_type === 'Run')
    .map((a) => summaryToRun(a))
    .filter(Boolean);

  const data = buildStrideData(runs, athlete);
  userCache.set(session.athleteId, { data, fetchedAt: Date.now() });
  return data;
}

export default async function Page() {
  const session = await getSession();

  // Logged in → fetch their Strava data and render.
  if (isLoggedIn(session)) {
    try {
      const data = await loadUserData(session);
      if (data && data.runs?.length) {
        return <Dashboard data={data} mode="user" athleteName={session.athleteName} />;
      }
    } catch (e) {
      console.error('Failed to load user data:', e);
      // Fall through to demo with a visible error state later; for now we
      // just show demo data so the page still renders.
    }
  }

  // Demo mode (not logged in, or their fetch failed).
  const data = loadDemoData();
  if (!data || !data.runs?.length) {
    return (
      <div className="app">
        <div className="header">
          <div>
            <div className="eyebrow">A Running Journal · v1</div>
            <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
          </div>
        </div>
        <div className="panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, marginBottom: 12 }}>
            No runs yet.
          </div>
          <div style={{ color: 'var(--inkSoft)', maxWidth: 520, margin: '0 auto' }}>
            Drop Garmin/Strava <code>.fit</code> files into the <code>activities/</code> folder, then run:
          </div>
          <pre style={{
            display: 'inline-block', marginTop: 16, padding: '10px 16px',
            background: 'var(--bgSunken)', border: '1px solid var(--rule)',
            borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 12,
          }}>npm run ingest</pre>
          <div style={{ marginTop: 20 }}>
            <a href="/api/auth/strava" className="chip active" style={{ textDecoration: 'none' }}>
              Or connect with Strava ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard data={data} mode="demo" />;
}
