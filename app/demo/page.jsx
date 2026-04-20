import fs from 'node:fs';
import path from 'node:path';
import Dashboard from '@/components/Dashboard';

export const metadata = {
  title: 'Demo · Stride Atlas',
  description: 'Explore the Stride Atlas dashboard with sample data.',
};

function loadDemoData() {
  const p = path.join(process.cwd(), 'data', 'runs.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export default function DemoPage() {
  const data = loadDemoData();

  if (!data || !data.runs?.length) {
    return (
      <div className="app">
        <div className="header">
          <div>
            <div className="eyebrow">A Running Journal · v1</div>
            <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
          </div>
        </div>
        <div className="panel" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 22, marginBottom: 12 }}>
            Demo data not available.
          </div>
          <div style={{ color: 'var(--inkSoft)', maxWidth: 520, margin: '0 auto' }}>
            Connect your Strava account to see the full experience.
          </div>
          <div style={{ marginTop: 20 }}>
            <a href="/api/auth/strava" className="connect-strava-btn" aria-label="Connect with Strava">
              <img
                src="/strava-logos/connect-with-strava-orange.svg"
                srcSet="/strava-logos/connect-with-strava-orange.svg 1x, /strava-logos/connect-with-strava-orange-x2.svg 2x"
                alt="Connect with Strava"
                width={237}
                height={48}
              />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <Dashboard data={data} mode="demo" />;
}
