'use client';

import { useMemo } from 'react';
import {
  useData, useTweaks, useExclusions,
  kmToDisplay, distUnit,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Simplified Season Arc: YoY area paths, no legend, one-line headline with
// the latest-vs-prev delta. All math mirrors SeasonArc.jsx but we drop the
// month grid labels and the per-year stat cards — the tile is too small to
// carry them.
export default function SeasonArcCompact() {
  const data = useData();
  const { units } = useTweaks();
  const { excluded } = useExclusions();
  const all = useMemo(
    () => (excluded.size ? data.runs.filter((r) => !excluded.has(String(r.id))) : data.runs),
    [data.runs, excluded],
  );

  const { years, yearList, maxDist, totals } = useMemo(() => {
    const o = {};
    all.forEach((r) => {
      const date = new Date(r.date + 'T00:00:00');
      const y = date.getFullYear();
      const start = new Date(y, 0, 1);
      const woy = Math.floor(((date - start) / 86400000 + start.getDay()) / 7);
      if (!o[y]) o[y] = {};
      if (!o[y][woy]) o[y][woy] = { distance: 0 };
      o[y][woy].distance += r.distance;
    });
    const list = Object.keys(o).sort();
    let m = 0;
    Object.values(o).forEach((yv) => Object.values(yv).forEach((w) => { if (w.distance > m) m = w.distance; }));
    const t = list.map((y) => ({
      year: y,
      distance: Object.values(o[y]).reduce((a, w) => a + w.distance, 0),
    }));
    return { years: o, yearList: list, maxDist: m || 1, totals: t };
  }, [all]);

  if (!yearList.length) {
    return (
      <CompactTile label="Season Arc" headline="No runs yet.">
        <div />
      </CompactTile>
    );
  }

  const W = 320;
  const H = 100;
  const PAD = 4;
  const PLOT_W = W - PAD * 2;
  const PLOT_H = H - PAD * 2;

  const makePath = (y) => {
    const dataY = years[y];
    const pts = [];
    for (let w = 0; w < 53; w++) {
      const x = PAD + (w / 52) * PLOT_W;
      const d = dataY[w]?.distance || 0;
      const yv = PAD + PLOT_H - (d / maxDist) * PLOT_H;
      pts.push({ x, y: yv });
    }
    const line = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    const area = line + ` L ${pts[pts.length - 1].x} ${PAD + PLOT_H} L ${pts[0].x} ${PAD + PLOT_H} Z`;
    return { line, area };
  };

  let headline;
  if (totals.length < 2) {
    const t = totals[0];
    headline = `${t.year}: ${Math.round(kmToDisplay(t.distance, units)).toLocaleString()} ${distUnit(units)} so far.`;
  } else {
    const latest = totals[totals.length - 1];
    const prev = totals[totals.length - 2];
    const latestYear = Number(latest.year);
    const today = new Date();
    const isInProgress = latestYear === today.getFullYear();
    let projected = latest.distance;
    if (isInProgress) {
      const start = new Date(latestYear, 0, 1);
      const dayOfYear = Math.floor((today - start) / 86400000) + 1;
      const daysInYear = ((latestYear % 4 === 0 && latestYear % 100 !== 0) || latestYear % 400 === 0) ? 366 : 365;
      const fraction = Math.min(1, dayOfYear / daysInYear);
      if (fraction > 0 && fraction < 0.97) projected = latest.distance / fraction;
    }
    if (prev.distance <= 0) {
      headline = `${latest.year} building a baseline.`;
    } else {
      const deltaPct = ((projected - prev.distance) / prev.distance) * 100;
      if (deltaPct > 3) headline = `${latest.year} tracking +${deltaPct.toFixed(0)}% vs ${prev.year}.`;
      else if (deltaPct < -3) headline = `${latest.year} tracking −${Math.abs(deltaPct).toFixed(0)}% vs ${prev.year}.`;
      else headline = `${latest.year} tracking ~${prev.year} pace.`;
    }
  }

  return (
    <CompactTile label="Season Arc" headline={headline}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
        {yearList.map((y, i) => {
          const isLatest = i === yearList.length - 1;
          const color = isLatest ? 'var(--accent)' : 'var(--inkMuted)';
          const { line, area } = makePath(y);
          return (
            <g key={y}>
              <path d={area} fill={color} opacity={isLatest ? 0.2 : 0.08} />
              <path d={line} fill="none" stroke={color} strokeWidth={isLatest ? 1.6 : 1} opacity={isLatest ? 1 : 0.5} />
            </g>
          );
        })}
      </svg>
    </CompactTile>
  );
}
