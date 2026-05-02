'use client';

import { useMemo } from 'react';
import {
  useFilteredRuns, hasValidHr, useTweaks,
  fmtPace, paceToDisplay, paceUnitLong,
} from '@/lib/shared';
import CompactTile from '../CompactTile';
import { zoomAround } from './zoomBounds';

// Simplified Aerobic Efficiency: at compact size we strip the scatter and
// keep only the structural signal — four labeled quadrants split at the
// early centroid, plus a single accent arrow whose tip lands in the
// quadrant that names your change vs. baseline (top-left = improving).
export default function AerobicEfficiencyCompact() {
  const runs = useFilteredRuns();
  const { units } = useTweaks();

  const computed = useMemo(() => {
    const inView = runs.filter((r) => r.type !== 'recovery' && hasValidHr(r));
    if (inView.length < 4) return null;

    let paceMin = Infinity, paceMax = -Infinity, hrMin = Infinity, hrMax = -Infinity;
    inView.forEach((r) => {
      if (r.pace < paceMin) paceMin = r.pace;
      if (r.pace > paceMax) paceMax = r.pace;
      if (r.hr < hrMin) hrMin = r.hr;
      if (r.hr > hrMax) hrMax = r.hr;
    });
    const paceP = (paceMax - paceMin) * 0.08 || 0.3;
    const hrP = (hrMax - hrMin) * 0.1 || 5;
    paceMin -= paceP; paceMax += paceP;
    hrMin -= hrP; hrMax += hrP;

    const sorted = [...inView].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, mid);
    const late = sorted.slice(mid);
    if (early.length < 2 || late.length < 2) {
      return { points: sorted, trend: null, bounds: { paceMin, paceMax, hrMin, hrMax } };
    }
    const medianOf = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const earlyHr = early.reduce((a, r) => a + r.hr, 0) / early.length;
    const lateHr = late.reduce((a, r) => a + r.hr, 0) / late.length;
    const earlyPace = medianOf(early.map((r) => r.pace));
    const latePace = medianOf(late.map((r) => r.pace));

    // Date-range labels for the legend so "early / recent" lands as
    // "Jan '25 → Mar '25 / Apr '25 → Jun '25" instead of being abstract.
    const fmtRange = (iso) =>
      new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const earlyRange = `${fmtRange(early[0].date)} → ${fmtRange(early[early.length - 1].date)}`;
    const lateRange  = `${fmtRange(late[0].date)} → ${fmtRange(late[late.length - 1].date)}`;

    return {
      points: sorted,
      trend: { earlyHr, lateHr, earlyPace, latePace, delta: lateHr - earlyHr, earlyRange, lateRange },
      bounds: { paceMin, paceMax, hrMin, hrMax },
    };
  }, [runs]);

  if (!computed) {
    return (
      <CompactTile label="Aerobic Efficiency" headline="Need HR + more runs.">
        <div />
      </CompactTile>
    );
  }

  const { trend, bounds: fullBounds } = computed;
  const W = 320;
  const H = 160;
  // Asymmetric margins make room for the rotated y-axis label + values on
  // the left, and x-axis values + a one-row date-range legend along the
  // bottom (no dot swatches now that the scatter is gone).
  const M = { l: 36, r: 6, t: 8, b: 38 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  // Zoom the plot around the two centroids so the arrow stays a consistent
  // ~1/3 of the frame regardless of how big the actual change is. Multiplier
  // 3 gives roughly that ratio; the min floors only kick in when the span
  // itself is near-zero (centroids essentially on top of each other).
  const bounds = trend
    ? zoomAround({
        cx: (trend.earlyHr + trend.lateHr) / 2,
        cy: (trend.earlyPace + trend.latePace) / 2,
        spanX: Math.abs(trend.lateHr - trend.earlyHr),
        spanY: Math.abs(trend.latePace - trend.earlyPace),
        minSpanX: 8, minSpanY: 0.2,
        mult: 3,
        outer: { xMin: fullBounds.hrMin, xMax: fullBounds.hrMax, yMin: fullBounds.paceMin, yMax: fullBounds.paceMax },
      })
    : { xMin: fullBounds.hrMin, xMax: fullBounds.hrMax, yMin: fullBounds.paceMin, yMax: fullBounds.paceMax };

  const xFor = (hr) => M.l + ((hr - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * plotW;
  const yFor = (p) => M.t + ((p - bounds.yMin) / (bounds.yMax - bounds.yMin || 1)) * plotH;

  const headline = trend && trend.delta < -0.5
    ? `HR down ${Math.abs(trend.delta).toFixed(1)} bpm at similar pace.`
    : trend && trend.delta > 0.5
      ? `HR up ${trend.delta.toFixed(1)} bpm. Watch effort.`
      : trend
        ? `HR holding steady. Keep pushing.`
        : `Early-vs-recent story building.`;

  // Axis extents — always from the visible (zoomed) bounds, not the full-data
  // bounds, so the labels describe what's actually on screen.
  const xMinLabel = Math.round(bounds.xMin);
  const xMaxLabel = Math.round(bounds.xMax);
  const yTopLabel = fmtPace(paceToDisplay(bounds.yMin, units));
  const yBotLabel = fmtPace(paceToDisplay(bounds.yMax, units));
  const legendY = M.t + plotH + 22;
  const TICK = 'var(--inkMuted)';

  return (
    <CompactTile label="Aerobic Efficiency" headline={headline}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id="aec-clip">
            <rect x={M.l} y={M.t} width={plotW} height={plotH} />
          </clipPath>
          <marker id="aec-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
          </marker>
          <marker id="aec-imp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--inkMuted)" />
          </marker>
        </defs>

        {/* Plot border */}
        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--ruleSoft)" />

        {/* Y axis: rotated label + fastest/slowest pace values */}
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

        {/* X axis: left/right HR values + centered label */}
        <text x={M.l} y={M.t + plotH + 12} textAnchor="start"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {xMinLabel}
        </text>
        <text x={M.l + plotW / 2} y={M.t + plotH + 12} textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          HR (bpm)
        </text>
        <text x={M.l + plotW} y={M.t + plotH + 12} textAnchor="end"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {xMaxLabel}
        </text>

        {/* Legend: date ranges only — the arrow's tail is your baseline
             window, the head is your recent window. */}
        {trend && (
          <g transform={`translate(0, ${legendY})`}>
            <text x={M.l} y={0} textAnchor="start"
              style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              baseline
            </text>
            <text x={M.l} y={11} textAnchor="start"
              style={{ fontFamily: 'var(--mono)', fontSize: 8, fill: TICK, opacity: 0.85 }}>
              {trend.earlyRange}
            </text>
            <text x={M.l + plotW} y={0} textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              recent
            </text>
            <text x={M.l + plotW} y={11} textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 8, fill: TICK, opacity: 0.85 }}>
              {trend.lateRange}
            </text>
          </g>
        )}
        <g clipPath="url(#aec-clip)">
          {trend && (
            <>
              {/* Subtle reference: dotted arrow toward the good corner
                  (lower HR + faster pace). Matches the full view's
                  "improving" arrow at compact scale. */}
              <line
                x1={M.l + plotW - 10} y1={M.t + plotH - 18}
                x2={M.l + 14} y2={M.t + 24}
                stroke="var(--inkMuted)" strokeWidth={1}
                strokeDasharray="1 4" strokeLinecap="round"
                markerEnd="url(#aec-imp)"
                opacity={0.45}
              />
              {/* Quadrant dividers at the early centroid. The cross IS the
                  arrow's tail anchor — the quadrant the arrow tip lands in
                  names your change vs. baseline. */}
              <line
                x1={xFor(trend.earlyHr)} y1={M.t}
                x2={xFor(trend.earlyHr)} y2={M.t + plotH}
                stroke="var(--ruleSoft)" strokeWidth={1}
                strokeDasharray="2 3" opacity={0.7}
              />
              <line
                x1={M.l} y1={yFor(trend.earlyPace)}
                x2={M.l + plotW} y2={yFor(trend.earlyPace)}
                stroke="var(--ruleSoft)" strokeWidth={1}
                strokeDasharray="2 3" opacity={0.7}
              />

              {/* Corner labels naming each quadrant's meaning. */}
              <text x={M.l + 4} y={M.t + 11} textAnchor="start"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                improving
              </text>
              <text x={M.l + plotW - 4} y={M.t + 11} textAnchor="end"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                more effort
              </text>
              <text x={M.l + 4} y={M.t + plotH - 4} textAnchor="start"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                less effort
              </text>
              <text x={M.l + plotW - 4} y={M.t + plotH - 4} textAnchor="end"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                declining
              </text>

              {/* Centroid arrow: baseline → recent. */}
              <line
                x1={xFor(trend.earlyHr)} y1={yFor(trend.earlyPace)}
                x2={xFor(trend.lateHr)} y2={yFor(trend.latePace)}
                stroke="var(--accent)" strokeWidth={1.8}
                markerEnd="url(#aec-arrow)"
              />
              {/* Recent centroid plus mark — anchors the arrow tip. The
                  early centroid is implicitly marked by the divider cross. */}
              <line x1={xFor(trend.lateHr) - 7} y1={yFor(trend.latePace)} x2={xFor(trend.lateHr) + 7} y2={yFor(trend.latePace)} stroke="var(--accent)" strokeWidth={2.2} />
              <line x1={xFor(trend.lateHr)} y1={yFor(trend.latePace) - 7} x2={xFor(trend.lateHr)} y2={yFor(trend.latePace) + 7} stroke="var(--accent)" strokeWidth={2.2} />
            </>
          )}
        </g>
      </svg>
    </CompactTile>
  );
}
