'use client';

import { useMemo } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useAnalysisRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr, isInterrupted,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  distUnit, paceUnit, paceUnitLong, efOf, stamOf,
  Highlight, HlNum,
} from '@/lib/shared';

export default function PaceRibbon() {
  const data = useData();
  const runs = useAnalysisRuns();
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus, selectedRunId } = useLink();
  const { show, hide } = useTooltip();
  const { metric, units, stoppedThreshold } = useTweaks();

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
  function rollingAvg(arr, bounds) {
    const pts = [];
    const win = 5;
    for (let i = 0; i < arr.length; i++) {
      const from = Math.max(0, i - Math.floor(win / 2));
      const to = Math.min(arr.length, i + Math.ceil(win / 2));
      const slice = arr.slice(from, to);
      const v = slice.reduce((a, r) => a + valueOf(r), 0) / slice.length;
      const t = (v - bounds.min) / (bounds.max - bounds.min || 1);
      const clamped = higherIsBetter ? 1 - t : t;
      pts.push({ x: xFor(arr[i]), y: 10 + clamped * (H_ROW - 20), value: v });
    }
    return pts;
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
            )} over time. Top ribbon is <b>All runs</b>; each row below is a single workout type. The line is a 5-run rolling average; watch it drift up as fitness climbs.
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

      {(() => {
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
              <g key={type} transform={`translate(0, ${ri * H_ROW})`}>
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

                  {arr.map((r) => {
                    const cx = xFor(r);
                    const cy = getY(r, bounds);
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
                        onClick={() => { if (requestFocus(r.id)) { setHovered(null); hide(); } }}
                      >
                        <circle cx={cx} cy={cy} r={r.pr ? 4 : 2.8} fill={color} />
                        {r.pr && <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--ink)" strokeWidth={1} />}
                        {isHover && <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--ink)" opacity={0.5} />}
                        {isSelected && <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--accent)" strokeWidth={1.8} />}
                      </g>
                    );
                  })}
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
