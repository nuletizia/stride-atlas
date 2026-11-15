// GET /api/runs — fetch the logged-in athlete's activities from Strava,
// transform them into the STRIDE_DATA shape, cache in-memory for 1 h.
//
// For the summary-mode MVP we only hit /athlete/activities (every page, all
// activity types; runs are filtered out below). `bestSplits` + `zones`
// stay null until streams are added.

import { NextResponse } from 'next/server';
import { getSession, isLoggedIn } from '@/lib/session';
import { withFreshToken, fetchAllActivities, fetchAthlete } from '@/lib/strava';
import { summaryToRun, buildStrideData, estimateHrMax } from '@/lib/ingest-runtime';
import { getCachedRuns, setCachedRuns } from '@/lib/runs-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await getSession();
  if (!isLoggedIn(session)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';

  if (!force) {
    const hit = getCachedRuns(session.athleteId);
    if (hit) return NextResponse.json(hit);
  }

  try {
    const accessToken = await withFreshToken(session);
    // Persist refreshed tokens if withFreshToken rotated them.
    await session.save();

    // Fetch athlete (profile) + full activity history.
    const [athlete, activities] = await Promise.all([
      fetchAthlete(accessToken),
      fetchAllActivities(accessToken),
    ]);

    const runActivities = (activities || [])
      .filter((a) => a?.type === 'Run' || a?.sport_type === 'Run');
    const hrMax = estimateHrMax(runActivities.map((a) => a.max_heartrate));
    const runs = runActivities
      .map((a) => summaryToRun(a, { hrMax }))
      .filter(Boolean);

    const data = buildStrideData(runs, athlete, { hrMax });
    setCachedRuns(session.athleteId, data);
    return NextResponse.json(data);
  } catch (e) {
    console.error('/api/runs error:', e);
    return NextResponse.json({ error: e.message || 'Fetch failed' }, { status: 502 });
  }
}
