'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks,
  useComparisonWindow, pickComparison, comparisonCaption,
  fmtDate, fmtPace, fmtHr, isInterrupted, pad, mean,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  MI_PER_KM, distUnit, paceUnit, paceUnitLong,
  fmtTemp, tempUnit,
  Highlight, HlNum,
} from '@/lib/shared';
import { useScatterZoom } from '@/lib/useScatterZoom';
import { coreRegion } from '@/lib/coreRegion';
import ComparisonLegend from './ComparisonLegend';

// Distance × Pace scatter. Shows every run as a dot; x = distance, y = pace.
// Fast pace (low min/km) is drawn at the TOP. The selected window is
// compared with the previous same-length window (halves fallback); each set
// is drawn as a core region with an arrow between their means.

export default function DistancePaceCurve() {
  const data = useData();
  const { current: runs, prior: priorRuns, rangeName, rangeKey } = useComparisonWindow();
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus, selectedRunId } = useLink();
  const { show, hide } = useTooltip();
  const { units, tempUnits, stoppedThreshold } = useTweaks();
  const typeMeta = data.typeMeta;
  // Distance conversion factor in display units per km.
  const distK = units === 'mi' ? MI_PER_KM : 1;
  // Pace conversion: min/km → min/display-unit.
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;

  // Empty set = "All" mode: every type visible, dots rendered in a neutral
  // ink color so the cloud reads as one population. Clicking a type chip
  // drops into colored-by-type mode.
  const [activeTypes, setActiveTypes] = useState(() => new Set());
  const isAllMode = activeTypes.size === 0;

  const toggleType = (t) => {
    const next = new Set(activeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    // Empty set is intentional — it means "All" mode.
    setActiveTypes(next);
  };
  const selectAll = () => setActiveTypes(new Set());

  const W = 640;
  const H = 260;
  // l: room for 5-char pace ticks ("10:00") plus the rotated axis title,
  // which is pinned at Y_TITLE_X so the two never overlap.
  const M = { l: 58, r: 20, t: 22, b: 40 };
  const Y_TITLE_X = 10;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const keep = (r) => r.type !== 'recovery';
  const inView = useMemo(() => runs.filter(keep), [runs]);
  const priorView = useMemo(() => priorRuns.filter(keep), [priorRuns]);

  // Comparison across every type (drives the frame), and for the visible
  // subset with type chips applied to both sets.
  const allCmp = useMemo(() => pickComparison(inView, priorView), [inView, priorView]);
  const cmp = useMemo(() => {
    if (isAllMode) return allCmp;
    const f = (r) => activeTypes.has(r.type);
    return pickComparison(inView.filter(f), priorView.filter(f));
  }, [allCmp, inView, priorView, activeTypes, isAllMode]);

  // Outer bounds = full extent of the plotted data, used as the un-zoomed
  // frame and as the clamp for pan/zoom. Field naming matches the generic
  // useScatterZoom contract (xMin/xMax/yMin/yMax).
  const outerBounds = useMemo(() => {
    const pts = allCmp.plotted;
    if (!pts.length) return { xMin: 0, xMax: 20, yMin: 3.5, yMax: 7 };
    let distMin = Infinity, distMax = -Infinity, paceMin = Infinity, paceMax = -Infinity;
    pts.forEach((r) => {
      if (r.distance < distMin) distMin = r.distance;
      if (r.distance > distMax) distMax = r.distance;
      if (r.pace < paceMin) paceMin = r.pace;
      if (r.pace > paceMax) paceMax = r.pace;
    });
    const dP = (distMax - distMin) * 0.05 || 1;
    const pP = (paceMax - paceMin) * 0.08 || 0.3;
    return {
      xMin: Math.max(0, distMin - dP),
      xMax: distMax + dP,
      yMin: paceMin - pP,
      yMax: paceMax + pP,
    };
  }, [allCmp]);

  const { view, xFor, yFor, isZoomed, reset, svgEvents } = useScatterZoom({
    outerBounds, plotW, plotH, M,
  });

  // Previous-window runs: muted, flagged in the tooltip; clicking one
  // opens it in RunCards as an out-of-range card.
  const priorIds = useMemo(
    () => new Set(cmp.mode === 'prior' ? cmp.earlier.map((r) => r.id) : []),
    [cmp],
  );
  const earlierIds = useMemo(() => new Set(cmp.earlier.map((r) => r.id)), [cmp]);

  // Mean (distance × pace) of each set plus the core region around it,
  // in screen coordinates so the shapes follow zoom/pan. Also carries n +
  // date ranges for the legend.
  const centroids = useMemo(() => {
    if (!cmp.enough) return null;
    const { earlier: early, recent: late } = cmp;
    const startDist = mean(early.map((r) => r.distance));
    const endDist = mean(late.map((r) => r.distance));
    const startPace = mean(early.map((r) => r.pace));
    const endPace = mean(late.map((r) => r.pace));
    const startX = xFor(startDist), startY = yFor(startPace);
    const endX = xFor(endDist), endY = yFor(endPace);
    const pts = (list) => list.map((r) => ({ x: xFor(r.distance), y: yFor(r.pace) }));
    return {
      startX, startY, endX, endY,
      startDist, endDist, startPace, endPace,
      earlyRegion: coreRegion(pts(early), startX, startY),
      lateRegion: coreRegion(pts(late), endX, endY),
      earlyN: early.length, lateN: late.length,
      earlyLabel: cmp.earlyLabel, lateLabel: cmp.lateLabel,
    };
  }, [cmp, view]);

  // Per-type (and "all") readouts for the endurance cards. Each type picks
  // its own comparison (previous window when it has enough runs of that
  // type, else halves), with the same mean methodology as the chart.
  const bandReadouts = useMemo(() => {
    const types = ['all', 'easy', 'tempo', 'intervals', 'long'];
    return types.map((t) => {
      const c = t === 'all'
        ? allCmp
        : pickComparison(inView.filter((r) => r.type === t), priorView.filter((r) => r.type === t));
      if (!c.enough) return { type: t, enough: false };
      const { earlier: early, recent: late } = c;
      const startDist = mean(early.map((r) => r.distance));
      const endDist = mean(late.map((r) => r.distance));
      const startPace = mean(early.map((r) => r.pace));
      const endPace = mean(late.map((r) => r.pace));
      const distDelta = endDist - startDist;       // positive = longer now
      const distPct = startDist > 0 ? (distDelta / startDist) * 100 : 0;
      const paceDelta = startPace - endPace;        // positive = faster now (min/km drop)
      return {
        type: t, enough: true, mode: c.mode,
        startDist, endDist, startPace, endPace,
        distDelta, distPct, paceDelta,
        earlyN: early.length, lateN: late.length,
        earlyLabel: c.earlyLabel, lateLabel: c.lateLabel,
      };
    });
  }, [allCmp, inView, priorView]);

  const caption = comparisonCaption(cmp, rangeName, rangeKey);

  // `null` until user clicks a card. While null, the highlight defaults to
  // the type with the biggest distance growth, so the first read shows
  // the strongest durability story without a click.
  const [trendType, setTrendType] = useState(null);
  const winnerType = useMemo(() => {
    const wins = bandReadouts.filter((b) => b.type !== 'all' && b.enough && b.distDelta > 0);
    if (!wins.length) return null;
    return wins.reduce((a, b) => (a.distDelta > b.distDelta ? a : b)).type;
  }, [bandReadouts]);
  const activeTrend = trendType ?? winnerType ?? 'easy';

  // Distance ticks live at clean *display* values (2/5/10 km or 1/2/5 mi)
  // and carry the km position used by xFor.
  const distTicks = useMemo(() => {
    const dispMin = view.xMin * distK;
    const dispMax = view.xMax * distK;
    const step = dispMax > 30 ? 10 : dispMax > 15 ? 5 : dispMax > 8 ? 2 : 1;
    const ticks = [];
    const first = Math.ceil(dispMin / step) * step;
    for (let d = first; d <= dispMax; d += step) {
      ticks.push({ disp: d, km: d / distK });
    }
    return ticks;
  }, [view, distK]);

  const paceTicks = useMemo(() => {
    const dispMin = view.yMin * paceK;
    const dispMax = view.yMax * paceK;
    const step = units === 'mi' ? 1 : 0.5;
    const ticks = [];
    const first = Math.ceil(dispMin / step) * step;
    for (let p = first; p <= dispMax; p += step) {
      ticks.push({ disp: p, km: p / paceK });
    }
    return ticks;
  }, [view, paceK, units]);

  const showMetric = (r) => {
    const hour = Math.floor(r.duration / 60);
    const min = Math.floor(r.duration % 60);
    return (
      <>
        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
        <div style={{ opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
          {typeMeta[r.type].label} · {r.routeName}
        </div>
        <div className="t-row"><span>Distance</span><span>{fmtDistance(r.distance, units, 2)} {distUnit(units)}</span></div>
        <div className="t-row"><span>Pace</span><span>{fmtPaceUnit(r.pace, units)}{paceUnit(units)}</span></div>
        <div className="t-row"><span>Duration</span><span>{hour ? `${hour}h ${pad(min)}m` : `${min}m`}</span></div>
        <div className="t-row"><span>Avg HR</span><span>{fmtHr(r)}</span></div>
        {r.temp != null && <div className="t-row"><span>Temp</span><span>{fmtTemp(r.temp, tempUnits)}{tempUnit(tempUnits)}</span></div>}
        {isInterrupted(r, stoppedThreshold) && <div className="t-row"><span>Stopped</span><span>{Math.round(r.stoppedRatio * 100)}%</span></div>}
        {r.pr && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>PR</div>}
        {priorIds.has(r.id) && (
          <div style={{ marginTop: 6, opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Previous window</div>
        )}
      </>
    );
  };

  const TYPES_ALL = ['easy', 'tempo', 'intervals', 'long', 'race'];
  if (!inView.length) return null;

  return (
    <div className="panel" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 560 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>Aerobic Durability</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5 }}>
            Every run plotted by <b>distance × pace</b>. Fast pace is at the top; longer runs sit to the
            right, and the cloud naturally slopes toward the lower-right (longer = slower).
            Your selected period is compared with the same-length period before it (or split in half when there is no earlier data).
            Each shaded region holds the middle half of that period&rsquo;s runs: <span style={{ color: 'var(--inkMuted)' }}>dashed</span> for earlier,{' '}
            <b style={{ color: 'var(--accent)' }}>solid</b> for recent. The arrow joins their averages (up = faster, right = longer).
            Cards below break the story down by type. Click one to drive the take-away.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Show</span>
          <div className="chip-row">
            <button
              className={`chip ${isAllMode ? 'active' : ''}`}
              onClick={selectAll}
              title="Show every run in a single neutral color"
            >
              All
            </button>
            {TYPES_ALL.map((t) => (
              <button
                key={t}
                className={`chip ${activeTypes.has(t) ? 'active' : ''}`}
                onClick={() => toggleType(t)}
                style={{
                  borderLeft: `3px solid var(--type-${t})`,
                  opacity: activeTypes.has(t) ? 1 : 0.5,
                }}
              >
                {typeMeta[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        {...svgEvents}
        style={{ width: '100%', height: 'auto', display: 'block', ...svgEvents.style }}
      >
        <defs>
          <clipPath id="dpc-plot-clip">
            <rect x={M.l} y={M.t} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {/* Grid — horizontal pace lines */}
        {paceTicks.map((p) => (
          <g key={`p-${p.disp}`}>
            <line x1={M.l} x2={W - M.r} y1={yFor(p.km)} y2={yFor(p.km)} stroke="var(--ruleSoft)" strokeWidth={1} />
            <text x={M.l - 8} y={yFor(p.km) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>
              {fmtPace(p.disp)}
            </text>
          </g>
        ))}

        {/* Grid — vertical distance lines */}
        {distTicks.map((d, i) => (
          <g key={`d-${d.disp}`}>
            <line
              x1={xFor(d.km)} x2={xFor(d.km)}
              y1={M.t} y2={H - M.b}
              stroke="var(--ruleSoft)" strokeWidth={1}
              strokeDasharray={i === 0 || i === distTicks.length - 1 ? '0' : '2 3'}
            />
            <text x={xFor(d.km)} y={H - M.b + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>
              {d.disp}{distUnit(units)}
            </text>
          </g>
        ))}

        <text
          x={Y_TITLE_X} y={M.t + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${Y_TITLE_X} ${M.t + plotH / 2})`}
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Pace ({paceUnitLong(units)})</text>
        <text
          x={M.l + plotW / 2} y={H - 6}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Distance ({distUnit(units)})</text>

        {/* Direction-of-progress hint: dotted (not dashed, to stay distinct
            from the "early" trend) arrow pointing up-right — faster pace
            (higher Y) over longer distance (higher X). Text-free; the "durable"
            corner label below names the destination. */}
        <g opacity="0.5">
          <defs>
            <marker id="dp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
            </marker>
          </defs>
          <line
            x1={M.l + 32} y1={H - M.b - 14}
            x2={W - M.r - 16} y2={M.t + 18}
            stroke="var(--inkMuted)" strokeWidth={1}
            strokeDasharray="1 4"
            strokeLinecap="round"
            markerEnd="url(#dp-arrow)"
          />
        </g>

        {/* Corner labels naming each quadrant's meaning, mirroring the compact
            tile. X = distance (short→long), Y = pace (faster up): so the
            top-right corner (long + fast) is the "durable" corner, bottom-left
            (short + slow) is "recovery". Drawn outside the plot clip so they
            stay pinned to the frame through pan/zoom. */}
        <g style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 11, fill: 'var(--inkSoft)', opacity: 0.7 }}>
          <text x={M.l + 6} y={M.t + 14} textAnchor="start">short + fast</text>
          <text x={M.l + plotW - 6} y={M.t + 14} textAnchor="end">durable</text>
          <text x={M.l + 6} y={M.t + plotH - 6} textAnchor="start">recovery</text>
          <text x={M.l + plotW - 6} y={M.t + plotH - 6} textAnchor="end">long + slow</text>
        </g>

        <g clipPath="url(#dpc-plot-clip)">
        {/* Context dots: earlier set first (muted), recent set on top. */}
        {cmp.plotted
          .slice()
          .sort((a, b) => (earlierIds.has(b.id) - earlierIds.has(a.id)) || a.date.localeCompare(b.date))
          .map((r) => {
            const cx = xFor(r.distance);
            const cy = yFor(r.pace);
            const isEarlier = earlierIds.has(r.id);
            const isHover = hovered?.runId === r.id;
            const isSelected = selectedRunId === r.id;
            const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
            const dim = hovered && !isHover && !isMatch && !isSelected;
            const fill = isEarlier
              ? 'var(--inkMuted)'
              : (isAllMode ? 'var(--ink)' : `var(--type-${r.type})`);
            const op = dim ? 0.08 : (isEarlier ? 0.4 : (isAllMode ? 0.45 : 0.75));
            const size = isHover ? 3.6 : (isEarlier ? 2.2 : 2.6);


            return (
              <g
                key={r.id}
                data-tap-focus="true"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
                  show(showMetric(r), e.clientX, e.clientY);
                }}
                onMouseMove={(e) => show(showMetric(r), e.clientX, e.clientY)}
                onMouseLeave={() => {
                  if (isTouch && pendingFocusId === r.id) return;
                  setHovered(null); hide();
                }}
                onClick={() => { if (requestFocus(r.id)) hide(); }}
              >
                {/* Invisible hit target: the visible dots are small. */}
                <circle cx={cx} cy={cy} r={6} fill="transparent" />
                <circle
                  cx={cx} cy={cy} r={size}
                  fill={fill}
                  fillOpacity={isHover ? 1 : op}
                  stroke={isHover ? 'var(--ink)' : 'none'}
                  strokeWidth={isHover ? 1.2 : 0}
                />
                {isSelected && (
                  <circle
                    cx={cx} cy={cy} r={size + 4}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.8}
                  />
                )}
              </g>
            );
          })}

        {/* Core regions + arrow between set means. Non-interactive so the
             dots underneath stay hoverable. */}
        {centroids && (
          <g style={{ pointerEvents: 'none' }}>
            <defs>
              <marker id="dpc-prog-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
            </defs>
            {centroids.earlyRegion && (
              <path d={centroids.earlyRegion} fill="var(--inkMuted)" fillOpacity={0.14} stroke="var(--inkSoft)" strokeWidth={1.4} strokeDasharray="4 3" />
            )}
            {centroids.lateRegion && (
              <path d={centroids.lateRegion} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeWidth={1.8} />
            )}
            <line
              x1={centroids.startX} y1={centroids.startY}
              x2={centroids.endX} y2={centroids.endY}
              stroke="var(--accent)" strokeWidth={1.8}
              markerEnd="url(#dpc-prog-arrow)"
            />
            <circle cx={centroids.startX} cy={centroids.startY} r={3} fill="var(--inkSoft)" />
          </g>
        )}
        </g>

        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />

        {isZoomed && (
          <g style={{ cursor: 'pointer' }} onClick={() => reset()}>
            <text
              x={W - M.r - 4} y={M.t + 12}
              textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em' }}
            >⟲ reset zoom</text>
          </g>
        )}
      </svg>

      <ComparisonLegend trend={centroids} caption={caption} indent={M.l} />

      <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 16, marginTop: 16 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--inkMuted)',
          textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
        }}>
          <span>Distance × pace · per type</span>
          <span style={{ fontStyle: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 10.5, color: 'var(--inkMuted)' }}>Click to drive the highlight →</span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--inkMuted)', marginBottom: 10,
          fontStyle: 'italic', fontFamily: 'var(--serif)',
        }}>
          Same comparison, per type: previous period when it has at least 4 runs of that type, otherwise the selected period split in half. We compare the mean distance and show each set&rsquo;s mean pace alongside.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {bandReadouts.map((b) => {
            const isActive = activeTrend === b.type;
            const color = b.type === 'all' ? 'var(--ink)' : `var(--type-${b.type})`;
            const distArrow = b.enough && Math.abs(kmToDisplay(b.distDelta, units)) > 0.1
              ? (b.distDelta > 0 ? '↑' : '↓') : '=';
            return (
              <button
                key={b.type}
                onClick={() => b.enough && setTrendType(b.type)}
                disabled={!b.enough}
                style={{
                  textAlign: 'left',
                  background: isActive ? 'var(--bgSunken)' : 'transparent',
                  borderTop: `3px solid ${color}`,
                  borderRight: '1px solid var(--ruleSoft)',
                  borderBottom: '1px solid var(--ruleSoft)',
                  borderLeft: '1px solid var(--ruleSoft)',
                  borderRadius: 2,
                  padding: '10px 12px',
                  cursor: b.enough ? 'pointer' : 'not-allowed',
                  opacity: b.enough ? 1 : 0.45,
                  fontFamily: 'inherit',
                  color: 'var(--ink)',
                  display: 'block',
                  width: '100%',
                  boxShadow: isActive ? 'inset 0 0 0 1px var(--rule)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{b.type === 'all' ? 'All' : typeMeta[b.type].label}</span>
                  {b.enough ? (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)' }}>
                      {fmtPace(paceToDisplay(b.startPace, units))} → {fmtPace(paceToDisplay(b.endPace, units))}
                    </span>
                  ) : (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)' }}>n/a</span>
                  )}
                </div>
                {b.enough && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                      <span className="num" style={{ fontSize: 26, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>
                        {kmToDisplay(b.endDist, units).toFixed(1)}
                      </span>
                      <span className="mono muted" style={{ fontSize: 10 }}>{distUnit(units)}</span>
                      <span style={{ flex: 1 }} />
                      <span
                        className="num"
                        style={{
                          fontSize: 12,
                          color: b.distDelta > 0.1 ? 'var(--positive)' : b.distDelta < -0.1 ? 'var(--inkSoft)' : 'var(--inkMuted)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {distArrow} {Math.abs(kmToDisplay(b.distDelta, units)).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--inkSoft)', fontFamily: 'var(--mono)' }}>
                      <span>{kmToDisplay(b.startDist, units).toFixed(1)}</span>
                      <span style={{ flex: 1, height: 2, background: 'var(--ruleSoft)', position: 'relative' }}>
                        <span style={{
                          position: 'absolute', left: 0, top: -1,
                          width: `${Math.min(100, Math.max(5, Math.abs(b.distPct) * 8))}%`,
                          height: 4,
                          background: b.distDelta > 0 ? 'var(--positive)' : 'var(--type-tempo)',
                          opacity: 0.7,
                        }} />
                      </span>
                      <span>{kmToDisplay(b.endDist, units).toFixed(1)}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--inkMuted)', fontFamily: 'var(--mono)' }}>
                      {b.earlyN} {b.mode === 'prior' ? 'before' : 'earlier'} · {b.lateN} recent
                    </div>
                    <div style={{ marginTop: 2, fontSize: 9.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', opacity: 0.8 }}>
                      {b.earlyLabel} · {b.lateLabel}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        // Highlight reflects the active card (user's click, or the pace-
        // improvement winner by default). Distance and pace can shift
        // independently so both deltas are always named.
        const band = bandReadouts.find((b) => b.type === activeTrend);
        const label = band ? (band.type === 'all' ? 'Overall' : typeMeta[band.type].label) : '';
        if (!band || !band.enough) {
          return <Highlight tone="muted">Not enough runs in this type yet. Keep logging to unlock the endurance read.</Highlight>;
        }
        const distDisp = kmToDisplay(band.distDelta, units);
        const paceSec = band.paceDelta * 60 * paceK; // positive = faster
        const distGrew = distDisp > 0.3;
        const distShrank = distDisp < -0.3;
        const faster = paceSec > 3;
        const slower = paceSec < -3;
        const distStr = <>{fmtDistance(band.startDist, units, 1)} → {fmtDistance(band.endDist, units, 1)} {distUnit(units)}</>;
        const paceStr = <>{fmtPace(paceToDisplay(band.startPace, units))} → {fmtPace(paceToDisplay(band.endPace, units))} {paceUnit(units)}</>;

        if (faster && distGrew) {
          return (
            <Highlight>
              <HlNum>{label}</HlNum>: stretching longer and running faster. Distance <HlNum>{distStr}</HlNum>, pace <HlNum>{paceStr}</HlNum>. Clean endurance gain.
            </Highlight>
          );
        }
        if (faster) {
          return (
            <Highlight>
              <HlNum>{label}</HlNum>: same ground, faster. <HlNum>{paceStr}</HlNum>, that&rsquo;s <HlNum>{paceSec.toFixed(0)} s{paceUnit(units)}</HlNum> quicker at a similar distance.
            </Highlight>
          );
        }
        if (distGrew && !slower) {
          return (
            <Highlight>
              <HlNum>{label}</HlNum>: stretching longer. Distance <HlNum>{distStr}</HlNum>, pace <HlNum>{paceStr}</HlNum>. Base-building phase.
            </Highlight>
          );
        }
        if (slower && distShrank) {
          return (
            <Highlight tone="muted">
              <HlNum>{label}</HlNum>: shorter and easier in this window. <HlNum>{distStr}</HlNum>, <HlNum>{paceStr}</HlNum>. Recovery or off-season.
            </Highlight>
          );
        }
        if (slower) {
          return (
            <Highlight tone="muted">
              <HlNum>{label}</HlNum>: pace drifted slower at a similar distance. <HlNum>{paceStr}</HlNum>.
            </Highlight>
          );
        }
        return (
          <Highlight tone="muted">
            <HlNum>{label}</HlNum>: holding steady. <HlNum>{distStr}</HlNum>, <HlNum>{paceStr}</HlNum>.
          </Highlight>
        );
      })()}
    </div>
  );
}
