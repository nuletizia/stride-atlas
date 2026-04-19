// iron-session wrapper. Encrypted + signed cookie; no DB needed for tokens.
//
// Session shape:
//   athleteId:    number
//   athleteName:  string
//   athleteCity:  string
//   accessToken:  string
//   refreshToken: string
//   expiresAt:    number (unix ms)
//   state:        string  (OAuth CSRF nonce; set during /api/auth/strava, cleared in callback)

import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'stride_session';

export function isSessionConfigured() {
  const s = process.env.SESSION_SECRET;
  return typeof s === 'string' && s.length >= 32;
}

function sessionOptions() {
  return {
    password: process.env.SESSION_SECRET,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    },
  };
}

// Read/write the session. `iron-session` mutates the returned object and
// persists it to the cookie on save(). If SESSION_SECRET isn't set (local
// dev before Strava is configured), returns a stub so the rest of the code
// can treat the session as empty without every caller having to branch.
export async function getSession() {
  if (!isSessionConfigured()) return emptyStub();
  const cookieStore = await cookies();
  return getIronSession(cookieStore, sessionOptions());
}

export async function clearSession() {
  if (!isSessionConfigured()) return;
  const s = await getSession();
  s.destroy();
}

export function isLoggedIn(session) {
  return !!(session && session.athleteId && session.accessToken);
}

function emptyStub() {
  return {
    async save() {},
    destroy() {},
  };
}
