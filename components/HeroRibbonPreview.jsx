'use client';

import { useEffect, useMemo, useState } from 'react';

// Landing-page hero animation: a miniature Pace Ribbon that writes itself
// out left-to-right on mount. Uses curated demo points (not real data) and
// the same type-coloured dots + rolling-mean line as the real panel, but
// with no interactivity — it's pure atmosphere. Respects prefers-reduced-
// motion by skipping the animation entirely.

// 50 hand-picked points, roughly 6 months of training, gentle downward
// drift on pace so the "you're getting fitter" story is visible as the
// ribbon draws.
const POINTS = [
  // Easy runs (aerobic base) — slowest pace band
  { type: 'easy',      x: 0.02, pace: 5.95 },
  { type: 'easy',      x: 0.08, pace: 5.88 },
  { type: 'easy',      x: 0.12, pace: 5.80 },
  { type: 'easy',      x: 0.18, pace: 5.85 },
  { type: 'easy',      x: 0.22, pace: 5.75 },
  { type: 'easy',      x: 0.28, pace: 5.68 },
  { type: 'easy',      x: 0.35, pace: 5.62 },
  { type: 'easy',      x: 0.42, pace: 5.70 },
  { type: 'easy',      x: 0.50, pace: 5.55 },
  { type: 'easy',      x: 0.58, pace: 5.48 },
  { type: 'easy',      x: 0.65, pace: 5.52 },
  { type: 'easy',      x: 0.72, pace: 5.40 },
  { type: 'easy',      x: 0.80, pace: 5.38 },
  { type: 'easy',      x: 0.88, pace: 5.32 },
  { type: 'easy',      x: 0.95, pace: 5.30, pr: true },
  // Long runs
  { type: 'long',      x: 0.04, pace: 5.65 },
  { type: 'long',      x: 0.11, pace: 5.60 },
  { type: 'long',      x: 0.19, pace: 5.58 },
  { type: 'long',      x: 0.26, pace: 5.55 },
  { type: 'long',      x: 0.33, pace: 5.50 },
  { type: 'long',      x: 0.41, pace: 5.48 },
  { type: 'long',      x: 0.48, pace: 5.45 },
  { type: 'long',      x: 0.56, pace: 5.40 },
  { type: 'long',      x: 0.64, pace: 5.35 },
  { type: 'long',      x: 0.71, pace: 5.30 },
  { type: 'long',      x: 0.79, pace: 5.25 },
  { type: 'long',      x: 0.87, pace: 5.18 },
  { type: 'long',      x: 0.94, pace: 5.10, pr: true },
  // Tempo (moderate)
  { type: 'tempo',     x: 0.05, pace: 4.85 },
  { type: 'tempo',     x: 0.14, pace: 4.82 },
  { type: 'tempo',     x: 0.23, pace: 4.78 },
  { type: 'tempo',     x: 0.30, pace: 4.75 },
  { type: 'tempo',     x: 0.38, pace: 4.70 },
  { type: 'tempo',     x: 0.46, pace: 4.68 },
  { type: 'tempo',     x: 0.55, pace: 4.62 },
  { type: 'tempo',     x: 0.62, pace: 4.58 },
  { type: 'tempo',     x: 0.70, pace: 4.50 },
  { type: 'tempo',     x: 0.78, pace: 4.48 },
  { type: 'tempo',     x: 0.86, pace: 4.45 },
  { type: 'tempo',     x: 0.93, pace: 4.40, pr: true },
  // Intervals (hard) — fastest pace band
  { type: 'intervals', x: 0.10, pace: 4.10 },
  { type: 'intervals', x: 0.18, pace: 4.08 },
  { type: 'intervals', x: 0.27, pace: 4.05 },
  { type: 'intervals', x: 0.36, pace: 4.00 },
  { type: 'intervals', x: 0.45, pace: 3.95 },
  { type: 'intervals', x: 0.54, pace: 3.92, pr: true },
  { type: 'intervals', x: 0.63, pace: 3.90 },
  { type: 'intervals', x: 0.72, pace: 3.85 },
  { type: 'intervals', x: 0.82, pace: 3.82 },
  { type: 'intervals', x: 0.91, pace: 3.80, pr: true },
].sort((a, b) => a.x - b.x);

