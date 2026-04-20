import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, isLoggedIn } from '@/lib/session';
import HeroRibbonPreview from '@/components/HeroRibbonPreview';

export const metadata = {
  title: 'Stride Atlas — See your running progress',
  description: 'A compact progress view of your Strava runs. Aerobic base, tempo pace, long runs, PRs — all on one page. Built for runners training toward a goal.',
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
          See your progress.<br />Not just your last run.
        </h1>
        <p className="landing-subhead">
          Training for a half marathon, chasing a 5K PR, or just curious whether you&rsquo;re
          actually getting fitter? Most apps show you what you did yesterday. Stride Atlas
          shows you the <i>arc</i> of your training — every run, every PR, every trend —
          on one compact page you can take in at a glance.
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
        <HeroRibbonPreview />
      </section>

      <section className="landing-features">
        <FeatureCard
          title="Progress at every scale"
          body="From season arcs down to individual runs. See whether your aerobic base is growing, your tempo pace is inching down, or your long runs are holding shape — all on one page."
        />
        <FeatureCard
          title="Goal-aware comparisons"
          body="Every run is placed against its peers — same workout type, similar distance, same effort band. No vague vibes: you know instantly whether today was a PR, a regression, or just another Tuesday."
        />
        <FeatureCard
          title="Dense, not noisy"
          body="Nine panels tuned to what runners actually track: pace bands, aerobic efficiency, PR distances, season totals. No feed, no kudos, no timeline — just the signal."
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
