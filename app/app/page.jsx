import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import { getSession, isLoggedIn } from '@/lib/session';
import { fetchActivities, fetchAthlete } from '@/lib/strava';
import { summaryToRun, buildStrideData, estimateHrMax } from '@/lib/ingest-runtime';

export const metadata = {
  title: 'Dashboard · Stride Atlas',
  description: 'Your Strava runs, annotated.',
};

// In-memory per-athlete cache so re-renders don't refetch from Strava on
// every request. Lives in the module; reset on serverless cold-start.
const CACHE_TTL_MS = 60 * 60 * 1000;
const userCache = new Map();

// Fetch the user's activities. Uses the stored access token directly —
// Server Components can't mutate cookies, so refresh lives in /api/runs
// (which IS a route handler). If the stored token is close to expiry we
// return null, letting the page fall back to a reconnect hint.
async function loadUserData(session) {
  const hit = userCache.get(session.athleteId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  if (!session.accessToken) return null;
  // Strava access tokens live 6 h. If we're within 60 s of expiry we bail
  // rather than risk a 401 mid-render. User clicks Connect again → Strava
  // auto-approves (app is already authorized) → fresh tokens.
  if (session.expiresAt && session.expiresAt < Date.now() + 60_000) return null;

  const [athlete, activities] = await Promise.all([
    fetchAthlete(session.accessToken),
    fetchActivities(session.accessToken, { page: 1, perPage: 200 }),
  ]);

  const runActivities = (activities || [])
    .filter((a) => a?.type === 'Run' || a?.sport_type === 'Run');
  const hrMax = estimateHrMax(runActivities.map((a) => a.max_heartrate));
  const runs = runActivities
    .map((a) => summaryToRun(a, { hrMax }))
    .filter(Boolean);

  const data = buildStrideData(runs, athlete, { hrMax });
  userCache.set(session.athleteId, { data, fetchedAt: Date.now() });
  return data;
}

export default async function AppPage() {
  const session = await getSession();

  // Unauthed visitors are redirected to the landing page, per the
  // agreed-upon routing: / is always landing, /app is always dashboard.
  if (!isLoggedIn(session)) redirect('/');

  let fetchError = null;
  let data = null;
  try {
    data = await loadUserData(session);
  } catch (e) {
    console.error('Failed to load user data:', e);
    fetchError = e;
  }

  if (data && data.runs?.length) {
    return <Dashboard data={data} mode="user" athleteName={session.athleteName} />;
  }

  // Authed, but something went wrong or the user has zero runs.
  // Two outcomes share one screen — the message adapts to the cause.
  const isRateLimited = fetchError && /429|rate/i.test(String(fetchError?.message || ''));
  const hadAuthError = fetchError && /401|403|unauthor/i.test(String(fetchError?.message || ''));

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="eyebrow">Your running progress · v1</div>
          <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
        </div>
      </div>
      <div className="panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, marginBottom: 12 }}>
          {isRateLimited
            ? 'Strava is busy right now.'
            : hadAuthError
              ? 'Your Strava connection expired.'
              : fetchError
                ? 'Couldn\u2019t load your runs from Strava.'
                : 'No runs yet on your Strava account.'}
        </div>
        <div style={{ color: 'var(--inkSoft)', maxWidth: 520, margin: '0 auto' }}>
          {isRateLimited
            ? 'We\u2019re being rate-limited by the Strava API. Wait a minute and refresh; the rest should come back normally.'
            : hadAuthError
              ? 'Disconnect and connect again to refresh your tokens.'
              : fetchError
                ? 'Something went wrong between here and Strava. Try reloading; if it keeps failing, disconnect and connect again.'
                : 'Log a few runs on Strava, then refresh this page. Or explore the demo dashboard to see how it looks.'}
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!fetchError && (
            <a href="/demo" className="chip active" style={{ textDecoration: 'none' }}>See the demo →</a>
          )}
          <form action="/api/auth/logout" method="POST" style={{ display: 'inline' }}>
            <button type="submit" className="chip" style={{ cursor: 'pointer' }}>
              Disconnect
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
