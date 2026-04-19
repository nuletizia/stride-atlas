// GET /api/auth/strava/callback — OAuth redirect target.
// Verifies `state`, exchanges `code` for tokens, stores tokens in the
// session, and sends the user back to `/`.

import { NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/strava';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const session = await getSession();
  const expectedState = session.state;

  // Regardless of outcome, the state nonce is single-use.
  delete session.state;

  const base = process.env.PUBLIC_APP_URL || url.origin;

  if (error) {
    await session.save();
    return NextResponse.redirect(`${base}/?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || state !== expectedState) {
    await session.save();
    return NextResponse.redirect(`${base}/?auth_error=invalid_state`);
  }

  try {
    const { accessToken, refreshToken, expiresAt, athlete } =
      await exchangeCodeForToken(code);

    session.athleteId = athlete.id;
    session.athleteName = [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || athlete.username || 'Runner';
    session.athleteCity = athlete.city || '';
    session.accessToken = accessToken;
    session.refreshToken = refreshToken;
    session.expiresAt = expiresAt;
    await session.save();
  } catch (e) {
    console.error('Strava callback error:', e);
    await session.save();
    return NextResponse.redirect(`${base}/?auth_error=exchange_failed`);
  }

  return NextResponse.redirect(base + '/');
}
