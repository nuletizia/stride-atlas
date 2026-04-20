import { ImageResponse } from 'next/og';

// Default OG image served at /opengraph-image for any page that doesn't
// override it. Generated per request/build by Next.js; themed in editorial
// palette with a miniature ribbon-of-dots visual to echo the dashboard.

export const alt = 'Stride Atlas — See your running progress';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Miniature ribbon: a handful of points positioned roughly like the
// landing hero animation but static. Uses the same type palette so
// anyone familiar with the dashboard instantly recognises it.
const BG = '#F4F1EA';
const INK = '#1A1A17';
const INK_SOFT = '#4A4842';
const INK_MUTED = '#8A867C';
const RULE = '#D9D3C4';
const ACCENT = '#C4502A';
const TYPE = {
  easy:      '#7A9A6E',
  tempo:     '#D39B3F',
  long:      '#C4502A',
  intervals: '#C94A5A',
};
const DOTS = [
  { type: 'easy',      x: 0.05, y: 0.72 },
  { type: 'long',      x: 0.12, y: 0.62 },
  { type: 'easy',      x: 0.18, y: 0.68 },
  { type: 'tempo',     x: 0.22, y: 0.42 },
  { type: 'intervals', x: 0.28, y: 0.18 },
  { type: 'long',      x: 0.34, y: 0.56 },
  { type: 'easy',      x: 0.40, y: 0.60 },
  { type: 'tempo',     x: 0.46, y: 0.36 },
  { type: 'intervals', x: 0.52, y: 0.14 },
  { type: 'long',      x: 0.58, y: 0.50 },
  { type: 'easy',      x: 0.64, y: 0.54 },
  { type: 'tempo',     x: 0.70, y: 0.32 },
  { type: 'intervals', x: 0.76, y: 0.10 },
  { type: 'long',      x: 0.82, y: 0.44 },
  { type: 'easy',      x: 0.88, y: 0.48 },
];

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: '60px 70px',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        {/* Top row: eyebrow + wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 20,
              color: INK_MUTED,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              marginBottom: 14,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            Your running progress · v1
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              color: INK,
              lineHeight: 1,
              display: 'flex',
            }}
          >
            <span style={{ fontStyle: 'normal' }}>Stride</span>
            <span style={{ fontStyle: 'italic', marginLeft: 2 }}>Atlas</span>
          </div>
        </div>

        {/* Middle: headline */}
        <div
          style={{
            fontSize: 88,
            fontStyle: 'italic',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            color: INK,
            maxWidth: 980,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>See your progress.</span>
          <span>Not just your last run.</span>
        </div>

        {/* Bottom: ribbon dots + caption */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 120,
              borderTop: `1px solid ${RULE}`,
              borderBottom: `1px solid ${RULE}`,
              display: 'flex',
            }}
          >
            {DOTS.map((d, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${d.x * 100}%`,
                  top: `${d.y * 100}%`,
                  width: 14,
                  height: 14,
                  borderRadius: 9999,
                  background: TYPE[d.type],
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 18,
              color: INK_SOFT,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span>Aerobic base · Tempo · Intervals · Long</span>
            <span style={{ color: ACCENT }}>Powered by Strava</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
