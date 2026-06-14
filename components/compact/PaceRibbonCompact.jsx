'use client';

import { useMemo } from 'react';
import {
  useAnalysisRuns, useTweaks,
  fmtPace, paceToDisplay, paceUnit, paceUnitLong,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

function fmtShortDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Simplified Trend Ribbons: at compact size we drop the per-run dots and
// keep only the 5-run rolling average. The line's slope is the story —
// individual dots were noise at this scale.
export default function PaceRibbonCompact() {
  const runs = useAnalysisRuns();
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
  const H = 160;
  // Asymmetric margins: left for y-axis label + pace values; bottom for
  // x-axis dates + axis label only (no legend now that the dots are gone).
  const M = { l: 36, r: 6, t: 8, b: 22 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  // Zoom y-axis around the rolling-average line so its slope dominates the
  // frame instead of being swamped by noisy individual-run outliers. Pad the
  // rolling span by a multiplier so it doesn't touch the frame, floor at a
  // minimum so flat periods still read sensibly, and clamp to per-run
  // bounds so the zoom never pretends there's data outside the actual range.
  const rollMin = Math.min(...rolling);
  const rollMax = Math.max(...rolling);
  const rollSpan = rollMax - rollMin;
  const rollCenter = (rollMin + rollMax) / 2;
  const halfSpan = Math.max(rollSpan * 1.5, 0.2) / 2;
  const yMin = Math.max(rollCenter - halfSpan, pMin);
  const yMax = Math.min(rollCenter + halfSpan, pMax);

  // Lower pace value = faster, so fastest sits at the top of the plot.
  const xFor = (t) => M.l + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const yFor = (p) => M.t + ((p - yMin) / (yMax - yMin || 1)) * plotH;

  const rollingPath = rolling.map((v, i) =>
    (i === 0 ? 'M ' : 'L ') + xFor(ts[i]) + ' ' + yFor(v)
  ).join(' ');

  // Early-vs-late means across 5 runs each side (same method as the full
  // panel's highlight logic). More robust than rolling[0]/rolling[n-1],
  // which only cover ~3 runs at the window edges. When the series is short
  // the window shrinks to keep both sides non-empty.
  const HALF = Math.max(1, Math.min(5, Math.floor(sorted.length / 2)));
  const earlyMeanKm = sorted.slice(0, HALF).reduce((a, r) => a + r.pace, 0) / HALF;
  const lateMeanKm  = sorted.slice(-HALF).reduce((a, r) => a + r.pace, 0) / HALF;
  const earlyDisp = paceToDisplay(earlyMeanKm, units);
  const lateDisp  = paceToDisplay(lateMeanKm, units);
  const earlyStr = fmtPace(earlyDisp);
  const lateStr = fmtPace(lateDisp);
  // Delta is in display-unit seconds (s/km or s/mi), not a unit-less number.
  const deltaSec = (earlyDisp - lateDisp) * 60;

  let headline;
  if (Math.abs(deltaSec) < 3) {
    headline = `Holding around ${lateStr}${paceUnit(units)} · ${sorted.length} runs.`;
  } else {
    headline = `Rolling avg ${earlyStr} → ${lateStr}${paceUnit(units)} · ${sorted.length} runs.`;
  }

  // Extent labels describe the visible (zoomed) frame so the numbers at
  // top/bottom of the plot match where the axis actually ends.
  const yTopLabel = fmtPace(paceToDisplay(yMin, units));
  const yBotLabel = fmtPace(paceToDisplay(yMax, units));
  const TICK = 'var(--inkMuted)';

  return (
    <CompactTile label="Trend Ribbons · Pace" headline={headline}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id="prc-clip">
            <rect x={M.l} y={M.t} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--ruleSoft)" />

        {/* Y axis: rotated label + pace extents */}
        <text
          x={10} y={M.t + plotH / 2}
          transform={`rotate(-90 10 ${M.t + plotH / 2})`}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.08em', textTransform: 'uppercase' }}
        >
          Pace ({paceUnitLong(units)})
        </text>
        <text x={M.l - 4} y={M.t + 3} textAnchor="end" dominantBaseline="hanging"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {yTopLabel}
        </text>
        <text x={M.l - 4} y={M.t + plotH} textAnchor="end"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {yBotLabel}
        </text>

        {/* X axis: first/last dates + axis label */}
        <text x={M.l} y={M.t + plotH + 12} textAnchor="start"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {fmtShortDate(xMin)}
        </text>
        <text x={M.l + plotW / 2} y={M.t + plotH + 12} textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Time
        </text>
        <text x={M.l + plotW} y={M.t + plotH + 12} textAnchor="end"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {fmtShortDate(xMax)}
        </text>

        <g clipPath="url(#prc-clip)">
          <path d={rollingPath} fill="none" stroke="var(--ink)" strokeWidth={1.4} opacity={0.85} />
        </g>
      </svg>
    </CompactTile>
  );
}
