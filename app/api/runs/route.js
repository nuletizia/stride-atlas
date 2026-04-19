// GET /api/runs — fetch the logged-in athlete's activities from Strava,
// transform them into the STRIDE_DATA shape, cache in-memory for 1 h.
//
// For the summary-mode MVP we only hit /athlete/activities (one page, 200
// activities). `bestSplits` + `zones` stay null until streams are added.

import { NextResponse } from 'next/server';
import { getSession, isLoggedIn } from '@/lib/session';
import { withFreshToken, fetchActivities, fetchAthlete } from '@/lib/strava';
import { summaryToRun, buildStrideData, estimateHrMax } from '@/lib/ingest-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Module-scoped cache. Survives between requests on the same warm instance.
// Cold starts throw it away; that's fine for MVP.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map(); // athleteId -> { data, fetchedAt }

function cached(athleteId) {
  const hit = cache.get(athleteId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) return null;
  return hit.data;
}

export async function GET(request) {
  const session = await getSession();
  if (!isLoggedIn(session)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';

  if (!force) {
    const hit = cached(session.athleteId);
    if (hit) return NextResponse.json(hit);
  }

  try {
    const accessToken = await withFreshToken(session);
    // Persist refreshed tokens if withFreshToken rotated them.
    await session.save();

    // Fetch athlete (profile) + activities (first page of 200).
    const [athlete, activities] = await Promise.all([
      fetchAthlete(accessToken),
      fetchActivities(accessToken, { page: 1, perPage: 200 }),
    ]);

    const runActivities = (activities || [])
      .filter((a) => a?.type === 'Run' || a?.sport_type === 'Run');
    const hrMax = estimateHrMax(runActivities.map((a) => a.max_heartrate));
    const runs = runActivities
      .map((a) => summaryToRun(a, { hrMax }))
      .filter(Boolean);

    const data = buildStrideData(runs, athlete, { hrMax });
    cache.set(session.athleteId, { data, fetchedAt: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    console.error('/api/runs error:', e);
    return NextResponse.json({ error: e.message || 'Fetch failed' }, { status: 502 });
  }
}
