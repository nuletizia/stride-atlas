// GET /api/debug/strava-raw?n=3
// Dev-only introspection: returns the first `n` activities from Strava
// exactly as the API gives them, so you can see which fields are populated.
// Gated on NODE_ENV !== 'production' so it can never leak in production.

import { NextResponse } from 'next/server';
import { getSession, isLoggedIn } from '@/lib/session';
import { fetchActivities } from '@/lib/strava';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Disabled in production' }, { status: 404 });
  }
  const session = await getSession();
  if (!isLoggedIn(session)) {
    return NextResponse.json({ error: 'Not authenticated — visit /api/auth/strava first' }, { status: 401 });
  }
  const n = Number(new URL(request.url).searchParams.get('n')) || 3;
  try {
    const activities = await fetchActivities(session.accessToken, { page: 1, perPage: n });
    return NextResponse.json(activities, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
