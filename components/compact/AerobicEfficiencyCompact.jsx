'use client';

import { useMemo } from 'react';
import {
  useComparisonWindow, pickComparison, hasValidHr, useTweaks, mean,
  fmtPace, paceToDisplay, paceUnitLong,
} from '@/lib/shared';
import CompactTile from '../CompactTile';
import { coreRegion, robustBounds } from '@/lib/coreRegion';

// Simplified Aerobic Efficiency: at compact size we drop the dots and keep
// only the two core regions (earlier set dashed, recent set accent) and an
// arrow between their means. Earlier = previous same-length window, or the
// first half of the selected window when there is no usable previous one.
export default function AerobicEfficiencyCompact() {
  const { current: runs, prior: priorRuns, rangeName } = useComparisonWindow();
  const { units } = useTweaks();

  const computed = useMemo(() => {
    const keep = (r) => r.type !== 'recovery' && hasValidHr(r);
    const inView = runs.filter(keep);
    if (inView.length < 4) return null;
    const cmp = pickComparison(inView, priorRuns.filter(keep));

    const bounds = robustBounds(cmp.plotted.map((r) => r.hr), cmp.plotted.map((r) => r.pace));
    if (!cmp.enough) return { trend: null, bounds };

    const earlyHr = mean(cmp.earlier.map((r) => r.hr));
    const lateHr = mean(cmp.recent.map((r) => r.hr));
    const earlyPace = mean(cmp.earlier.map((r) => r.pace));
    const latePace = mean(cmp.recent.map((r) => r.pace));
    return {
      trend: {
        early: cmp.earlier, late: cmp.recent, mode: cmp.mode,
        earlyHr, lateHr, earlyPace, latePace, delta: lateHr - earlyHr,
        earlyRange: cmp.earlyLabel, lateRange: cmp.lateLabel,
      },
      bounds,
    };
  }, [runs, priorRuns]);

  if (!computed) {
    return (
      <CompactTile label="Aerobic Efficiency" headline="Need HR + more runs.">
        <div />
      </CompactTile>
    );
  }

  const { trend, bounds } = computed;
  const W = 320;
  const H = 160;
  // Asymmetric margins make room for the rotated y-axis label + values on
  // the left, and x-axis values + a one-row date-range legend along the
  // bottom.
  const M = { l: 36, r: 6, t: 8, b: 38 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const xFor = (hr) => M.l + ((hr - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * plotW;
  const yFor = (p) => M.t + ((p - bounds.yMin) / (bounds.yMax - bounds.yMin || 1)) * plotH;

  // Core regions in screen coordinates, centered on each set's mean.
  const regions = trend ? {
    early: coreRegion(trend.early.map((r) => ({ x: xFor(r.hr), y: yFor(r.pace) })), xFor(trend.earlyHr), yFor(trend.earlyPace)),
    late: coreRegion(trend.late.map((r) => ({ x: xFor(r.hr), y: yFor(r.pace) })), xFor(trend.lateHr), yFor(trend.latePace)),
  } : null;
  const earlyName = trend && trend.mode === 'prior' ? `previous ${rangeName}` : 'earlier half';
  const lateName = trend && trend.mode === 'prior' ? `last ${rangeName}` : 'recent half';

  const headline = trend && trend.delta < -0.5
    ? `HR down ${Math.abs(trend.delta).toFixed(1)} bpm at similar pace.`
    : trend && trend.delta > 0.5
      ? `HR up ${trend.delta.toFixed(1)} bpm. Watch effort.`
      : trend
        ? `HR holding steady. Keep pushing.`
        : `Early-vs-recent story building.`;

  // Axis extents from the plotted bounds.
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
              {earlyName}
            </text>
            <text x={M.l} y={11} textAnchor="start"
              style={{ fontFamily: 'var(--mono)', fontSize: 8, fill: TICK, opacity: 0.85 }}>
              {trend.earlyRange}
            </text>
            <text x={M.l + plotW} y={0} textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {lateName}
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

              {/* Core regions: middle half of each set, earlier dashed,
                  recent in accent, plus the arrow between set means. */}
              {regions.early && (
                <path d={regions.early} fill="var(--inkMuted)" fillOpacity={0.16} stroke="var(--inkSoft)" strokeWidth={1.2} strokeDasharray="3 2.5" />
              )}
              {regions.late && (
                <path d={regions.late} fill="var(--accent)" fillOpacity={0.14} stroke="var(--accent)" strokeWidth={1.6} />
              )}
              <line
                x1={xFor(trend.earlyHr)} y1={yFor(trend.earlyPace)}
                x2={xFor(trend.lateHr)} y2={yFor(trend.latePace)}
                stroke="var(--accent)" strokeWidth={1.8}
                markerEnd="url(#aec-arrow)"
              />
              <circle cx={xFor(trend.earlyHr)} cy={yFor(trend.earlyPace)} r={2.5} fill="var(--inkSoft)" />
            </>
          )}
        </g>
      </svg>
    </CompactTile>
  );
}
