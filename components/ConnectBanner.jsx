'use client';

// Horizontal banner sitting above the header. Two states:
//   demo — "you're viewing Alex's data, connect your own Strava"
//   user — "signed in as <name>, disconnect"

export default function ConnectBanner({ mode, athleteName }) {
  if (mode === 'user') {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', marginBottom: 18,
        background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)', borderRadius: 4,
        fontSize: 12.5,
      }}>
        <span>
          <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 8 }}>
            Signed in
          </span>
          <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14 }}>
            {athleteName || 'Runner'}
          </span>
        </span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="chip" style={{ cursor: 'pointer' }}>
            Disconnect
          </button>
        </form>
      </div>
    );
  }

  // demo
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', marginBottom: 18,
      background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)', borderRadius: 4,
      fontSize: 12.5, gap: 12, flexWrap: 'wrap',
    }}>
      <span>
        <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 8 }}>
          Demo
        </span>
        <span style={{ color: 'var(--inkSoft)' }}>
          You&rsquo;re viewing a sample dataset — connect your own Strava to see your dashboard.
        </span>
      </span>
      <a
        href="/api/auth/strava"
        className="chip active"
        style={{ textDecoration: 'none', cursor: 'pointer' }}
      >
        Connect with Strava ↗
      </a>
    </div>
  );
}
