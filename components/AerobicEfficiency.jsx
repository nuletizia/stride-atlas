'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks,
  useComparisonWindow, pickComparison, comparisonCaption,
  fmtDate, fmtPace, fmtHr, hasValidHr, isInterrupted, pad, mean,
  fmtDistance, fmtPaceUnit, paceToDisplay,
  MI_PER_KM, distUnit, paceUnit, paceUnitLong,
  fmtTemp, tempUnit,
  Highlight, HlNum,
} from '@/lib/shared';
import { useScatterZoom } from '@/lib/useScatterZoom';
import { coreRegion } from '@/lib/coreRegion';
import ComparisonLegend from './ComparisonLegend';

export default function AerobicEfficiency() {
  const data = useData();
  const { current: runs, prior: priorRuns, rangeName, rangeKey } = useComparisonWindow();
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus, selectedRunId } = useLink();
  const { show, hide } = useTooltip();
  const { units, tempUnits, stoppedThreshold } = useTweaks();
  const typeMeta = data.typeMeta;
  // min/km → min/display-unit (1 for km; 1/MI_PER_KM for miles).
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;

  // Empty set = "All" mode: every type visible, dots rendered in a neutral
  // ink color so the cloud reads as one population. Clicking a type chip
  // filters both compared sets and colors the recent dots by type.
  const [activeTypes, setActiveTypes] = useState(() => new Set());
  const isAllMode = activeTypes.size === 0;
  // `null` until the user clicks a card. While null, the highlight defaults
  // to the winner type (biggest clean HR drop), so the initial read shows
  // the most meaningful story without a click.
  const [trendType, setTrendType] = useState(null);

  // If the mean pace slowed between the earlier and recent sets by more than
  // this, the HR drop is likely pace-driven (easier effort), not fitness,
  // so we flag it. Pace drifting FASTER is a pure win on both axes and is
  // never flagged: a lower HR at a faster pace is unambiguously fitness.
  const PACE_DRIFT_WARN = 0.15; // min/km ≈ 9 s/km

  const toggleType = (t) => {
    const next = new Set(activeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    // Empty set is intentional: it means "All" mode.
    setActiveTypes(next);
  };
  const selectAll = () => setActiveTypes(new Set());

  const W = 640;
  const H = 260;
  const M = { l: 48, r: 20, t: 22, b: 40 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  // Filter out recovery (outlier HR band) and any run missing valid HR data
  // (e.g. Amazfit exports without HR, they'd otherwise drag bounds to 0).
  // Same predicate on both windows so the comparison is like for like.
  const keep = (r) => r.type !== 'recovery' && hasValidHr(r);
  const inView = useMemo(() => runs.filter(keep), [runs]);
  const priorView = useMemo(() => priorRuns.filter(keep), [priorRuns]);

  // Comparison across every type. Drives the frame so prior-window runs
  // fit, and stays stable while type chips change.
  const allCmp = useMemo(() => pickComparison(inView, priorView), [inView, priorView]);

  // Comparison for the visible subset (type chips applied to both sets).
  const cmp = useMemo(() => {
    if (isAllMode) return allCmp;
    const f = (r) => activeTypes.has(r.type);
    return pickComparison(inView.filter(f), priorView.filter(f));
  }, [allCmp, inView, priorView, activeTypes, isAllMode]);

  // Outer bounds = full extent of the plotted data, used as the un-zoomed
  // frame and as the clamp for pan/zoom. Field naming matches the generic
  // useScatterZoom contract (xMin/xMax/yMin/yMax).
  // X axis = HR (low→high, left-to-right). Y axis = Pace, with smaller
  // min/km values rendered at the top (faster).
  const outerBounds = useMemo(() => {
    const pts = allCmp.plotted;
    if (!pts.length) return { yMin: 3.5, yMax: 7, xMin: 120, xMax: 190 };
    let paceMin = Infinity, paceMax = -Infinity, hrMin = Infinity, hrMax = -Infinity;
    pts.forEach((r) => {
      if (r.pace < paceMin) paceMin = r.pace;
      if (r.pace > paceMax) paceMax = r.pace;
      if (r.hr < hrMin) hrMin = r.hr;
      if (r.hr > hrMax) hrMax = r.hr;
    });
    const paceP = (paceMax - paceMin) * 0.08 || 0.3;
    const hrP = (hrMax - hrMin) * 0.1 || 5;
    return {
      yMin: paceMin - paceP,
      yMax: paceMax + paceP,
      xMin: Math.floor((hrMin - hrP) / 5) * 5,
      xMax: Math.ceil((hrMax + hrP) / 5) * 5,
    };
  }, [allCmp]);

  const { view, xFor, yFor, isZoomed, reset, svgEvents } = useScatterZoom({
    outerBounds, plotW, plotH, M,
  });

  // Runs from the previous window: muted, and flagged in the tooltip.
  // Clicking one opens it in RunCards as an out-of-range card.
  const priorIds = useMemo(
    () => new Set(cmp.mode === 'prior' ? cmp.earlier.map((r) => r.id) : []),
    [cmp],
  );
  const earlierIds = useMemo(() => new Set(cmp.earlier.map((r) => r.id)), [cmp]);

  // Pace ticks live at clean *display* values (e.g. 5:00, 5:30 min/km or
  // 8:00, 9:00 min/mi); each carries the km-denominated pace used by yFor.
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

  const hrTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(view.xMin / 10) * 10;
    for (let hr = first; hr <= view.xMax; hr += 10) ticks.push(hr);
    return ticks;
  }, [view]);

  const bandReadouts = useMemo(() => {
    // "All" leads the row as an aggregate reference across every type.
    // Each type picks its own comparison: previous window when it has
    // enough runs of that type, otherwise halves of the selected window.
    const types = ['all', 'easy', 'tempo', 'intervals', 'long'];

    return types.map((t) => {
      const c = t === 'all'
        ? allCmp
        : pickComparison(inView.filter((r) => r.type === t), priorView.filter((r) => r.type === t));
      if (!c.enough) return { type: t, enough: false };
      const { earlier: early, recent: late } = c;

      const earlyHr = mean(early.map((r) => r.hr));
      const lateHr = mean(late.map((r) => r.hr));
      const delta = lateHr - earlyHr;
      const pct = (delta / earlyHr) * 100;

      const earlyPace = mean(early.map((r) => r.pace));
      const latePace = mean(late.map((r) => r.pace));
      const paceDelta = latePace - earlyPace;
      // Positive paceDelta = recent set slower. Only the "slower" direction
      // makes the HR drop ambiguous; drifting faster is strictly a win.
      const paceDrifted = paceDelta >= PACE_DRIFT_WARN;

      return {
        type: t, enough: true, mode: c.mode,
        earlyHr, lateHr, delta, pct,
        earlyPace, latePace, paceDelta, paceDrifted,
        earlyN: early.length, lateN: late.length,
        earlyLabel: c.earlyLabel, lateLabel: c.lateLabel,
      };
    });
  }, [allCmp, inView, priorView]);

  // Biggest clean HR drop across the specific-type bands, used as the
  // default active card when the user hasn't clicked one yet.
  const winnerType = useMemo(() => {
    const wins = bandReadouts.filter((b) => b.type !== 'all' && b.enough && b.delta < 0 && !b.paceDrifted);
    if (!wins.length) return null;
    return wins.reduce((a, b) => (a.delta < b.delta ? a : b)).type;
  }, [bandReadouts]);
  const activeTrend = trendType ?? winnerType ?? 'tempo';

  // Chart summary for the visible subset: the mean of each set (arrow
  // ends) plus the core region around each mean, in screen coordinates so
  // the shapes follow zoom/pan.
  const trend = useMemo(() => {
    if (!cmp.enough) return null;
    const { earlier: early, recent: late } = cmp;
    const earlyHr = mean(early.map((r) => r.hr));
    const lateHr = mean(late.map((r) => r.hr));
    const earlyPace = mean(early.map((r) => r.pace));
    const latePace = mean(late.map((r) => r.pace));
    const startX = xFor(earlyHr), startY = yFor(earlyPace);
    const endX = xFor(lateHr), endY = yFor(latePace);
    const pts = (list) => list.map((r) => ({ x: xFor(r.hr), y: yFor(r.pace) }));
    return {
      startX, startY, endX, endY,
      earlyRegion: coreRegion(pts(early), startX, startY),
      lateRegion: coreRegion(pts(late), endX, endY),
      earlyN: early.length, lateN: late.length,
      earlyLabel: cmp.earlyLabel, lateLabel: cmp.lateLabel,
    };
  }, [cmp, view]);

  const caption = comparisonCaption(cmp, rangeName, rangeKey);

  const showMetric = (r) => {
    const hour = Math.floor(r.duration / 60);
    const min = Math.floor(r.duration % 60);
    return (
      <>
        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
        <div style={{ opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
          {typeMeta[r.type].label} · {r.routeName}
        </div>
        <div className="t-row"><span>Pace</span><span>{fmtPaceUnit(r.pace, units)}{paceUnit(units)}</span></div>
        <div className="t-row"><span>Avg HR</span><span>{fmtHr(r)}</span></div>
        <div className="t-row"><span>Distance</span><span>{fmtDistance(r.distance, units, 2)} {distUnit(units)}</span></div>
        <div className="t-row"><span>Duration</span><span>{hour ? `${hour}h ${pad(min)}m` : `${min}m`}</span></div>
        {r.temp != null && <div className="t-row"><span>Temp</span><span>{fmtTemp(r.temp, tempUnits)}{tempUnit(tempUnits)}</span></div>}
        {isInterrupted(r, stoppedThreshold) && (
          <div className="t-row"><span>Stopped</span><span>{Math.round(r.stoppedRatio * 100)}%</span></div>
        )}
        {r.pr && <div className="t-row" style={{ marginTop: 4 }}><span style={{ color: 'var(--positive)' }}>● PR</span><span /></div>}
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
          <div className="stat-label" style={{ marginBottom: 4 }}>Aerobic Efficiency</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5 }}>
            Every run plotted by <b>heart rate × pace</b>. As you get fitter, dots drift <b>up-left</b>: faster pace at a <i>lower</i> HR.
            Your selected period is compared with the same-length period before it (or split in half when there is no earlier data).
            Each shaded region holds the middle half of that period&rsquo;s runs: <span style={{ color: 'var(--inkMuted)' }}>dashed</span> for earlier,{' '}
            <b style={{ color: 'var(--accent)' }}>solid</b> for recent. The arrow joins their averages and shows the direction of progress.
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            {...svgEvents}
            style={{ width: '100%', height: 'auto', display: 'block', ...svgEvents.style }}
          >
            <defs>
              <clipPath id="ae-plot-clip">
                <rect x={M.l} y={M.t} width={plotW} height={plotH} />
              </clipPath>
            </defs>
            {hrTicks.map((hr, i) => (
              <g key={`hr-${hr}`}>
                <line
                  x1={xFor(hr)} x2={xFor(hr)}
                  y1={M.t} y2={H - M.b}
                  stroke="var(--ruleSoft)" strokeWidth={1}
                  strokeDasharray={i === 0 || i === hrTicks.length - 1 ? '0' : '2 3'}
                />
                <text x={xFor(hr)} y={H - M.b + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>{hr}</text>
              </g>
            ))}

            {paceTicks.map((p) => (
              <g key={`p-${p.disp}`}>
                <line x1={M.l} x2={W - M.r} y1={yFor(p.km)} y2={yFor(p.km)} stroke="var(--ruleSoft)" strokeWidth={1} />
                <text x={M.l - 8} y={yFor(p.km) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>{fmtPace(p.disp)}</text>
              </g>
            ))}

            <text
              x={M.l - 36} y={M.t + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${M.l - 36} ${M.t + plotH / 2})`}
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >Pace ({paceUnitLong(units)}) · faster ↑</text>
            <text
              x={M.l + plotW / 2} y={H - 6}
              textAnchor="middle"
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >Avg HR (bpm)</text>

            {/* Direction-of-progress hint: dotted (not dashed, to stay distinct
                from the "early" trend) arrow pointing up-left — faster pace
                (higher Y) at lower HR (lower X). Text-free; the "improving"
                corner label below names the destination. */}
            <g opacity="0.5">
              <defs>
                <marker id="ae-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
                </marker>
              </defs>
              <line
                x1={W - M.r - 16} y1={H - M.b - 14}
                x2={M.l + 32} y2={M.t + 18}
                stroke="var(--inkMuted)" strokeWidth={1}
                strokeDasharray="1 4"
                strokeLinecap="round"
                markerEnd="url(#ae-arrow)"
              />
            </g>

            {/* Corner labels naming each quadrant's meaning, mirroring the
                compact tile. X = HR (low→high), Y = pace (faster up): so the
                top-left corner (fast pace, low HR) is "improving", bottom-right
                (slow pace, high HR) is "declining". Drawn outside the plot clip
                so they stay pinned to the frame through pan/zoom. */}
            <g style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 11, fill: 'var(--inkSoft)', opacity: 0.7 }}>
              <text x={M.l + 6} y={M.t + 14} textAnchor="start">improving</text>
              <text x={M.l + plotW - 6} y={M.t + 14} textAnchor="end">more effort</text>
              <text x={M.l + 6} y={M.t + plotH - 6} textAnchor="start">less effort</text>
              <text x={M.l + plotW - 6} y={M.t + plotH - 6} textAnchor="end">declining</text>
            </g>

            <g clipPath="url(#ae-plot-clip)">
            {/* Context dots: earlier set first (muted), recent set on top. */}
            {cmp.plotted
              .slice()
              .sort((a, b) => (earlierIds.has(b.id) - earlierIds.has(a.id)) || a.date.localeCompare(b.date))
              .map((r) => {
                const cx = xFor(r.hr);
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

            {/* Core regions: middle half of each set around its mean, then
                 the arrow from earlier mean to recent mean. Non-interactive
                 so dots underneath stay hoverable. */}
            {trend && (
              <g style={{ pointerEvents: 'none' }}>
                <defs>
                  <marker id="ae-prog-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
                  </marker>
                </defs>
                {trend.earlyRegion && (
                  <path d={trend.earlyRegion} fill="var(--inkMuted)" fillOpacity={0.14} stroke="var(--inkSoft)" strokeWidth={1.4} strokeDasharray="4 3" />
                )}
                {trend.lateRegion && (
                  <path d={trend.lateRegion} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeWidth={1.8} />
                )}
                <line
                  x1={trend.startX} y1={trend.startY}
                  x2={trend.endX} y2={trend.endY}
                  stroke="var(--accent)" strokeWidth={1.8}
                  markerEnd="url(#ae-prog-arrow)"
                />
                <circle cx={trend.startX} cy={trend.startY} r={3} fill="var(--inkSoft)" />
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

          <ComparisonLegend trend={trend} caption={caption} indent={M.l} />
        </div>

        <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 16 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--inkMuted)',
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
          }}>
            <span>HR × pace · per type</span>
            <span style={{ fontStyle: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 10.5, color: 'var(--inkMuted)' }}>Click to drive the highlight →</span>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--inkMuted)', marginBottom: 10,
            fontStyle: 'italic', fontFamily: 'var(--serif)',
          }}>
            Same comparison, per type: previous period when it has at least 4 runs of that type, otherwise the selected period split in half. We compare the mean HR and show each set&rsquo;s mean pace. If pace drifted between the two, the HR delta may be pace-driven (not fitness) and gets flagged.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {bandReadouts.map((b) => {
              const isActive = activeTrend === b.type;
              const color = b.type === 'all' ? 'var(--ink)' : `var(--type-${b.type})`;
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
                        {fmtPace(paceToDisplay(b.earlyPace, units))} → {fmtPace(paceToDisplay(b.latePace, units))}
                      </span>
                    ) : (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)' }}>n/a</span>
                    )}
                  </div>
                  {b.enough && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                        <span className="num" style={{ fontSize: 26, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>
                          {Math.round(b.lateHr)}
                        </span>
                        <span className="mono muted" style={{ fontSize: 10 }}>bpm</span>
                        <span style={{ flex: 1 }} />
                        <span
                          className="num"
                          style={{
                            fontSize: 12,
                            color: b.delta < -0.5 ? 'var(--positive)' : b.delta > 0.5 ? 'var(--inkSoft)' : 'var(--inkMuted)',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.delta < 0 ? '↓' : b.delta > 0 ? '↑' : '='} {Math.abs(b.delta).toFixed(1)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--inkSoft)', fontFamily: 'var(--mono)' }}>
                        <span>{Math.round(b.earlyHr)}</span>
                        <span style={{ flex: 1, height: 2, background: 'var(--ruleSoft)', position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 0, top: -1,
                            width: `${Math.min(100, Math.max(5, Math.abs(b.pct) * 8))}%`,
                            height: 4,
                            background: b.delta < 0 ? 'var(--positive)' : 'var(--type-tempo)',
                            opacity: 0.7,
                          }} />
                        </span>
                        <span>{Math.round(b.lateHr)}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--inkMuted)', fontFamily: 'var(--mono)' }}>
                        {b.earlyN} {b.mode === 'prior' ? 'before' : 'earlier'} · {b.lateN} recent
                      </div>
                      <div style={{ marginTop: 2, fontSize: 9.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', opacity: 0.8 }}>
                        {b.earlyLabel} · {b.lateLabel}
                      </div>
                      {b.paceDrifted && (
                        <div style={{
                          marginTop: 6, fontSize: 10, fontFamily: 'var(--mono)',
                          color: 'var(--type-tempo)', fontStyle: 'italic',
                        }}>
                          ⚠ pace shifted {b.paceDelta > 0 ? '+' : '−'}{Math.abs(b.paceDelta * 60 * paceK).toFixed(0)}s{paceUnit(units)}; delta may be pace-driven
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {(() => {
        // Highlight reflects the active card (user's click, or the winner
        // by default). Four branches: no data, HR held/crept up, HR
        // dropped but pace shifted, and the clean-gain success case.
        const band = bandReadouts.find((b) => b.type === activeTrend);
        const label = band ? (band.type === 'all' ? 'Overall' : typeMeta[band.type].label) : '';

        if (!band || !band.enough) {
          return <Highlight tone="muted">Not enough separation yet. Keep logging runs to build the trend.</Highlight>;
        }
        if (band.delta >= 0) {
          return (
            <Highlight tone="muted">
              <HlNum>{label}</HlNum>: average HR held steady or crept up ({Math.abs(band.delta).toFixed(1)} bpm) vs the earlier runs. No clear fitness gain in this window.
            </Highlight>
          );
        }
        if (band.paceDrifted) {
          return (
            <Highlight tone="muted">
              <HlNum>{label}</HlNum>: HR dropped <HlNum>{Math.abs(band.delta).toFixed(1)} bpm</HlNum>, but pace shifted too, so the gain may be pace-driven, not fitness.
            </Highlight>
          );
        }
        return (
          <Highlight>
            <HlNum>{label}</HlNum>: average HR dropped{' '}
            <HlNum>{Math.abs(band.delta).toFixed(1)} bpm</HlNum>{' '}
            at similar pace (<HlNum>{fmtPace(paceToDisplay(band.earlyPace, units))} → {fmtPace(paceToDisplay(band.latePace, units))}</HlNum>). You&rsquo;re doing the same work with less effort.
          </Highlight>
        );
      })()}
    </div>
  );
}
