'use client';

// Client-side loader for the real-user dashboard. The `/app` server
// component can't refresh Strava tokens (Server Components can't write
// cookies), so instead of fetching there we render this and pull from
// `/api/runs` — a Route Handler that DOES refresh + persist tokens via
// `withFreshToken` + `session.save()`. That keeps the user logged in for
// the full 30-day session life instead of forcing a reconnect every time
// the 6 h Strava access token expires.
//
// As a bonus this makes the live run data live client-side, which is where
// user-specific, persisted choices (e.g. excluding runs from the graphs)
// will be applied without ever refetching from Strava.

import { useEffect, useState } from 'react';
import Dashboard from './Dashboard';

const STATES = { LOADING: 'loading', READY: 'ready', ERROR: 'error' };

function Shell({ children }) {
  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="eyebrow">Your running progress · v1</div>
          <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
        </div>
      </div>
      {children}
    </div>
  );
}

// Animated ellipsis so the loading screen visibly "breathes" — a static
// "…" reads as frozen, which made people hit Disconnect a few seconds in.
// We cycle 1→2→3 dots and pad the rest with hidden dots so the title never
// shifts width as it animates.
function LoadingDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v % 3) + 1), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden="true">
      {'.'.repeat(n)}
      <span style={{ visibility: 'hidden' }}>{'.'.repeat(3 - n)}</span>
    </span>
  );
}

function Notice({ title, body, showDemo = false }) {
  return (
    <Shell>
      <div className="panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, marginBottom: 12 }}>
          {title}
        </div>
        <div style={{ color: 'var(--inkSoft)', maxWidth: 520, margin: '0 auto' }}>
          {body}
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {showDemo && (
            <a href="/demo" className="chip active" style={{ textDecoration: 'none' }}>See the demo →</a>
          )}
          <form action="/api/auth/logout" method="POST" style={{ display: 'inline' }}>
            <button type="submit" className="chip" style={{ cursor: 'pointer' }}>
              Disconnect
            </button>
          </form>
        </div>
      </div>
    </Shell>
  );
}

export default function UserDashboardLoader({ athleteName = null }) {
  const [state, setState] = useState(STATES.LOADING);
  const [data, setData] = useState(null);
  // Categorize failures the same way the old server component did, so the
  // user sees an actionable message rather than a generic error.
  const [errKind, setErrKind] = useState(null); // 'rate' | 'auth' | 'fetch'

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/runs', { headers: { Accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          const msg = String(body?.error || '');
          if (res.status === 401) setErrKind('auth');
          else if (res.status === 429 || /429|rate/i.test(msg)) setErrKind('rate');
          // A failed token refresh (revoked/expired refresh token) comes back
          // as a 502 from /api/runs — treat it as "reconnect", not a generic
          // error, since disconnecting + reconnecting is the actual fix.
          else if (/401|403|unauthor|refresh/i.test(msg)) setErrKind('auth');
          else setErrKind('fetch');
          setState(STATES.ERROR);
          return;
        }

        setData(body);
        setState(STATES.READY);
      } catch {
        if (cancelled) return;
        setErrKind('fetch');
        setState(STATES.ERROR);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (state === STATES.LOADING) {
    return (
      <Notice
        title={<>Loading your runs from Strava<LoadingDots /></>}
        body="This can take a few seconds while we pull your latest activities. Hang tight."
      />
    );
  }

  if (state === STATES.ERROR) {
    if (errKind === 'rate') {
      return (
        <Notice
          title="Strava is busy right now."
          body="We're being rate-limited by the Strava API. Wait a minute and refresh; the rest should come back normally."
        />
      );
    }
    if (errKind === 'auth') {
      return (
        <Notice
          title="Your Strava connection expired."
          body="Disconnect and connect again to refresh your tokens."
        />
      );
    }
    return (
      <Notice
        title="Couldn't load your runs from Strava."
        body="Something went wrong between here and Strava. Try reloading; if it keeps failing, disconnect and connect again."
        showDemo
      />
    );
  }

  // Authed and fetched, but the account has no runs yet.
  if (!data || !data.runs?.length) {
    return (
      <Notice
        title="No runs yet on your Strava account."
        body="Log a few runs on Strava, then refresh this page. Or explore the demo dashboard to see how it looks."
        showDemo
      />
    );
  }

  return <Dashboard data={data} mode="user" athleteName={athleteName} />;
}
