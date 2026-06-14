'use client';

import { useMemo } from 'react';
import {
  useData, useAnalysisRuns,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Simplified Same-Route Duel: pick the most-run route, show first-vs-best
// as a big delta number with a mini bar row underneath.
export default function SameRouteDuelCompact() {
  const data = useData();
  const runs = useAnalysisRuns();

  const story = useMemo(() => {
    const c = {};
    runs.forEach((r) => { c[r.routeId] = (c[r.routeId] || 0) + 1; });
    const rankedId = Object.entries(c)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!rankedId) return null;
    const routeRuns = runs
      .filter((r) => r.routeId === rankedId)
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = routeRuns[0];
    const bestRun = routeRuns.reduce((a, r) => (r.duration < a.duration ? r : a), routeRuns[0]);
    const gapSec = (first.duration - bestRun.duration) * 60;
    const durations = routeRuns.map((r) => r.duration);
    const best = Math.min(...durations);
    const worst = Math.max(...durations);
    return {
      routeRuns, first, bestRun, gapSec,
      best, worst,
      firstIsBest: bestRun.id === first.id,
    };
  }, [runs]);

  if (!story) {
    return (
      <CompactTile label="Same-Route Duel" headline="Needs two runs on the same route.">
        <div />
      </CompactTile>
    );
  }

  const { routeRuns, gapSec, best, worst, firstIsBest, bestRun } = story;
  const W = 320;
  const H = 90;
  const BAR_GAP = 2;
  const BAR_W = Math.max(3, Math.min(12, (W - 8) / routeRuns.length - BAR_GAP));

  const headline = firstIsBest
    ? `First attempt still holds the record.`
    : `${routeRuns.length} attempts on your most-run route.`;

  return (
    <CompactTile label="Same-Route Duel" headline={headline}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em',
              color: firstIsBest ? 'var(--inkSoft)' : 'var(--positive)',
            }}
          >
            {firstIsBest ? '±0s' : `−${gapSec.toFixed(0)}s`}
          </span>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            first → best
          </span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
          <line x1={4} x2={W - 4} y1={H - 1} y2={H - 1} stroke="var(--ruleSoft)" />
          {routeRuns.map((r, i) => {
            const speedScore = (worst - r.duration) / (worst - best || 1);
            const barH = 8 + speedScore * (H - 12);
            const x = 4 + i * (BAR_W + BAR_GAP);
            const y = H - barH;
            const isBest = r.id === bestRun.id;
            return (
              <g key={r.id}>
                <rect x={x} y={y} width={BAR_W} height={barH} fill={`var(--type-${r.type})`} opacity={isBest ? 1 : 0.6} />
                {isBest && (
                  <rect x={x - 1} y={y - 1} width={BAR_W + 2} height={barH + 2} fill="none" stroke="var(--ink)" strokeWidth={1} />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </CompactTile>
  );
}
