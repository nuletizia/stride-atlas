// POST /api/auth/logout — Disconnect.
// 1. Revoke the app at Strava (invalidates all our tokens for this athlete).
// 2. Evict the athlete's cached activities from this server instance.
// 3. Destroy the session cookie.
// Then redirect to /disconnected, which is the written confirmation that
// Strava's API Policy (2.5, 7.4) asks for.
// (GET is also accepted for easy testing via browser nav.)

import { NextResponse } from 'next/server';
import { getSession, isLoggedIn, clearSession } from '@/lib/session';
import { withFreshToken, deauthorize } from '@/lib/strava';
import { evictCachedRuns } from '@/lib/runs-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request) {
  const session = await getSession();
  let revoked = false;
  if (isLoggedIn(session)) {
    evictCachedRuns(session.athleteId);
    try {
      await deauthorize(await withFreshToken(session));
      revoked = true;
    } catch (e) {
      // Token already revoked or expired: Strava access is gone either way,
      // but tell the user so they can double-check in their Strava settings.
      console.error('deauthorize failed:', e.message);
    }
  }
  await clearSession();
  const base = process.env.PUBLIC_APP_URL || request.url;
  // 303 so the browser follows a POST with a GET.
  return NextResponse.redirect(new URL(`/disconnected${revoked ? '' : '?revoked=0'}`, base), 303);
}

export const GET = handle;
export const POST = handle;
