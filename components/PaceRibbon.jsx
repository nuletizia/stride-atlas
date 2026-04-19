'use client';

import { useMemo } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr,
} from '@/lib/shared';

export default function PaceRibbon() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered } = useLink();
  const { show, hide } = useTooltip();
  const { metric } = useTweaks();

  const types = ['intervals', 'tempo', 'race', 'long', 'easy', 'recovery'];
  const meta = data.typeMeta;

  const byType = useMemo(() => {
    const o = {};
    types.forEach((t) => (o[t] = []));
    runs.forEach((r) => o[r.type]?.push(r));
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
  const LEFT = 110;
  const RIGHT = 20;
  const PLOT_W = W - LEFT - RIGHT;

  // Convention: "improvement drifts UP visually" across all metrics.
  //   pace: lower = better → put LOW at top → clamped = t
  //   hr:   lower = better → put LOW at top → clamped = t
  //   distance: higher = better → put HIGH at top → clamped = 1 - t
  function getY(r, bounds) {
    const v = metric === 'pace' ? r.pace : metric === 'distance' ? r.distance : r.hr;
    const t = (v - bounds.min) / (bounds.max - bounds.min || 1);
    const clamped = metric === 'distance' ? 1 - t : t;
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
      const v = slice.reduce(
        (a, r) => a + (metric === 'pace' ? r.pace : metric === 'distance' ? r.distance : r.hr),
        0
      ) / slice.length;
      const t = (v - bounds.min) / (bounds.max - bounds.min || 1);
      const clamped = metric === 'distance' ? 1 - t : t;
      pts.push({ x: xFor(arr[i]), y: 10 + clamped * (H_ROW - 20) });
    }
    return pts;
  }

  const metricLabel = { pace: 'Pace', distance: 'Distance', hr: 'Avg HR' }[metric];
  const metricUnit = { pace: 'min/km', distance: 'km', hr: 'bpm' }[metric];

  if (!runs.length) return null;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Pace Ribbon</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 520 }}>
            {metricLabel} over time, stacked by workout type. The line is a 5-run rolling average — watch it
            drift up as fitness climbs.
          </div>
        </div>
        <MetricToggle />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={types.length * H_ROW + 20} style={{ display: 'block' }}>
          {types.map((type, ri) => {
            let arr = byType[type];
            // In HR mode, drop runs without a valid HR — else they poison the
            // bounds (min=0) and squash all real values into a tiny band.
            if (metric === 'hr') arr = arr.filter(hasValidHr);
            if (!arr.length) return null;
            const values = arr.map((r) =>
              metric === 'pace' ? r.pace : metric === 'distance' ? r.distance : r.hr
            );
            const bounds = {
              min: Math.min(...values) * 0.98,
              max: Math.max(...values) * 1.02,
            };
            if (bounds.max - bounds.min < 0.2) bounds.max = bounds.min + 0.2;

            const rolling = rollingAvg(arr, bounds);
            const pathD = rolling.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
            const color = `var(--type-${type})`;

            // Best-value label: sits at the "best" end of the row (top for
            // pace/HR where low is best; bottom for distance where high is best).
            const bestY = metric === 'distance' ? H_ROW - 10 : 14;
            const bestVal =
              metric === 'pace' ? fmtPace(bounds.min) :
              metric === 'distance' ? bounds.max.toFixed(1) :
              bounds.min.toFixed(0);

            return (
              <g key={type} transform={`translate(0, ${ri * H_ROW})`}>
                <text
                  x={0} y={H_ROW / 2 + 4}
                  style={{ fontFamily: 'var(--sans)', fontSize: 13, fill: 'var(--ink)', fontWeight: 500 }}
                >
                  {meta[type].label}
                </text>
                <text
                  x={0} y={H_ROW / 2 + 19}
                  style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}
                >
                  {arr.length} runs
                </text>

                <g transform={`translate(${LEFT}, 0)`}>
                  <line x1={0} x2={PLOT_W} y1={H_ROW - 6} y2={H_ROW - 6} stroke="var(--ruleSoft)" />
                  <text
                    x={PLOT_W + 4}
                    y={bestY}
                    style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--inkMuted)' }}
                  >
                    {bestVal}
                  </text>

                  <path d={pathD} fill="none" stroke={color} strokeWidth={1.4} opacity={0.55} />

                  {arr.map((r) => {
                    const cx = xFor(r);
                    const cy = getY(r, bounds);
                    const isHover = hovered?.runId === r.id;
                    const isMatch = hovered && (hovered.type === r.type || hovered.routeId === r.routeId);
                    const dim = hovered && !isHover && !isMatch;
                    return (
                      <g
                        key={r.id}
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
                              <div className="t-row"><span>{metricLabel}</span><span>{metric === 'pace' ? `${fmtPace(r.pace)} ${metricUnit}` : metric === 'distance' ? `${r.distance.toFixed(2)} ${metricUnit}` : fmtHr(r)}</span></div>
                              <div className="t-row"><span>Distance</span><span>{r.distance.toFixed(2)} km</span></div>
                              {r.pr && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>PR</div>}
                            </>,
                            e.clientX, e.clientY
                          );
                        }}
                        onMouseLeave={() => { setHovered(null); hide(); }}
                      >
                        <circle cx={cx} cy={cy} r={r.pr ? 4 : 2.8} fill={color} />
                        {r.pr && <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--ink)" strokeWidth={1} />}
                        {isHover && <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--ink)" opacity={0.5} />}
                      </g>
                    );
                  })}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MetricToggle() {
  const { metric, setMetric } = useTweaks();
  const opts = [
    { id: 'pace', label: 'Pace' },
    { id: 'distance', label: 'Distance' },
    { id: 'hr', label: 'Heart' },
  ];
  return (
    <div className="chip-row">
      {opts.map((o) => (
        <button
          key={o.id}
          className={`chip ${metric === o.id ? 'active' : ''}`}
          onClick={() => setMetric(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
