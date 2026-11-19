import Link from 'next/link';
import { REPO_URL } from '@/lib/site';

// Shared chrome for the plain text pages (privacy, terms, support,
// disconnected). Server component: no hooks, no client state.

export function FooterLinks() {
  return (
    <nav className="landing-footer-links">
      <Link href="/support">Support</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
    </nav>
  );
}

export function PoweredByStrava({ height = 22 }) {
  return (
    <img
      src="/strava-logos/powered-by-strava-horiz-orange.svg"
      alt="Powered by Strava"
      height={height}
      style={{ height, width: 'auto' }}
    />
  );
}

export default function LegalPage({ title, updated, lede, children }) {
  return (
    <div className="app landing">
      <header className="landing-nav">
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div>
            <div className="eyebrow">Your Running Progress · v1</div>
            <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
          </div>
        </Link>
        <nav className="landing-nav-links">
          <Link href="/demo">Demo</Link>
          <Link href="/app">Dashboard</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <article className="privacy">
        <h1>{title}</h1>
        {lede && <p className="privacy-lede">{lede}</p>}
        {updated && (
          <div className="privacy-meta">
            Last updated: <b>{updated}</b>
          </div>
        )}
        {children}
      </article>

      <footer className="landing-footer">
        <PoweredByStrava />
        <FooterLinks />
      </footer>
    </div>
  );
}
