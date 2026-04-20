import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, isLoggedIn } from '@/lib/session';

export const metadata = {
  title: 'Stride Atlas — A running journal',
  description: 'Connect your Strava and see your training as something you can read, not just scroll.',
};

export default async function LandingPage() {
  const session = await getSession();
  // Authed users skip the landing and go straight to the dashboard.
  if (isLoggedIn(session)) redirect('/app');

  return (
    <div className="app landing">
      <header className="landing-nav">
        <div>
          <div className="eyebrow">A Running Journal · v1</div>
          <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
        </div>
        <nav className="landing-nav-links">
          <Link href="/demo">Demo</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <h1 className="landing-headline">
          A running journal —<br />every run on one page.
        </h1>
        <p className="landing-subhead">
          Connect your Strava and see your training as something you can read, not just
          scroll. Hover any run, and its twins light up across every chart. Click to drill in.
        </p>
        <div className="landing-cta-row">
          <a href="/api/auth/strava" className="connect-strava-btn" aria-label="Connect with Strava">
            <img
              src="/strava-logos/connect-with-strava-orange.svg"
              srcSet="/strava-logos/connect-with-strava-orange.svg 1x, /strava-logos/connect-with-strava-orange-x2.svg 2x"
              alt="Connect with Strava"
              width={237}
              height={48}
            />
          </a>
          <Link href="/demo" className="landing-secondary-cta">See a live demo →</Link>
        </div>
      </section>

      <section className="landing-preview">
        <div className="landing-preview-caption">
          <div className="stat-label">Dashboard preview</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', marginTop: 4 }}>
            Nine panels — from a season arc down to individual run cards.
            Every one talks to every other.
          </div>
        </div>
        <div className="landing-preview-frame">
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--inkMuted)', fontSize: 15 }}>
            [Screenshot placeholder — drop a PNG of the dashboard at /public/preview.png]
          </div>
        </div>
      </section>

      <section className="landing-features">
        <FeatureCard
          title="Cross-panel linking"
          body="Hover any run — its twins light up on every chart. Click to jump straight to its card and its peers. The whole page talks to itself."
        />
        <FeatureCard
          title="Peer-relative context"
          body="Every card compares itself to a cohort of similar runs. Not your pace in isolation — your pace vs. what you've run before on similar days."
        />
        <FeatureCard
          title="Built for readers"
          body="Each panel ends in a plain-English takeaway. Chart trends condensed to a sentence you can read at a glance."
        />
      </section>

      <footer className="landing-footer">
        <img
          src="/strava-logos/powered-by-strava-horiz-orange.svg"
          alt="Powered by Strava"
          height={22}
          style={{ height: 22, width: 'auto' }}
        />
        <nav className="landing-footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/demo">Demo</Link>
        </nav>
      </footer>
    </div>
  );
}

function FeatureCard({ title, body }) {
  return (
    <div className="panel landing-feature">
      <div className="stat-label" style={{ marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--inkSoft)', lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}
