'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, pad,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  MI_PER_KM, distUnit, paceUnit, paceUnitLong,
  Highlight, HlNum,
} from '@/lib/shared';

// Distance × Pace scatter. Shows every run as a dot; x = distance, y = pace.
// Convention: standard math chart — fast pace (low value) at BOTTOM, slow at
// TOP. As fitness improves, the cloud shifts DOWN (and RIGHT for longer runs).
// Optional early-vs-recent LOWESS-style trend lines make the shift visible.

export default function DistancePaceCurve() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered } = useLink();
  const { show, hide } = useTooltip();
  const { units } = useTweaks();
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
  const H = 340;
  const M = { l: 48, r: 20, t: 22, b: 40 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  const inView = useMemo(() => runs.filter((r) => r.type !== 'recovery'), [runs]);

  const bounds = useMemo(() => {
    if (!inView.length) return { distMin: 0, distMax: 20, paceMin: 3.5, paceMax: 7 };
    let distMin = Infinity, distMax = -Infinity, paceMin = Infinity, paceMax = -Infinity;
    inView.forEach((r) => {
      if (r.distance < distMin) distMin = r.distance;
      if (r.distance > distMax) distMax = r.distance;
      if (r.pace < paceMin) paceMin = r.pace;
      if (r.pace > paceMax) paceMax = r.pace;
    });
    const dP = (distMax - distMin) * 0.05 || 1;
    const pP = (paceMax - paceMin) * 0.08 || 0.3;
    return {
      distMin: Math.max(0, distMin - dP),
      distMax: distMax + dP,
      paceMin: paceMin - pP,
      paceMax: paceMax + pP,
    };
  }, [inView]);

  // Standard chart: x→right as distance grows, y→down as pace grows (slower).
  const xFor = (d) => M.l + ((d - bounds.distMin) / (bounds.distMax - bounds.distMin)) * plotW;
  const yFor = (p) => M.t + ((p - bounds.paceMin) / (bounds.paceMax - bounds.paceMin)) * plotH;

  const dateRange = useMemo(() => {
    if (!inView.length) return { start: 0, end: 1 };
    const ts = inView.map((r) => new Date(r.date + 'T00:00:00').getTime());
    return { start: Math.min(...ts), end: Math.max(...ts) };
  }, [inView]);

  const recencyOf = (iso) => {
    const t = new Date(iso + 'T00:00:00').getTime();
    if (dateRange.end === dateRange.start) return 1;
    return (t - dateRange.start) / (dateRange.end - dateRange.start);
  };

  // (distance × pace) centroid for each half of the visible subset. Split
  // is count-based (sort by date, take halves) so a filter like "race" with
  // runs clustered near an event still gets a balanced early/recent split
  // instead of producing an empty early half. Both axes use median so
  // outlier long days don't drag the marker. Also carries n + date ranges
  // for the legend so the chart's early/recent language agrees everywhere.
  const centroids = useMemo(() => {
    const subset = inView.filter((r) => isAllMode || activeTypes.has(r.type));
    if (subset.length < 4) return null;
    const sorted = [...subset].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const early = sorted.slice(0, mid);
    const late = sorted.slice(mid);
    if (early.length < 2 || late.length < 2) return null;
    const medianOf = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const startDist = medianOf(early.map((r) => r.distance));
    const endDist = medianOf(late.map((r) => r.distance));
    const startPace = medianOf(early.map((r) => r.pace));
    const endPace = medianOf(late.map((r) => r.pace));
    const dateFmt = (iso) =>
      new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const earlyDates = early.map((r) => r.date).sort();
    const lateDates = late.map((r) => r.date).sort();
    return {
      startX: xFor(startDist), startY: yFor(startPace),
      endX: xFor(endDist), endY: yFor(endPace),
      startDist, endDist, startPace, endPace,
      earlyN: early.length, lateN: late.length,
      earlyLabel: `${dateFmt(earlyDates[0])} → ${dateFmt(earlyDates[earlyDates.length - 1])}`,
      lateLabel: `${dateFmt(lateDates[0])} → ${dateFmt(lateDates[lateDates.length - 1])}`,
    };
  }, [inView, activeTypes, isAllMode, bounds]);

  const scopeLabel = isAllMode
    ? 'All runs'
    : activeTypes.size === 1
      ? typeMeta[[...activeTypes][0]].label
      : `${activeTypes.size} types`;

  // Per-type (and "all") early/recent readouts for the endurance cards.
  // Same count-based split + median-of-both methodology as the chart
  // centroids, so the cards and the "+" markers agree exactly.
  const bandReadouts = useMemo(() => {
    const types = ['all', 'easy', 'tempo', 'long', 'intervals'];
    const medianOf = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    return types.map((t) => {
      const typeRuns = t === 'all' ? inView : inView.filter((r) => r.type === t);
      if (typeRuns.length < 4) return { type: t, enough: false };
      const sorted = [...typeRuns].sort((a, b) => a.date.localeCompare(b.date));
      const mid = Math.floor(sorted.length / 2);
      const early = sorted.slice(0, mid);
      const late = sorted.slice(mid);
      if (early.length < 2 || late.length < 2) return { type: t, enough: false };
      const startDist = medianOf(early.map((r) => r.distance));
      const endDist = medianOf(late.map((r) => r.distance));
      const startPace = medianOf(early.map((r) => r.pace));
      const endPace = medianOf(late.map((r) => r.pace));
      const distDelta = endDist - startDist;       // positive = longer now
      const paceDelta = startPace - endPace;        // positive = faster now (min/km drop)
      const dateFmt = (iso) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const earlyDates = early.map((r) => r.date).sort();
      const lateDates = late.map((r) => r.date).sort();
      return {
        type: t, enough: true,
        startDist, endDist, startPace, endPace,
        distDelta, paceDelta,
        earlyN: early.length, lateN: late.length,
        earlyLabel: `${dateFmt(earlyDates[0])} → ${dateFmt(earlyDates[earlyDates.length - 1])}`,
        lateLabel: `${dateFmt(lateDates[0])} → ${dateFmt(lateDates[lateDates.length - 1])}`,
      };
    });
  }, [inView]);

  // `null` until user clicks a card. While null, the highlight defaults to
  // the type with the biggest clean pace improvement, so the first read
  // shows the strongest endurance story without a click.
  const [trendType, setTrendType] = useState(null);
  const winnerType = useMemo(() => {
    const wins = bandReadouts.filter((b) => b.type !== 'all' && b.enough && b.paceDelta > 0);
    if (!wins.length) return null;
    return wins.reduce((a, b) => (a.paceDelta > b.paceDelta ? a : b)).type;
  }, [bandReadouts]);
  const activeTrend = trendType ?? winnerType ?? 'easy';

  // Distance ticks live at clean *display* values (2/5/10 km or 1/2/5 mi)
  // and carry the km position used by xFor.
  const distTicks = useMemo(() => {
    const dispMin = bounds.distMin * distK;
    const dispMax = bounds.distMax * distK;
    const step = dispMax > 30 ? 10 : dispMax > 15 ? 5 : dispMax > 8 ? 2 : 1;
    const ticks = [];
    const first = Math.ceil(dispMin / step) * step;
    for (let d = first; d <= dispMax; d += step) {
      ticks.push({ disp: d, km: d / distK });
    }
    return ticks;
  }, [bounds, distK]);

  const paceTicks = useMemo(() => {
    const dispMin = bounds.paceMin * paceK;
    const dispMax = bounds.paceMax * paceK;
    const step = units === 'mi' ? 1 : 0.5;
    const ticks = [];
    const first = Math.ceil(dispMin / step) * step;
    for (let p = first; p <= dispMax; p += step) {
      ticks.push({ disp: p, km: p / paceK });
    }
    return ticks;
  }, [bounds, paceK, units]);

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
        {r.pr && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>PR</div>}
      </>
    );
  };

  const TYPES_ALL = ['easy', 'tempo', 'long', 'intervals', 'race'];
  if (!inView.length) return null;

  return (
    <div className="panel" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 560 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>Aerobic Endurance</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5 }}>
            Every run plotted by <b>distance × pace</b>. Fast pace is at the top; longer runs sit to the
            right, and the cloud naturally slopes toward the lower-right (longer = slower).
            Hollow dots are early runs, filled dots are recent. The bold
            {' '}<b style={{ color: 'var(--accent)' }}>+</b> marks the <i>median</i> run of each half —
            arrow shows the direction of progress (up = faster, right = longer).
            Cards below break the story down by type — click one to drive the take-away.
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

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
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
          x={M.l - 36} y={M.t + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${M.l - 36} ${M.t + plotH / 2})`}
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Pace ({paceUnitLong(units)})</text>
        <text
          x={M.l + plotW / 2} y={H - 6}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Distance ({distUnit(units)})</text>

        {/* Improvement arrow — faster = up (pace axis inverts), longer = right. */}
        <g opacity="0.5">
          <defs>
            <marker id="dp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
            </marker>
          </defs>
          {/* Dotted (not dashed) so it doesn't echo the dashed "early" trend. */}
          <line
            x1={M.l + 32} y1={H - M.b - 14}
            x2={W - M.r - 16} y2={M.t + 18}
            stroke="var(--inkMuted)" strokeWidth={1}
            strokeDasharray="1 4"
            strokeLinecap="round"
            markerEnd="url(#dp-arrow)"
          />
          <text
            x={W - M.r - 30} y={M.t + 32}
            textAnchor="end"
            style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, fill: 'var(--inkSoft)' }}
          >improving</text>
        </g>

        {/* Dots — older first so newer sits on top */}
        {inView
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((r) => {
            if (!isAllMode && !activeTypes.has(r.type)) return null;
            const cx = xFor(r.distance);
            const cy = yFor(r.pace);
            const rec = recencyOf(r.date);
            const isHover = hovered?.runId === r.id;
            const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
            const dim = hovered && !isHover && !isMatch;
            const size = 3.2 + Math.sqrt(r.distance) * 0.55;
            const fillOp = dim ? 0.1 : (0.25 + rec * 0.65);
            const fillBase = isAllMode ? 'var(--ink)' : `var(--type-${r.type})`;
            // Shape always splits the cloud at the time-midpoint: early runs
            // are hollow rings, recent runs are filled discs. Color is ink in
            // "All" mode, type-colored when a type filter is active — shape
            // is orthogonal to color.
            const isHollow = rec < 0.5;

            return (
              <g
                key={r.id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
                  show(showMetric(r), e.clientX, e.clientY);
                }}
                onMouseMove={(e) => show(showMetric(r), e.clientX, e.clientY)}
                onMouseLeave={() => { setHovered(null); hide(); }}
              >
                <circle
                  cx={cx} cy={cy} r={size}
                  fill={isHollow ? 'none' : fillBase}
                  fillOpacity={fillOp}
                  stroke={isHollow ? fillBase : (isHover ? 'var(--ink)' : 'none')}
                  strokeOpacity={isHollow ? fillOp : 1}
                  strokeWidth={isHollow ? (isHover ? 1.8 : 1.2) : (isHover ? 1.5 : 0)}
                />
              </g>
            );
          })}

        {/* Direction-of-progress: plus-marker centroids joined by an
             accent arrow. Accent (not ink) so the summary pops against
             any type color in the cloud. Rendered after dots. */}
        {centroids && (
          <g>
            <defs>
              <marker id="dpc-prog-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
              </marker>
            </defs>
            <line
              x1={centroids.startX} y1={centroids.startY}
              x2={centroids.endX} y2={centroids.endY}
              stroke="var(--accent)" strokeWidth={1.8}
              markerEnd="url(#dpc-prog-arrow)"
            />
            <line x1={centroids.startX - 8} y1={centroids.startY} x2={centroids.startX + 8} y2={centroids.startY} stroke="var(--accent)" strokeWidth={2} opacity={0.65} />
            <line x1={centroids.startX} y1={centroids.startY - 8} x2={centroids.startX} y2={centroids.startY + 8} stroke="var(--accent)" strokeWidth={2} opacity={0.65} />
            <line x1={centroids.endX - 9} y1={centroids.endY} x2={centroids.endX + 9} y2={centroids.endY} stroke="var(--accent)" strokeWidth={3} />
            <line x1={centroids.endX} y1={centroids.endY - 9} x2={centroids.endX} y2={centroids.endY + 9} stroke="var(--accent)" strokeWidth={3} />
            <text x={W - M.r - 6} y={M.t + 10} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--inkSoft)' }}>
              {scopeLabel} · early · {fmtDistance(centroids.startDist, units, 1)} {distUnit(units)} @ {fmtPace(paceToDisplay(centroids.startPace, units))}
            </text>
            <text x={W - M.r - 6} y={M.t + 22} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--ink)', fontWeight: 600 }}>
              recent · {fmtDistance(centroids.endDist, units, 1)} {distUnit(units)} @ {fmtPace(paceToDisplay(centroids.endPace, units))}
            </text>
          </g>
        )}

        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />
      </svg>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, marginTop: 8, paddingLeft: M.l,
        fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)',
        textTransform: 'uppercase', letterSpacing: '.08em',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={10} height={10} style={{ display: 'block' }}>
            <circle cx={5} cy={5} r={3.2} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
          </svg>
          <svg width={12} height={12} style={{ display: 'block' }}>
            <line x1={1} y1={6} x2={11} y2={6} stroke="var(--accent)" strokeWidth={2} opacity={0.65} />
            <line x1={6} y1={1} x2={6} y2={11} stroke="var(--accent)" strokeWidth={2} opacity={0.65} />
          </svg>
          early {centroids && (
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--inkSoft)' }}>
              · {centroids.earlyLabel} · {centroids.earlyN} runs
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={10} height={10} style={{ display: 'block' }}>
            <circle cx={5} cy={5} r={3.2} fill="var(--ink)" />
          </svg>
          <svg width={12} height={12} style={{ display: 'block' }}>
            <line x1={1} y1={6} x2={11} y2={6} stroke="var(--accent)" strokeWidth={3} />
            <line x1={6} y1={1} x2={6} y2={11} stroke="var(--accent)" strokeWidth={3} />
          </svg>
          recent {centroids && (
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
              · {centroids.lateLabel} · {centroids.lateN} runs
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          older
          <svg width={120} height={10} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="dpcrecgrad" x1="0" x2="1">
                <stop offset="0" stopColor="var(--ink)" stopOpacity={0.15} />
                <stop offset="1" stopColor="var(--ink)" stopOpacity={0.9} />
              </linearGradient>
            </defs>
            <rect width={120} height={10} fill="url(#dpcrecgrad)" rx={5} />
          </svg>
          newer
        </span>
      </div>

      <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 16, marginTop: 16 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--inkMuted)',
          textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
        }}>
          <span>Distance × pace · early vs recent</span>
          <span style={{ fontStyle: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 10.5, color: 'var(--inkMuted)' }}>Click to drive the highlight →</span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--inkMuted)', marginBottom: 10,
          fontStyle: 'italic', fontFamily: 'var(--serif)',
        }}>
          Each card splits that type&rsquo;s runs by date — first half = <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>early</b>, second half = <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>recent</b> (≥2 per half). We show both median distance and median pace — distance growth and pace shift can move independently, so both deltas are always shown.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {bandReadouts.map((b) => {
            const isActive = activeTrend === b.type;
            const color = b.type === 'all' ? 'var(--ink)' : `var(--type-${b.type})`;
            const distArrow = b.enough && Math.abs(kmToDisplay(b.distDelta, units)) > 0.1
              ? (b.distDelta > 0 ? '↑' : '↓') : '=';
            const paceArrow = b.enough && Math.abs(b.paceDelta * 60 * paceK) > 1
              ? (b.paceDelta > 0 ? '↓' : '↑') : '=';
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
                  {!b.enough && <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)' }}>n/a</span>}
                </div>
                {b.enough && (
                  <>
                    {/* Distance row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                      <span className="mono muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>Dist</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--inkSoft)' }}>
                        {fmtDistance(b.startDist, units, 1)} → {fmtDistance(b.endDist, units, 1)}
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                          color: b.distDelta > 0.1 ? 'var(--positive)' : b.distDelta < -0.1 ? 'var(--inkSoft)' : 'var(--inkMuted)',
                        }}
                      >
                        {distArrow} {Math.abs(kmToDisplay(b.distDelta, units)).toFixed(1)}
                      </span>
                    </div>
                    {/* Pace row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                      <span className="mono muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>Pace</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--inkSoft)' }}>
                        {fmtPace(paceToDisplay(b.startPace, units))} → {fmtPace(paceToDisplay(b.endPace, units))}
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                          color: b.paceDelta > 0.02 ? 'var(--positive)' : b.paceDelta < -0.02 ? 'var(--inkSoft)' : 'var(--inkMuted)',
                        }}
                      >
                        {paceArrow} {Math.abs(b.paceDelta * 60 * paceK).toFixed(0)}s
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--inkMuted)', fontFamily: 'var(--mono)' }}>
                      {b.earlyN} early · {b.lateN} recent
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
          return <Highlight tone="muted">Not enough runs in this type yet — keep logging to unlock the endurance read.</Highlight>;
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
              <HlNum>{label}</HlNum>: same ground, faster. <HlNum>{paceStr}</HlNum> — that&rsquo;s <HlNum>{paceSec.toFixed(0)} s{paceUnit(units)}</HlNum> quicker at a similar distance.
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
