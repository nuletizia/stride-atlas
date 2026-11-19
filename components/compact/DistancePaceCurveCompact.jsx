'use client';

import { useMemo } from 'react';
import {
  useComparisonWindow, pickComparison, useTweaks, mean,
  fmtPace, paceToDisplay, paceUnit, paceUnitLong,
  kmToDisplay, distUnit,
  keepForDurability, TREND_PACE_SEC_KM, TREND_DIST_PCT,
} from '@/lib/shared';
import CompactTile from '../CompactTile';
import { coreRegion, robustBounds } from '@/lib/coreRegion';

// Simplified Aerobic Durability: at compact size we drop the dots and keep
// only the two core regions (earlier set dashed, recent set accent) and an
// arrow between their means. Earlier = previous same-length window, or the
// first half of the selected window when there is no usable previous one.
export default function DistancePaceCurveCompact() {
  const { current: runs, prior: priorRuns, rangeName } = useComparisonWindow();
  const { units } = useTweaks();

  const view = useMemo(() => {
    const keep = keepForDurability;
    const inView = runs.filter(keep);
    if (!inView.length) return null;
    const cmp = pickComparison(inView, priorRuns.filter(keep));
    let longest = inView[0], fastest = inView[0];
    inView.forEach((r) => {
      if (r.distance > longest.distance) longest = r;
      if (r.pace < fastest.pace) fastest = r;
    });
    const bounds = robustBounds(cmp.plotted.map((r) => r.distance), cmp.plotted.map((r) => r.pace));
    const trend = cmp.enough ? {
      early: cmp.earlier, late: cmp.recent, mode: cmp.mode,
      earlyDist: mean(cmp.earlier.map((r) => r.distance)),
      lateDist: mean(cmp.recent.map((r) => r.distance)),
      earlyPace: mean(cmp.earlier.map((r) => r.pace)),
      latePace: mean(cmp.recent.map((r) => r.pace)),
      earlyRange: cmp.earlyLabel, lateRange: cmp.lateLabel,
    } : null;
    return { longest, fastest, bounds, trend };
  }, [runs, priorRuns]);

  if (!view) {
    return (
      <CompactTile label="Aerobic Durability" headline="No runs in view.">
        <div />
      </CompactTile>
    );
  }

  const { longest, fastest, bounds, trend } = view;
  const W = 320;
  const H = 160;
  // Asymmetric margins make room for the rotated y-axis label + values on
  // the left, and x-axis values + a one-row date-range legend along the
  // bottom.
  const M = { l: 36, r: 6, t: 8, b: 38 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const xFor = (d) => M.l + ((d - bounds.xMin) / (bounds.xMax - bounds.xMin || 1)) * plotW;
  const yFor = (p) => M.t + ((p - bounds.yMin) / (bounds.yMax - bounds.yMin || 1)) * plotH;

  // Headline has to reflect BOTH axes honestly. The old "pace dropped at
  // similar distance" was a lie unless we actually checked distance stayed
  // similar — so branch on whether each axis moved meaningfully and describe
  // the quadrant we're in.
  let headline;
  if (trend) {
    const paceSec = (trend.earlyPace - trend.latePace) * 60;  // + = faster
    const distDeltaKm = trend.lateDist - trend.earlyDist;      // + = longer
    const distDeltaPct = trend.earlyDist > 0 ? Math.abs(distDeltaKm / trend.earlyDist) : 0;
    const distChanged = distDeltaPct >= TREND_DIST_PCT;
    const paceChanged = Math.abs(paceSec) >= TREND_PACE_SEC_KM;
    const distDisp = Math.abs(kmToDisplay(distDeltaKm, units)).toFixed(1);
    const u = distUnit(units);
    const paceStr = Math.abs(paceSec).toFixed(0);

    if (!distChanged && !paceChanged) {
      headline = `Pace and distance holding steady.`;
    } else if (!distChanged) {
      headline = paceSec > 0
        ? `Pace dropped ${paceStr}s at similar distance.`
        : `Pace up ${paceStr}s at similar distance.`;
    } else if (!paceChanged) {
      headline = distDeltaKm > 0
        ? `Runs ${distDisp} ${u} longer at similar pace.`
        : `Runs ${distDisp} ${u} shorter at similar pace.`;
    } else if (distDeltaKm > 0 && paceSec > 0) {
      headline = `${distDisp} ${u} longer and ${paceStr}s faster.`;
    } else if (distDeltaKm > 0 && paceSec < 0) {
      headline = `${distDisp} ${u} longer, ${paceStr}s slower pace.`;
    } else if (distDeltaKm < 0 && paceSec > 0) {
      headline = `${distDisp} ${u} shorter, ${paceStr}s faster.`;
    } else {
      headline = `${distDisp} ${u} shorter and ${paceStr}s slower.`;
    }
  } else {
    headline = `Longest ${kmToDisplay(longest.distance, units).toFixed(1)} ${distUnit(units)} · fastest ${fmtPace(paceToDisplay(fastest.pace, units))}${paceUnit(units)}`;
  }

  // Core regions in screen coordinates, centered on each set's mean.
  const regions = trend ? {
    early: coreRegion(trend.early.map((r) => ({ x: xFor(r.distance), y: yFor(r.pace) })), xFor(trend.earlyDist), yFor(trend.earlyPace)),
    late: coreRegion(trend.late.map((r) => ({ x: xFor(r.distance), y: yFor(r.pace) })), xFor(trend.lateDist), yFor(trend.latePace)),
  } : null;
  const earlyName = trend && trend.mode === 'prior' ? `previous ${rangeName}` : 'earlier half';
  const lateName = trend && trend.mode === 'prior' ? `last ${rangeName}` : 'recent half';

  // Axis extents from the plotted bounds.
  const xMinLabel = kmToDisplay(bounds.xMin, units).toFixed(1);
  const xMaxLabel = kmToDisplay(bounds.xMax, units).toFixed(1);
  const yTopLabel = fmtPace(paceToDisplay(bounds.yMin, units));
  const yBotLabel = fmtPace(paceToDisplay(bounds.yMax, units));
  const legendY = M.t + plotH + 22;
  const TICK = 'var(--inkMuted)';

  return (
    <CompactTile label="Aerobic Durability" headline={headline}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id="dpcc-clip">
            <rect x={M.l} y={M.t} width={plotW} height={plotH} />
          </clipPath>
          <marker id="dpcc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
          </marker>
          <marker id="dpcc-imp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--inkMuted)" />
          </marker>
        </defs>

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

        {/* X axis: left/right distance values + centered label */}
        <text x={M.l} y={M.t + plotH + 12} textAnchor="start"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: TICK }}>
          {xMinLabel}
        </text>
        <text x={M.l + plotW / 2} y={M.t + plotH + 12} textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 8.5, fill: TICK, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Distance ({distUnit(units)})
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
        <g clipPath="url(#dpcc-clip)">
          {trend && (
            <>
              {/* Subtle reference: dotted arrow toward the durable corner
                  (longer + faster). Matches the full view's "improving"
                  arrow at compact scale. */}
              <line
                x1={M.l + 14} y1={M.t + plotH - 18}
                x2={M.l + plotW - 10} y2={M.t + 24}
                stroke="var(--inkMuted)" strokeWidth={1}
                strokeDasharray="1 4" strokeLinecap="round"
                markerEnd="url(#dpcc-imp)"
                opacity={0.45}
              />
              {/* Corner labels naming each quadrant's meaning. */}
              <text x={M.l + 4} y={M.t + 11} textAnchor="start"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                short + fast
              </text>
              <text x={M.l + plotW - 4} y={M.t + 11} textAnchor="end"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                durable
              </text>
              <text x={M.l + 4} y={M.t + plotH - 4} textAnchor="start"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                recovery
              </text>
              <text x={M.l + plotW - 4} y={M.t + plotH - 4} textAnchor="end"
                style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 9, fill: 'var(--inkSoft)', opacity: 0.7 }}>
                long + slow
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
                x1={xFor(trend.earlyDist)} y1={yFor(trend.earlyPace)}
                x2={xFor(trend.lateDist)} y2={yFor(trend.latePace)}
                stroke="var(--accent)" strokeWidth={1.8}
                markerEnd="url(#dpcc-arrow)"
              />
              <circle cx={xFor(trend.earlyDist)} cy={yFor(trend.earlyPace)} r={2.5} fill="var(--inkSoft)" />
            </>
          )}
        </g>
      </svg>
    </CompactTile>
  );
}