const VB_W = 800;
const VB_H = 220;
const PAD_X = 20;
const PAD_Y = 24;
const MIN_PACE = 3.50;
const MAX_PACE = 6.10;
const SWEEP_MS = 3400;

const xFor = (f) => PAD_X + f * (VB_W - 2 * PAD_X);
const yFor = (p) => PAD_Y + ((p - MIN_PACE) / (MAX_PACE - MIN_PACE)) * (VB_H - 2 * PAD_Y);

export default function HeroRibbonPreview() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setProgress(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const elapsed = now - start;
      // ease-out cubic: faster at the start, gentle arrival
      const t = Math.min(1, elapsed / SWEEP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Rolling mean over a 5-point window, computed once — path gets revealed
  // by the clip rect below, not recomputed each frame.
  const meanPath = useMemo(() => {
    const pts = [];
    const W = 5;
    for (let i = W - 1; i < POINTS.length; i++) {
      const win = POINTS.slice(i - W + 1, i + 1);
      const x = win.reduce((a, p) => a + p.x, 0) / W;
      const y = win.reduce((a, p) => a + p.pace, 0) / W;
      pts.push({ x: xFor(x), y: yFor(y) });
    }
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, []);

  // Baseline guide position (bottom third) — purely decorative, a subtle
  // horizon line under the cloud so the eye has something to anchor on.
  const baselineY = VB_H - PAD_Y + 4;

  // Clip mask: from 0 to visibleW. Grows with progress.
  const visibleW = PAD_X + progress * (VB_W - 2 * PAD_X);

  return (
    <div style={{
      padding: '24px 28px',
      background: 'var(--bg)',
      border: '1px solid var(--rule)',
      borderRadius: 6,
      boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 10, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 2 }}>Trend Ribbon</div>
          <div style={{ fontSize: 12, color: 'var(--inkSoft)' }}>
            Six months of running. Each dot a run, higher = faster pace. Watch the cloud drift up as fitness builds.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--inkMuted)', textTransform: 'uppercase', flexWrap: 'wrap' }}>
          {['easy', 'tempo', 'intervals', 'long'].map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--type-${t})`, display: 'inline-block' }} />
              {t === 'tempo' ? 'moderate' : t === 'intervals' ? 'hard' : t}
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-hidden="true"
      >
        <defs>
          <clipPath id="hero-reveal-clip">
            <rect x={0} y={0} width={visibleW} height={VB_H} />
          </clipPath>
        </defs>

        {/* Baseline */}
        <line
          x1={PAD_X}
          x2={VB_W - PAD_X}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--ruleSoft)"
          strokeWidth={1}
        />

        {/* Rolling-mean trend line, clipped by the reveal rect */}
        <path
          d={meanPath}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.2}
          opacity={0.35}
          clipPath="url(#hero-reveal-clip)"
        />

        {/* Dots, clipped by the reveal rect — appear in-place as the cut
             line moves past their x position. PR runs get a slightly
             larger fill and an outer ink ring, matching PaceRibbon. */}
        <g clipPath="url(#hero-reveal-clip)">
          {POINTS.map((pt, i) => {
            const cx = xFor(pt.x).toFixed(1);
            const cy = yFor(pt.pace).toFixed(1);
            return (
              <g key={i}>
                <circle
                  cx={cx} cy={cy}
                  r={pt.pr ? 4.4 : 3.6}
                  fill={`var(--type-${pt.type})`}
                />
                {pt.pr && (
                  <circle
                    cx={cx} cy={cy}
                    r={7}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
