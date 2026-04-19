// Strava API client. Just the surface we need: OAuth token dance + list
// athlete activities + fetch athlete profile. No SDK dep — plain fetch.
//
// https://developers.strava.com/docs/reference/

const STRAVA_AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Build the authorize URL the user is redirected to for consent.
// `state` is verified in the callback to protect against CSRF.
export function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: env('STRAVA_CLIENT_ID'),
    redirect_uri: env('STRAVA_REDIRECT_URI'),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return `${STRAVA_AUTHORIZE}?${params.toString()}`;
}

// Exchange the one-time `code` from the callback for long-lived tokens.
// Returns { accessToken, refreshToken, expiresAt, athlete }.
export async function exchangeCodeForToken(code) {
  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Strava token exchange failed: ${res.status} ${body}`);
  }
  const j = await res.json();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: j.expires_at * 1000, // ms
    athlete: j.athlete, // contains id, firstname, lastname, city, ...
  };
}

// Refresh an expired (or nearly-expired) access token.
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('STRAVA_CLIENT_ID'),
      client_secret: env('STRAVA_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Strava token refresh failed: ${res.status} ${body}`);
  }
  const j = await res.json();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token, // Strava may rotate the refresh token too
    expiresAt: j.expires_at * 1000,
  };
}

// Returns a valid access token, refreshing in-place if the session's one is
// within 60s of expiry. Mutates `session` so the caller can save it back.
export async function withFreshToken(session) {
  const now = Date.now();
  if (!session.accessToken) throw new Error('No access token in session');
  if (session.expiresAt && session.expiresAt - now > 60_000) {
    return session.accessToken;
  }
  const fresh = await refreshAccessToken(session.refreshToken);
  session.accessToken = fresh.accessToken;
  session.refreshToken = fresh.refreshToken;
  session.expiresAt = fresh.expiresAt;
  return fresh.accessToken;
}

// List the athlete's activities (newest first). Strava max is per_page=200.
// `before` / `after` are unix-seconds filters; we pass neither by default.
export async function fetchActivities(accessToken, { page = 1, perPage = 200 } = {}) {
  const url = `${STRAVA_API}/athlete/activities?page=${page}&per_page=${perPage}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Strava fetchActivities failed: ${res.status} ${body}`);
  }
  return res.json();
}

// Fetch the logged-in athlete's public profile.
export async function fetchAthlete(accessToken) {
  const res = await fetch(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Strava fetchAthlete failed: ${res.status} ${body}`);
  }
  return res.json();
}
