import './globals.css';
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: {
    default: 'Stride Atlas · See your running progress',
    template: '%s · Stride Atlas',
  },
  description: 'A compact progress view of your Strava runs. Aerobic base, tempo pace, long runs, PRs, all on one page. Built for runners training toward a goal.',
  openGraph: {
    title: 'Stride Atlas · See your running progress',
    description: 'A compact progress view of your Strava runs. Aerobic base, tempo pace, long runs, PRs, all on one page.',
    type: 'website',
    siteName: 'Stride Atlas',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stride Atlas · See your running progress',
    description: 'A compact progress view of your Strava runs. Aerobic base, tempo pace, long runs, PRs, all on one page.',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
