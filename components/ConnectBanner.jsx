'use client';

// Horizontal banner sitting above the header. Three states:
//   demo — "you're viewing a sample dataset, connect your own Strava"
//   user — "signed in as <name>, disconnect"
//   thin — "you have N runs, the dashboard works best with ~20+"

export default function ConnectBanner({ mode, athleteName, runCount }) {
  if (mode === 'thin') {
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', marginBottom: 18, gap: 12, flexWrap: 'wrap',
        background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)', borderRadius: 4,
        fontSize: 12.5,
      }}>
        <span>
          <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', marginRight: 8 }}>
            Thin history
          </span>
          <span style={{ color: 'var(--inkSoft)' }}>
            <b>{runCount}</b> run{runCount === 1 ? '' : 's'} in your window. The dashboard reads best with <b>~20 runs or more</b>; some panels will look sparse until you log a few more.
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
          You&rsquo;re viewing a sample dataset. Connect your own Strava to see your dashboard.
        </span>
      </span>
      <a
        href="/api/auth/strava"
        className="connect-strava-btn"
        aria-label="Connect with Strava"
        style={{ flexShrink: 0 }}
      >
        <img
          src="/strava-logos/connect-with-strava-orange.svg"
          srcSet="/strava-logos/connect-with-strava-orange.svg 1x, /strava-logos/connect-with-strava-orange-x2.svg 2x"
          alt="Connect with Strava"
          style={{ height: 30, width: 'auto', display: 'block' }}
        />
      </a>
    </div>
  );
}
