import Link from 'next/link';

export const metadata = {
  title: 'Privacy · Stride Atlas',
  description: 'What Stride Atlas stores, where, and for how long.',
};

// Plain-English privacy policy reflecting how the app actually handles
// data: no server DB for activities, in-memory cache only, localStorage
// for client-side preferences, encrypted session cookie for Strava tokens.
// Keep the copy honest and specific. If behaviour changes, update here.
export default function PrivacyPage() {
  return (
    <div className="app landing">
      <header className="landing-nav">
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div>
            <div className="eyebrow">A Running Journal · v1</div>
            <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
          </div>
        </Link>
        <nav className="landing-nav-links">
          <Link href="/demo">Demo</Link>
          <Link href="/app">Dashboard</Link>
        </nav>
      </header>

      <article className="privacy">
        <h1>Privacy</h1>
        <p className="privacy-lede">
          Stride Atlas is a personal dashboard for your Strava runs. It&rsquo;s built to keep
          your data close to you — there&rsquo;s no database of activities on our side, no
          email list, no third-party sharing beyond what&rsquo;s strictly required to make
          the app work. This page spells out exactly what that means.
        </p>

        <div className="privacy-meta">
          Last updated: <b>April 2026</b>
        </div>

        <h2>What we collect</h2>
        <p>
          When you click <b>Connect with Strava</b>, Strava redirects you back to us with a
          short-lived access token and a long-lived refresh token. We also receive your
          Strava athlete profile (your name, city, and athlete ID) and your run activities
          (date, distance, pace, duration, heart rate, elevation, route name — the same
          data Strava shows you on its own dashboard).
        </p>
        <p>We do <b>not</b> collect:</p>
        <ul>
          <li>Your email address (Strava doesn&rsquo;t share it with us, and we don&rsquo;t ask).</li>
          <li>GPS traces (we read summaries only; individual lat/lng points are never requested).</li>
          <li>Any activity type other than runs.</li>
          <li>Anything from you while you&rsquo;re using the site beyond the setting choices you make in the View panel.</li>
        </ul>

        <h2>Where it&rsquo;s stored</h2>
        <p>
          Your Strava access and refresh tokens live in an <b>encrypted session cookie</b>{' '}
          (iron-session) that the browser sends back to our server on each request. The
          cookie is HTTP-only, SameSite=Lax, and Secure in production. It expires after
          30 days of inactivity. We do not have a database of users — if the cookie is
          cleared, there&rsquo;s nothing on our side to reconstruct.
        </p>
        <p>
          Your run activities are fetched from Strava on demand and held in a{' '}
          <b>per-athlete in-memory cache</b> for up to one hour, so the dashboard loads
          quickly without re-hitting Strava&rsquo;s API on every navigation. This cache lives
          in the server process — when the process restarts (which Vercel does regularly
          on serverless functions), the cache is gone.
        </p>
        <p>
          Your preferences — theme, km/mi, time range, custom date range, HR max
          override — live in your browser&rsquo;s <b>localStorage</b>. They never leave your
          device.
        </p>

        <h2>Third parties</h2>
        <ul>
          <li>
            <b>Strava.</b> The whole point. Your Strava account is authenticated via
            OAuth 2.0; the app reads activities using the permissions you grant. You can
            revoke Stride Atlas&rsquo;s access at any time from{' '}
            <a href="https://www.strava.com/settings/apps" target="_blank" rel="noreferrer">
              your Strava account settings
            </a>.
          </li>
          <li>
            <b>Vercel Analytics.</b> We track anonymous page views (route visited, country,
            referrer) to see roughly how the site is being used. No IP addresses or
            fingerprints are associated with individual users. Vercel&rsquo;s{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">
              privacy policy
            </a>{' '}
            covers what they do with that data.
          </li>
          <li>
            <b>Vercel hosting.</b> The site runs on Vercel&rsquo;s edge/serverless infrastructure.
            Standard request logs (IP, timestamp, URL, response time) are retained by
            Vercel per their policy; we don&rsquo;t read or store them ourselves.
          </li>
        </ul>
        <p>
          That&rsquo;s the entire third-party list. No ad networks, no marketing pixels, no
          session-replay tools.
        </p>

        <h2>Cookies</h2>
        <p>
          One session cookie: <code>stride_session</code>, used only for authentication.
          No tracking cookies. Vercel Analytics is cookieless by default.
        </p>

        <h2>Your rights</h2>
        <ul>
          <li>
            <b>Disconnect.</b> Use the Disconnect button in the authed dashboard, or
            revoke Stride Atlas from your{' '}
            <a href="https://www.strava.com/settings/apps" target="_blank" rel="noreferrer">
              Strava app settings
            </a>. Either one clears our ability to reach your data.
          </li>
          <li>
            <b>Access / export.</b> You already have all of this — it&rsquo;s your data on
            Strava. Strava itself provides a bulk export of your activities under{' '}
            <i>Account → Download or Delete Your Account</i>.
          </li>
          <li>
            <b>Delete.</b> There&rsquo;s nothing persistent to delete on our side. Disconnecting
            and clearing your browser&rsquo;s cookies/localStorage for this site removes
            every trace locally.
          </li>
        </ul>

        <h2>Changes</h2>
        <p>
          If this policy changes in a way that affects what we collect or how we use it,
          the <b>Last updated</b> date above will change, and the home page will surface
          a small note for at least a week. If you&rsquo;re disconnected at that point, you
          won&rsquo;t be affected anyway — there&rsquo;s nothing to change retroactively.
        </p>

        <h2>Contact</h2>
        <p>
          Questions, or something here that doesn&rsquo;t match what you&rsquo;re seeing? Email{' '}
          <a href="mailto:na@letizia.tech">na@letizia.tech</a>.
          {/*
            TODO (before launch): replace with your real contact address.
            Strava API guidelines require a working contact for privacy concerns.
          */}
        </p>
      </article>

      <footer className="landing-footer">
        <img
          src="/strava-logos/powered-by-strava-horiz-orange.svg"
          alt="Powered by Strava"
          style={{ height: 22, width: 'auto' }}
        />
        <nav className="landing-footer-links">
          <Link href="/">Home</Link>
          <Link href="/demo">Demo</Link>
        </nav>
      </footer>
    </div>
  );
}
