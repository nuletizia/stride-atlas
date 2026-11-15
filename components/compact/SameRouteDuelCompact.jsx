'use client';

import { useMemo } from 'react';
import {
  useData, useAnalysisRuns, useTweaks, routeLoops, paceUnit, MI_PER_KM,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Simplified Same-Route Duel: pick the most-run loop (same route, similar
// distance; see routeLoops), show first-vs-best pace as a big delta number
// with a mini bar row underneath.
export default function SameRouteDuelCompact() {
  const data = useData();
  const runs = useAnalysisRuns();
  const { units } = useTweaks();

  const story = useMemo(() => {
    const loop = routeLoops(runs, data.routes)[0];
    if (!loop) return null;
    const routeRuns = loop.runs;
    const first = routeRuns[0];
    const bestRun = routeRuns.reduce((a, r) => (r.pace < a.pace ? r : a), routeRuns[0]);
    const paces = routeRuns.map((r) => r.pace);
    return {
      routeRuns, first, bestRun,
      gapMinKm: first.pace - bestRun.pace,
      best: Math.min(...paces),
      worst: Math.max(...paces),
      firstIsBest: bestRun.id === first.id,
    };
  }, [runs, data.routes]);

  if (!story) {
    return (
      <CompactTile label="Same-Route Duel" headline="Needs two runs on the same route.">
        <div />
      </CompactTile>
    );
  }

  const { routeRuns, gapMinKm, best, worst, firstIsBest, bestRun } = story;
  const gapSec = Math.round(gapMinKm * 60 * (units === 'mi' ? 1 / MI_PER_KM : 1));
  const W = 320;
  const H = 90;
  const BAR_GAP = 2;
  const BAR_W = Math.max(3, Math.min(12, (W - 8) / routeRuns.length - BAR_GAP));

  const headline = firstIsBest
    ? `First attempt still holds the record.`
    : `${routeRuns.length} attempts on your most-run loop.`;

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
            {firstIsBest ? '±0s' : `−${gapSec}s`}
            {!firstIsBest && <span style={{ fontSize: 16 }}>{paceUnit(units)}</span>}
          </span>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            first → best
          </span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
          <line x1={4} x2={W - 4} y1={H - 1} y2={H - 1} stroke="var(--ruleSoft)" />
          {routeRuns.map((r, i) => {
            const speedScore = (worst - r.pace) / (worst - best || 1);
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
