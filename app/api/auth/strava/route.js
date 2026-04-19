// GET /api/auth/strava — initiate the Strava OAuth flow.
// Generates a random `state` (CSRF nonce), stores it in the session cookie,
// and 302s to the Strava authorize URL.

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildAuthorizeUrl } from '@/lib/strava';
import { getSession, isSessionConfigured } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSessionConfigured() || !process.env.STRAVA_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Strava OAuth not configured. See SETUP.md.' },
      { status: 503 }
    );
  }
  const session = await getSession();
  const state = crypto.randomBytes(16).toString('hex');
  session.state = state;
  await session.save();
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
