'use client';

import { useMemo } from 'react';
import {
  useFilteredRuns, useTweaks,
  fmtPace, paceToDisplay, paceUnit,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Simplified Trend Ribbons: overall pace only, single ribbon with rolling
// average. Drops the per-type rows that carry most of the full panel's value —
// that's the tradeoff of the tile format. Still shows the progression arc.
export default function PaceRibbonCompact() {
  const runs = useFilteredRuns();
  const { units } = useTweaks();

  const series = useMemo(() => {
    if (runs.length < 2) return null;
    const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
    const ts = sorted.map((r) => new Date(r.date + 'T00:00:00').getTime());
    const xMin = ts[0];
    const xMax = ts[ts.length - 1];
    const paces = sorted.map((r) => r.pace);
    let pMin = Math.min(...paces) * 0.98;
    let pMax = Math.max(...paces) * 1.02;
    if (pMax - pMin < 0.2) pMax = pMin + 0.2;

    const win = 5;
    const rolling = sorted.map((r, i) => {
      const from = Math.max(0, i - Math.floor(win / 2));
      const to = Math.min(sorted.length, i + Math.ceil(win / 2));
      const slice = sorted.slice(from, to);
      const v = slice.reduce((a, x) => a + x.pace, 0) / slice.length;
      return v;
    });

    return { sorted, ts, xMin, xMax, pMin, pMax, rolling };
  }, [runs]);

  if (!series) {
    return (
      <CompactTile label="Trend Ribbons · Pace" headline="Not enough runs yet.">
        <div />
      </CompactTile>
    );
  }

  const { sorted, ts, xMin, xMax, pMin, pMax, rolling } = series;

  const W = 320;
  const H = 110;
  const PAD_X = 6;
  const PAD_Y = 10;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_Y * 2;

  // Lower pace value = faster, so we invert y: fastest pace sits at the top.
  const xFor = (t) => PAD_X + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const yFor = (p) => PAD_Y + ((p - pMin) / (pMax - pMin || 1)) * plotH;

  const rollingPath = rolling.map((v, i) =>
    (i === 0 ? 'M ' : 'L ') + xFor(ts[i]) + ' ' + yFor(v)
  ).join(' ');

  const firstR = rolling[0];
  const lastR = rolling[rolling.length - 1];
  const improvedSec = (firstR - lastR) * 60;
  const improved = improvedSec > 1;
  const regressed = improvedSec < -1;

  const headline = improved
    ? `Pace dropped ${improvedSec.toFixed(0)}s over ${sorted.length} runs.`
    : regressed
      ? `Pace up ${Math.abs(improvedSec).toFixed(0)}s over ${sorted.length} runs.`
      : `Holding steady at ${fmtPace(paceToDisplay(lastR, units))}${paceUnit(units)}.`;

  return (
    <CompactTile label="Trend Ribbons · Pace" headline={headline}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
        <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y + 2} y2={H - PAD_Y + 2} stroke="var(--ruleSoft)" />
        {sorted.map((r, i) => (
          <circle
            key={r.id}
            cx={xFor(ts[i])}
            cy={yFor(r.pace)}
            r={1.8}
            fill={`var(--type-${r.type})`}
            opacity={0.6}
          />
        ))}
        <path d={rollingPath} fill="none" stroke="var(--ink)" strokeWidth={1.4} opacity={0.85} />
      </svg>
    </CompactTile>
  );
}
