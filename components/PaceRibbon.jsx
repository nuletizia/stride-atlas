'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useAnalysisRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr, isInterrupted,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  distUnit, paceUnit, paceUnitLong, efOf, stamOf, MI_PER_KM,
  Highlight, HlNum,
} from '@/lib/shared';

export default function PaceRibbon() {
  const data = useData();
  const runs = useAnalysisRuns();
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus, selectedRunId } = useLink();
  const { show, hide } = useTooltip();
  const { metric, units, stoppedThreshold } = useTweaks();
  // Types the user clicked to focus. Empty = the default stack of ribbons;
  // otherwise one larger chart with only these types on a shared axis.
  const [focusTypes, setFocusTypes] = useState(() => new Set());
  const toggleFocus = (t) => {
    setFocusTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const types = ['easy', 'tempo', 'intervals', 'recovery', 'long', 'race'];
  // Rendered rows — "all" sits at the top as a combined overview alongside
  // the per-type rows. It's excluded from the per-type highlight candidates
  // below so the one-liner stays about a specific workout type.
  const rowTypes = ['all', ...types];
  const meta = data.typeMeta;
  const labelFor = (t) => (t === 'all' ? 'All runs' : meta[t].label);
  const colorFor = (t) => (t === 'all' ? 'var(--ink)' : `var(--type-${t})`);

  const byType = useMemo(() => {
    const o = {};
    types.forEach((t) => (o[t] = []));
    runs.forEach((r) => o[r.type]?.push(r));
    o.all = [...runs];
    Object.values(o).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return o;
  }, [runs]);

  const [xMin, xMax] = useMemo(() => {
    if (!runs.length) return [0, 0];
    const sorted = runs.map((r) => new Date(r.date + 'T00:00:00').getTime()).sort((a, b) => a - b);
    return [sorted[0], sorted[sorted.length - 1]];
  }, [runs]);

  const W = 860;
  const H_ROW = 58;
  // LEFT gutter fits the type label + the start-of-window value label
  // (e.g. "5:28 /km") with some breathing room between them.
  const LEFT = 130;
  // RIGHT gutter fits the end-of-window value label with its unit — worst
  // case "5:28 /km" at fontSize 10.5 (~52px) plus offset from plot edge.
  const RIGHT = 64;
  const PLOT_W = W - LEFT - RIGHT;

  // efOf (speed ÷ HR) and stamOf (EF × distance^0.1) are shared helpers in
  // lib/shared.jsx — see imports above.

  const valueOf = (r) =>
    metric === 'pace' ? r.pace :
    metric === 'distance' ? r.distance :
    metric === 'hr' ? r.hr :
    metric === 'stamina' ? stamOf(r) :
    efOf(r); // efficiency

  // Higher-is-better metrics invert the y axis so "drift up = improvement"
  // holds visually for every metric.
  const higherIsBetter = metric === 'distance' || metric === 'efficiency' || metric === 'stamina';

  // Metrics that require a valid HR reading. In these modes we drop runs
  // without HR so they don't poison the bounds.
  const needsHr = metric === 'hr' || metric === 'efficiency' || metric === 'stamina';

  // Convention: "improvement drifts UP visually" across all metrics.
  function getY(r, bounds) {
    const v = valueOf(r);
    const t = (v - bounds.min) / (bounds.max - bounds.min || 1);
    const clamped = higherIsBetter ? 1 - t : t;
    return 10 + clamped * (H_ROW - 20);
  }
  function xFor(r) {
    const t = new Date(r.date + 'T00:00:00').getTime();
    return ((t - xMin) / (xMax - xMin || 1)) * PLOT_W;
  }
  // 5-run centered rolling average, in metric units. Each view maps the
  // values to its own coordinates.
  function rollingVals(arr) {
    const win = 5;
    return arr.map((r, i) => {
      const from = Math.max(0, i - Math.floor(win / 2));
      const to = Math.min(arr.length, i + Math.ceil(win / 2));
      const slice = arr.slice(from, to);
      return { r, v: slice.reduce((a, x) => a + valueOf(x), 0) / slice.length };
    });
  }
  function rollingAvg(arr, bounds) {
    return rollingVals(arr).map(({ r, v }) => {
      const t = (v - bounds.min) / (bounds.max - bounds.min || 1);
      const clamped = higherIsBetter ? 1 - t : t;
      return { x: xFor(r), y: 10 + clamped * (H_ROW - 20), value: v };
    });
  }

  // One interactive run dot (tooltip, hover linking, two-tap focus, PR and
  // selected rings). Shared by the ribbon stack and the focus chart. Click
  // stops propagation so it opens the run instead of toggling row focus.
  function renderDot(r, cx, cy, color, fillOpacity = 1) {
    const isHover = hovered?.runId === r.id;
    const isSelected = selectedRunId === r.id;
    const isMatch = hovered && (hovered.type === r.type || hovered.routeId === r.routeId);
    const dim = hovered && !isHover && !isMatch && !isSelected;
    return (
      <g
        key={r.id}
        data-tap-focus="true"
        opacity={dim ? 0.15 : 1}
        style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => {
          setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
          show(
            <>
              <span className="t-title">{fmtDate(r.date, { year: true })}</span>
              <div style={{ opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
                {meta[r.type].label} · {r.routeName}
              </div>
              <div className="t-row"><span>{metricLabel}</span><span>{
                metric === 'pace' ? `${fmtPaceUnit(r.pace, units)} ${metricUnit}` :
                metric === 'distance' ? `${fmtDistance(r.distance, units, 2)} ${metricUnit}` :
                metric === 'hr' ? fmtHr(r) :
                metric === 'stamina' ? (stamOf(r) != null ? stamOf(r).toFixed(2) : '—') :
                (efOf(r) != null ? efOf(r).toFixed(2) : '—')
              }</span></div>
              <div className="t-row"><span>Distance</span><span>{fmtDistance(r.distance, units, 2)} {distUnit(units)}</span></div>
              {isInterrupted(r, stoppedThreshold) && <div className="t-row"><span>Stopped</span><span>{Math.round(r.stoppedRatio * 100)}%</span></div>}
              {r.pr && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>PR</div>}
            </>,
            e.clientX, e.clientY
          );
        }}
        onMouseLeave={() => {
          if (isTouch && pendingFocusId === r.id) return;
          setHovered(null); hide();
        }}
        onClick={(e) => { e.stopPropagation(); if (requestFocus(r.id)) { setHovered(null); hide(); } }}
      >
        <circle cx={cx} cy={cy} r={r.pr ? 4 : 2.8} fill={color} fillOpacity={fillOpacity} />
        {r.pr && <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--ink)" strokeWidth={1} opacity={fillOpacity < 1 ? 0.35 : 1} />}
        {isHover && <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--ink)" opacity={0.5} />}
        {isSelected && <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--accent)" strokeWidth={1.8} />}
      </g>
    );
  }

  const fmtMetric = (v) =>
    metric === 'pace' ? fmtPace(paceToDisplay(v, units)) :
    metric === 'distance' ? kmToDisplay(v, units).toFixed(1) :
    metric === 'hr' ? `${Math.round(v)}` :
    v.toFixed(2); // efficiency / stamina

  const metricLabel = { pace: 'Pace', distance: 'Distance', hr: 'Avg HR', efficiency: 'Efficiency', stamina: 'Stamina' }[metric];
  const metricUnit = {
    pace: paceUnitLong(units),
    distance: distUnit(units),
    hr: 'bpm',
    efficiency: '',
    stamina: '',
  }[metric];
  // Descriptive unit shown once in the panel subtitle, so each row's value
  // labels stay clean (no repeated "/km" × 6 rows).
  const metricUnitLabel = {
    pace: paceUnitLong(units),
    distance: distUnit(units),
    hr: 'bpm',
    efficiency: 'speed ÷ HR',
    stamina: 'efficiency × distance',
  }[metric];


  // ---------- Focus view: selected types on one shared, labelled axis ----------
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;   // min/km → min/display
  const distK = units === 'mi' ? MI_PER_KM : 1;       // km → display
  function niceStep(range, target = 5) {
    const raw = range / target || 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / pow;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * pow;
  }

  function renderFocus() {
    const FW = W, FH = 320;
    const M = { l: 58, r: 78, t: 14, b: 34 };
    const PW = FW - M.l - M.r, PH = FH - M.t - M.b;
    const sets = rowTypes
      .filter((t) => focusTypes.has(t))
      .map((t) => {
        let arr = byType[t] || [];
        if (needsHr) arr = arr.filter(hasValidHr);
        arr = arr.filter((r) => valueOf(r) != null);
        return { type: t, arr };
      })
      .filter((x) => x.arr.length);

    const chips = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        {rowTypes.filter((t) => (byType[t] || []).length).map((t) => (
          <button
            key={t}
            className={`chip ${focusTypes.has(t) ? 'active' : ''}`}
            aria-pressed={focusTypes.has(t)}
            onClick={() => toggleFocus(t)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorFor(t), display: 'inline-block' }} />
            {labelFor(t)}
          </button>
        ))}
        <button className="chip" style={{ marginLeft: 'auto' }} onClick={() => setFocusTypes(new Set())}>
          All ribbons
        </button>
      </div>
    );
    if (!sets.length) {
      return (
        <>
          {chips}
          <Highlight tone="muted">No runs of these types have {metricLabel.toLowerCase()} data in this view.</Highlight>
        </>
      );
    }

    // Shared bounds: 2nd–98th percentile of every selected run's value, so a
    // single outlier can't flatten the lines.
    const vals = sets.flatMap((s) => s.arr.map(valueOf)).sort((a, b) => a - b);
    const q = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * f)))];
    let lo = q(0.02), hi = q(0.98);
    const pad = (hi - lo) * 0.08 || Math.abs(lo) * 0.05 || 1;
    lo -= pad; hi += pad;
    const ts = sets.flatMap((s) => s.arr.map((r) => new Date(r.date + 'T00:00:00').getTime()));
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    const fx = (r) => M.l + ((new Date(r.date + 'T00:00:00').getTime() - t0) / ((t1 - t0) || 1)) * PW;
    // Improvement reads as up for every metric.
    const fy = (v) => {
      const t = (v - lo) / ((hi - lo) || 1);
      return M.t + (higherIsBetter ? 1 - t : t) * PH;
    };

    // Y ticks at clean values in display units, converted back to km units.
    const toDisp = metric === 'pace' ? (v) => v * paceK : metric === 'distance' ? (v) => v * distK : (v) => v;
    const fromDisp = metric === 'pace' ? (d) => d / paceK : metric === 'distance' ? (d) => d / distK : (d) => d;
    const dLo = Math.min(toDisp(lo), toDisp(hi)), dHi = Math.max(toDisp(lo), toDisp(hi));
    const step = metric === 'pace' ? (units === 'mi' ? 1 : 0.5)
      : metric === 'hr' ? (dHi - dLo > 40 ? 10 : 5)
      : niceStep(dHi - dLo);
    const fmtTick = (d) => metric === 'pace' ? fmtPace(d)
      : metric === 'distance' ? (step < 1 ? d.toFixed(1) : d.toFixed(0))
      : metric === 'hr' ? String(Math.round(d))
      : d.toFixed(2);
    const yTicks = [];
    for (let d = Math.ceil(dLo / step) * step; d <= dHi + 1e-9; d += step) yTicks.push(d);

    // Month ticks; every 1, 2 or 3 months depending on the span.
    const months = (t1 - t0) / (30 * 86400000);
    const mStep = months > 14 ? 3 : months > 6 ? 2 : 1;
    const xTicks = [];
    const d0 = new Date(t0); d0.setDate(1); d0.setMonth(d0.getMonth() + 1);
    for (const d = new Date(d0); d.getTime() <= t1; d.setMonth(d.getMonth() + mStep)) xTicks.push(new Date(d));

    const many = sets.length > 1;
    const lines = sets.map(({ type, arr }) => {
      const roll = rollingVals(arr);
      return {
        type, arr, roll,
        d: roll.map((p, i) => `${i ? 'L' : 'M'} ${fx(p.r).toFixed(1)} ${fy(p.v).toFixed(1)}`).join(' '),
        first: roll[0].v, last: roll[roll.length - 1].v,
      };
    });
    // End labels in the right gutter, nudged apart so they never overlap.
    const ends = lines
      .map((l) => ({ type: l.type, y: fy(l.last), v: l.last, improved: higherIsBetter ? l.last > l.first : l.last < l.first }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

    return (
      <>
        {chips}
        <div className="mobile-scroll-fade" style={{ overflowX: 'auto' }}>
          <svg width={FW} height={FH} style={{ display: 'block' }} role="img" aria-label={`${metricLabel} over time for selected workout types`}>
            <defs>
              <clipPath id="ribbon-focus-clip"><rect x={M.l - 9} y={M.t - 9} width={PW + 18} height={PH + 18} /></clipPath>
            </defs>
            {yTicks.map((d) => (
              <g key={`y-${d}`}>
                <line x1={M.l} x2={M.l + PW} y1={fy(fromDisp(d))} y2={fy(fromDisp(d))} stroke="var(--ruleSoft)" />
                <text x={M.l - 8} y={fy(fromDisp(d)) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>{fmtTick(d)}</text>
              </g>
            ))}
            {xTicks.map((d) => {
              const x = M.l + ((d.getTime() - t0) / ((t1 - t0) || 1)) * PW;
              return (
                <g key={`x-${d.getTime()}`}>
                  <line x1={x} x2={x} y1={M.t} y2={M.t + PH} stroke="var(--ruleSoft)" strokeDasharray="2 3" />
                  <text x={x} y={M.t + PH + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>
                    {d.toLocaleDateString('en-US', { month: 'short' })}{d.getMonth() === 0 ? ` '${String(d.getFullYear()).slice(2)}` : ''}
                  </text>
                </g>
              );
            })}
            <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke="var(--rule)" />
            <text
              x={14} y={M.t + PH / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${M.t + PH / 2})`}
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.08em', textTransform: 'uppercase' }}
            >
              {metricLabel}{metricUnitLabel ? ` (${metricUnitLabel})` : ''} · better ↑
            </text>
            <g clipPath="url(#ribbon-focus-clip)">
              {lines.map((l) => l.arr.map((r) => renderDot(r, fx(r), fy(valueOf(r)), colorFor(l.type), many ? 0.45 : 0.6)))}
              {lines.map((l) => (
                <path key={`line-${l.type}`} d={l.d} fill="none" stroke={colorFor(l.type)} strokeWidth={2.4} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
              ))}
            </g>
            {ends.map((e) => (
              <g key={`end-${e.type}`}>
                <text x={M.l + PW + 8} y={e.y + 3.5} style={{ fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, fill: e.improved ? 'var(--positive)' : 'var(--ink)' }}>
                  {fmtMetric(e.v)}
                </text>
                <circle cx={M.l + PW + 64} cy={e.y} r={3.5} fill={colorFor(e.type)} />
              </g>
            ))}
          </svg>
        </div>
      </>
    );
  }

  if (!runs.length) return null;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Trend Ribbons</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 520 }}>
            {metricLabel}{metricUnitLabel && (
              <span className="mono muted" style={{ fontSize: 11, marginLeft: 6 }}>
                ({metricUnitLabel})
              </span>
            )} over time.{' '}
            {focusTypes.size > 0 ? (
              <>Showing <b>{rowTypes.filter((t) => focusTypes.has(t)).map(labelFor).join(', ')}</b> on one shared axis. Line = 5-run rolling average.</>
            ) : (
              <>Top ribbon is <b>All runs</b>; each row below is a single workout type. The line is a 5-run rolling average; watch it drift up as fitness climbs. <b>Click a ribbon to focus it.</b></>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <svg width={14} height={14} style={{ display: 'block' }}>
              <circle cx={7} cy={7} r={2.4} fill="var(--ink)" />
              <circle cx={7} cy={7} r={5.5} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
            </svg>
            ringed dot = latest run, or open card
          </div>
        </div>
        <MetricToggle />
      </div>

      {focusTypes.size > 0 && renderFocus()}
      {focusTypes.size === 0 && (() => {
      // Pre-filter so empty rows (e.g. "recovery" with no runs) don't
      // reserve vertical space below the last rendered ribbon.
      const rowsToRender = rowTypes
        .map((type) => {
          let arr = byType[type] || [];
          if (needsHr) arr = arr.filter(hasValidHr);
          return arr.length ? { type, arr } : null;
        })
        .filter(Boolean);
      return (
      <div className="mobile-scroll-fade" style={{ overflowX: 'auto' }}>
        <svg width={W} height={rowsToRender.length * H_ROW + 20} style={{ display: 'block' }}>
          {rowsToRender.map(({ type, arr }, ri) => {
            const values = arr.map(valueOf);
            const bounds = {
              min: Math.min(...values) * 0.98,
              max: Math.max(...values) * 1.02,
            };
            if (bounds.max - bounds.min < 0.2) bounds.max = bounds.min + 0.2;

            const rolling = rollingAvg(arr, bounds);
            const pathD = rolling.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
            const color = colorFor(type);

            // Start/end rolling-avg labels — one at each end of the line so
            // the user can read "where I started → where I am now" at a glance.
            // Labels sit in the LEFT and RIGHT gutters (outside the plot) and
            // are vertically centered on the rolling point's y, so the label's
            // vertical position reflects its value. A lower label means a
            // better pace/HR (or a longer distance in distance mode).
            const firstRoll = rolling[0];
            const lastRoll = rolling[rolling.length - 1];
            // Did the metric improve? For higher-is-better metrics (distance,
            // efficiency), improvement means the line went up.
            const improved = higherIsBetter
              ? lastRoll.value > firstRoll.value
              : lastRoll.value < firstRoll.value;

            return (
              <g
                key={type}
                transform={`translate(0, ${ri * H_ROW})`}
                className="ribbon-row"
                role="button"
                tabIndex={0}
                aria-label={`Focus ${labelFor(type)}`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onClick={() => toggleFocus(type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFocus(type); }
                }}
              >
                {/* Row hit area + hover fill; the CSS lives in globals. */}
                <rect className="ribbon-row-bg" x={-6} y={0} width={W + 6} height={H_ROW} rx={3} fill="transparent" />
                <text
                  x={0} y={H_ROW / 2 + 4}
                  style={{ fontFamily: 'var(--sans)', fontSize: 13, fill: 'var(--ink)', fontWeight: 500 }}
                >
                  {labelFor(type)}
                </text>
                <text
                  x={0} y={H_ROW / 2 + 19}
                  style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}
                >
                  {arr.length} runs
                </text>

                <g transform={`translate(${LEFT}, 0)`}>
                  <line x1={0} x2={PLOT_W} y1={H_ROW - 6} y2={H_ROW - 6} stroke="var(--ruleSoft)" />

                  <path d={pathD} fill="none" stroke={color} strokeWidth={1.4} opacity={0.55} />

                  {/* Start value — anchored in the LEFT gutter, vertically
                       centered on the rolling line's starting y. Unit lives
                       in the subtitle, not here, to keep each row clean. */}
                  <text
                    x={-12}
                    y={firstRoll.y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', fontWeight: 500 }}
                  >
                    {fmtMetric(firstRoll.value)}
                  </text>
                  {/* End value — anchored in the RIGHT gutter at the line's
                       ending y; bold + positive color when improved. */}
                  <text
                    x={PLOT_W + 12}
                    y={lastRoll.y}
                    textAnchor="start"
                    dominantBaseline="middle"
                    style={{
                      fontFamily: 'var(--mono)', fontSize: 10.5,
                      fill: improved ? 'var(--positive)' : 'var(--ink)',
                      fontWeight: 600,
                    }}
                  >
                    {fmtMetric(lastRoll.value)}
                  </text>

                  {arr.map((r) => renderDot(r, xFor(r), getY(r, bounds), color))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      );
      })()}

      {(() => {
        const candidates = types
          .map((t) => {
            let arr = byType[t] || [];
            if (needsHr) arr = arr.filter(hasValidHr);
            if (arr.length < 10) return null;
            const first = arr.slice(0, 5).map(valueOf);
            const last = arr.slice(-5).map(valueOf);
            const firstMean = first.reduce((a, v) => a + v, 0) / first.length;
            const lastMean = last.reduce((a, v) => a + v, 0) / last.length;
            const improvement = higherIsBetter ? lastMean - firstMean : firstMean - lastMean;
            const rel = firstMean > 0 ? improvement / firstMean : 0;
            return { type: t, firstMean, lastMean, improvement, rel };
          })
          .filter(Boolean);
        const winners = candidates.filter((c) => c.improvement > 0);
        if (!winners.length) {
          return <Highlight tone="muted">Not enough runs of a single type yet in this view. 10+ per type makes this line richer.</Highlight>;
        }
        const best = winners.sort((a, b) => b.rel - a.rel)[0];
        const label = meta[best.type].label;
        if (metric === 'pace') {
          return (
            <Highlight>
              <HlNum>{label}</HlNum> pace has drifted faster: rolling avg{' '}
              <HlNum>{fmtPace(paceToDisplay(best.firstMean, units))} → {fmtPace(paceToDisplay(best.lastMean, units))} {paceUnit(units)}</HlNum> across this window.
            </Highlight>
          );
        }
        if (metric === 'hr') {
          return (
            <Highlight>
              <HlNum>{label}</HlNum> HR is trending down: rolling avg{' '}
              <HlNum>{Math.round(best.firstMean)} → {Math.round(best.lastMean)} bpm</HlNum> across this window.
            </Highlight>
          );
        }
        if (metric === 'efficiency') {
          return (
            <Highlight>
              <HlNum>{label}</HlNum> efficiency is climbing: rolling avg{' '}
              <HlNum>{best.firstMean.toFixed(2)} → {best.lastMean.toFixed(2)}</HlNum> (speed / HR) across this window.
            </Highlight>
          );
        }
        if (metric === 'stamina') {
          return (
            <Highlight>
              <HlNum>{label}</HlNum> stamina is climbing: rolling avg{' '}
              <HlNum>{best.firstMean.toFixed(2)} → {best.lastMean.toFixed(2)}</HlNum> (efficiency × distance) across this window.
            </Highlight>
          );
        }
        return (
          <Highlight>
            Your <HlNum>{label}</HlNum> runs are getting longer: rolling avg{' '}
            <HlNum>{kmToDisplay(best.firstMean, units).toFixed(1)} → {kmToDisplay(best.lastMean, units).toFixed(1)} {distUnit(units)}</HlNum> across this window.
          </Highlight>
        );
      })()}
    </div>
  );
}

function MetricToggle() {
  const { metric, setMetric } = useTweaks();
  const opts = [
    { id: 'pace', label: 'Pace' },
    { id: 'distance', label: 'Distance' },
    { id: 'hr', label: 'Heart' },
    // Efficiency and Stamina are compound metrics — accent border flags them
    // as visually distinct from the single-axis metrics above.
    { id: 'efficiency', label: 'Efficiency', compound: true, title: 'Speed (m/min) ÷ avg HR; higher = more efficient' },
    { id: 'stamina', label: 'Stamina', compound: true, title: 'Efficiency × distance^0.1; rewards holding efficiency over longer runs' },
  ];
  return (
    <div className="chip-row">
      {opts.map((o) => (
        <button
          key={o.id}
          className={`chip ${metric === o.id ? 'active' : ''}`}
          onClick={() => setMetric(o.id)}
          style={o.compound ? { borderLeft: '3px solid var(--accent)' } : undefined}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
