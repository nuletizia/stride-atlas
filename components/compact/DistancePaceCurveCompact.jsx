'use client';

import { useMemo } from 'react';
import {
  useFilteredRuns, useTweaks, mean,
  fmtPace, paceToDisplay, paceUnit, paceUnitLong,
  kmToDisplay, distUnit,
} from '@/lib/shared';
import CompactTile from '../CompactTile';
import { zoomAround } from './zoomBounds';

// Simplified Aerobic Durability: at compact size we strip the scatter and
// keep only four labeled quadrants split at the early centroid plus a
// single accent arrow. The arrow's tip lands in the quadrant that names
// your change vs. baseline (top-right = durable: longer + faster).
export default function DistancePaceCurveCompact() {
  const runs = useFilteredRuns();
  const { units } = useTweaks();

  const view = useMemo(() => {
    const inView = runs.filter((r) => r.type !== 'recovery');
    if (!inView.length) return null;
    let distMin = Infinity, distMax = -Infinity, paceMin = Infinity, paceMax = -Infinity;
    let longest = inView[0], fastest = inView[0];
    inView.forEach((r) => {
      if (r.distance < distMin) distMin = r.distance;
      if (r.distance > distMax) { distMax = r.distance; longest = r; }
      if (r.pace < paceMin) { paceMin = r.pace; fastest = r; }
      if (r.pace > paceMax) paceMax = r.pace;
    });
    const dP = (distMax - distMin) * 0.05 || 1;
    const pP = (paceMax - paceMin) * 0.08 || 0.3;
    const bounds = {
      distMin: Math.max(0, distMin - dP),
      distMax: distMax + dP,
      paceMin: paceMin - pP,
      paceMax: paceMax + pP,
    };

    const sorted = [...inView].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, mid);
    const late = sorted.slice(mid);
    let trend = null;
    if (early.length >= 2 && late.length >= 2) {
      // Date-range labels for the legend so "early / recent" lands as
      // concrete months instead of being abstract halves.
      const fmtRange = (iso) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      trend = {
        earlyDist: mean(early.map((r) => r.distance)),
        lateDist: mean(late.map((r) => r.distance)),
        earlyPace: mean(early.map((r) => r.pace)),
        latePace: mean(late.map((r) => r.pace)),
        earlyRange: `${fmtRange(early[0].date)} → ${fmtRange(early[early.length - 1].date)}`,
        lateRange:  `${fmtRange(late[0].date)} → ${fmtRange(late[late.length - 1].date)}`,
      };
    }

    return { points: sorted, longest, fastest, bounds, trend, mid };
  }, [runs]);

  if (!view) {
    return (
      <CompactTile label="Aerobic Durability" headline="No runs in view.">
        <div />
      </CompactTile>
    );
  }

  const { longest, fastest, bounds: fullBounds, trend } = view;
  const W = 320;
  const H = 160;
  // Asymmetric margins make room for the rotated y-axis label + values on
  // the left, and x-axis values + a one-row date-range legend along the
  // bottom (no dot swatches now that the scatter is gone).
  const M = { l: 36, r: 6, t: 8, b: 38 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  // Zoom around the centroids so the progress arrow stays a consistent
  // ~1/3 of the frame. Multiplier 3 matches the AE tile. The min floors
  // only engage when centroids are essentially overlapping — they prevent
  // collapse to a single pixel without inflating the frame for a small
  // but meaningful arrow.
  const bounds = trend
    ? zoomAround({
        cx: (trend.earlyDist + trend.lateDist) / 2,
        cy: (trend.earlyPace + trend.latePace) / 2,
        spanX: Math.abs(trend.lateDist - trend.earlyDist),
        spanY: Math.abs(trend.latePace - trend.earlyPace),
        minSpanX: 1, minSpanY: 0.15,
        mult: 3,
        outer: { xMin: fullBounds.distMin, xMax: fullBounds.distMax, yMin: fullBounds.paceMin, yMax: fullBounds.paceMax },
      })
    : { xMin: fullBounds.distMin, xMax: fullBounds.distMax, yMin: fullBounds.paceMin, yMax: fullBounds.paceMax };

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
    const distChanged = distDeltaPct >= 0.1;
    const paceChanged = Math.abs(paceSec) >= 2;
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

  // Axis extents from the visible (zoomed) bounds.
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
              {/* Quadrant dividers at the early centroid. The cross IS the
                  arrow's tail — the quadrant the arrow tip lands in names
                  your change vs. baseline (top-right is the durable corner:
                  longer + faster). */}
              <line
                x1={xFor(trend.earlyDist)} y1={M.t}
                x2={xFor(trend.earlyDist)} y2={M.t + plotH}
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

              {/* Centroid arrow: baseline → recent. */}
              <line
                x1={xFor(trend.earlyDist)} y1={yFor(trend.earlyPace)}
                x2={xFor(trend.lateDist)} y2={yFor(trend.latePace)}
                stroke="var(--accent)" strokeWidth={1.8}
                markerEnd="url(#dpcc-arrow)"
              />
              {/* Recent centroid plus mark — anchors the arrow tip. The
                  early centroid is implicitly marked by the divider cross. */}
              <line x1={xFor(trend.lateDist) - 7} y1={yFor(trend.latePace)} x2={xFor(trend.lateDist) + 7} y2={yFor(trend.latePace)} stroke="var(--accent)" strokeWidth={2.2} />
              <line x1={xFor(trend.lateDist)} y1={yFor(trend.latePace) - 7} x2={xFor(trend.lateDist)} y2={yFor(trend.latePace) + 7} stroke="var(--accent)" strokeWidth={2.2} />
            </>
          )}
        </g>
      </svg>
    </CompactTile>
  );
}
