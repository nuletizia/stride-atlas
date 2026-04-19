'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, pad,
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
  const typeMeta = data.typeMeta;

  const [activeTypes, setActiveTypes] = useState(
    () => new Set(['easy', 'tempo', 'long', 'intervals', 'race'])
  );

  const toggleType = (t) => {
    const next = new Set(activeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    if (next.size === 0) next.add(t);
    setActiveTypes(next);
  };

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

  const distTicks = useMemo(() => {
    const step = bounds.distMax > 30 ? 10 : bounds.distMax > 15 ? 5 : 2;
    const ticks = [];
    const first = Math.ceil(bounds.distMin / step) * step;
    for (let d = first; d <= bounds.distMax; d += step) ticks.push(d);
    return ticks;
  }, [bounds]);

  const paceTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(bounds.paceMin * 2) / 2;
    for (let p = first; p <= bounds.paceMax; p += 0.5) ticks.push(p);
    return ticks;
  }, [bounds]);

  // Split the window in half by date; fit a log-linear line through each
  // half: pace = a + b * log(distance). Each fit only applies *inside* the
  // distance range it was built on — we never extrapolate.
  //
  // Heuristic: need at least 4 runs per half AND a decent distance spread
  // (>30% of overall range) to believe the slope. With a tight type filter
  // (e.g. just "intervals"), distances are near-uniform and the slope is
  // noise; we skip the fit and say so, rather than drawing a misleading line.
  const MIN_N = 4;
  const MIN_SPREAD_RATIO = 0.25;

  const trends = useMemo(() => {
    const filtered = inView.filter((r) => activeTypes.has(r.type));
    const globalSpread = bounds.distMax - bounds.distMin;
    if (filtered.length < MIN_N * 2) {
      return { early: null, late: null, reason: 'need at least 8 runs in this filter' };
    }
    const midT = dateRange.start + (dateRange.end - dateRange.start) / 2;
    const early = filtered.filter((r) => new Date(r.date).getTime() < midT);
    const late = filtered.filter((r) => new Date(r.date).getTime() >= midT);

    function fit(pts) {
      if (pts.length < MIN_N) return null;
      const dates = pts.map((r) => r.date).sort();
      const dists = pts.map((r) => r.distance);
      const dLo = Math.min(...dists);
      const dHi = Math.max(...dists);
      // Narrow distance band → fit slope is unreliable. Better to show nothing.
      if (globalSpread > 0 && (dHi - dLo) / globalSpread < MIN_SPREAD_RATIO) {
        return { narrow: true, n: pts.length, from: dates[0], to: dates[dates.length - 1] };
      }
      const xs = pts.map((r) => Math.log(Math.max(0.5, r.distance)));
      const ys = pts.map((r) => r.pace);
      const n = xs.length;
      const mx = xs.reduce((a, v) => a + v, 0) / n;
      const my = ys.reduce((a, v) => a + v, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) ** 2;
      }
      if (den === 0) return { narrow: true, n: pts.length, from: dates[0], to: dates[dates.length - 1] };
      const b = num / den;
      const a = my - b * mx;
      return { a, b, n, from: dates[0], to: dates[dates.length - 1], dLo, dHi };
    }
    const earlyFit = fit(early);
    const lateFit = fit(late);
    let reason = null;
    if (!earlyFit || !lateFit) reason = 'need at least 4 runs in each half';
    else if (earlyFit.narrow || lateFit.narrow) reason = 'distance range too narrow to fit a curve';
    return { early: earlyFit, late: lateFit, reason };
  }, [inView, activeTypes, dateRange, bounds]);

  function fmtRange(from, to) {
    if (!from || !to) return '';
    const f = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return `${f(from)} → ${f(to)}`;
  }

  function trendPath(fit) {
    if (!fit || fit.narrow || fit.a == null) return null;
    // Clip to each half's own distance range — we never extrapolate the fit
    // outside the interval of data it was built on.
    const lo = Math.max(0.5, fit.dLo);
    const hi = fit.dHi;
    if (hi <= lo) return null;
    const segs = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const d = lo + (i / steps) * (hi - lo);
      const p = fit.a + fit.b * Math.log(d);
      if (p < bounds.paceMin || p > bounds.paceMax) continue;
      segs.push(`${segs.length === 0 ? 'M' : 'L'} ${xFor(d)} ${yFor(p)}`);
    }
    return segs.join(' ');
  }

  const showMetric = (r) => {
    const hour = Math.floor(r.duration / 60);
    const min = Math.floor(r.duration % 60);
    return (
      <>
        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
        <div style={{ opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>
          {typeMeta[r.type].label} · {r.routeName}
        </div>
        <div className="t-row"><span>Distance</span><span>{r.distance.toFixed(2)} km</span></div>
        <div className="t-row"><span>Pace</span><span>{fmtPace(r.pace)}/km</span></div>
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
          <div className="stat-label" style={{ marginBottom: 4 }}>Distance × Pace Curve</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5 }}>
            Every run plotted by <b>distance × pace</b>. Fast pace is at the top of the chart; longer runs
            sit to the right. The cloud naturally slopes toward the lower-right (longer = slower). We split
            your visible window in half by date and fit a curve through each half — when the <b>recent</b>
            curve sits <b>above</b> the <b>early</b> one, you&rsquo;re running faster at every distance.
            <br/>
            <span className="muted" style={{ fontSize: 12 }}>
              Tip: the trend curves are most meaningful with many workout types visible. Filtering to a single
              type can hide the curves if there aren&rsquo;t enough runs or the distances are too similar.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Show</span>
          <div className="chip-row">
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
          <g key={`p-${p}`}>
            <line x1={M.l} x2={W - M.r} y1={yFor(p)} y2={yFor(p)} stroke="var(--ruleSoft)" strokeWidth={1} />
            <text x={M.l - 8} y={yFor(p) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>
              {fmtPace(p)}
            </text>
          </g>
        ))}

        {/* Grid — vertical distance lines */}
        {distTicks.map((d, i) => (
          <g key={`d-${d}`}>
            <line
              x1={xFor(d)} x2={xFor(d)}
              y1={M.t} y2={H - M.b}
              stroke="var(--ruleSoft)" strokeWidth={1}
              strokeDasharray={i === 0 || i === distTicks.length - 1 ? '0' : '2 3'}
            />
            <text x={xFor(d)} y={H - M.b + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>
              {d}km
            </text>
          </g>
        ))}

        <text
          x={M.l - 36} y={M.t + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${M.l - 36} ${M.t + plotH / 2})`}
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Pace (min/km)</text>
        <text
          x={M.l + plotW / 2} y={H - 6}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >Distance (km)</text>

        {/* Trend lines: early (muted) + recent (strong) */}
        {trends?.early && (
          <path d={trendPath(trends.early)} fill="none" stroke="var(--inkSoft)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.55} />
        )}
        {trends?.late && (
          <path d={trendPath(trends.late)} fill="none" stroke="var(--ink)" strokeWidth={1.6} opacity={0.85} />
        )}

        {/* Dots — older first so newer sits on top */}
        {inView
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((r) => {
            if (!activeTypes.has(r.type)) return null;
            const cx = xFor(r.distance);
            const cy = yFor(r.pace);
            const rec = recencyOf(r.date);
            const isHover = hovered?.runId === r.id;
            const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
            const dim = hovered && !isHover && !isMatch;
            const size = 3.2 + Math.sqrt(r.distance) * 0.55;
            const fillOp = dim ? 0.1 : (0.25 + rec * 0.65);

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
                  fill={`var(--type-${r.type})`}
                  fillOpacity={fillOp}
                  stroke={isHover ? 'var(--ink)' : 'none'}
                  strokeWidth={isHover ? 1.5 : 0}
                />
                {r.pr && !dim && (
                  <circle cx={cx} cy={cy} r={size + 2} fill="none" stroke={`var(--type-${r.type})`} strokeWidth={1} opacity={0.8} />
                )}
              </g>
            );
          })}

        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />
      </svg>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, marginTop: 8, paddingLeft: M.l,
        fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)',
        textTransform: 'uppercase', letterSpacing: '.08em',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={24} height={6}><line x1={0} x2={24} y1={3} y2={3} stroke="var(--inkSoft)" strokeWidth={1.2} strokeDasharray="3 2" opacity={0.6} /></svg>
          early {trends?.early && !trends.early.narrow && (
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--inkSoft)' }}>
              · {fmtRange(trends.early.from, trends.early.to)} · {trends.early.n} runs
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={24} height={6}><line x1={0} x2={24} y1={3} y2={3} stroke="var(--ink)" strokeWidth={1.6} /></svg>
          recent {trends?.late && !trends.late.narrow && (
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
              · {fmtRange(trends.late.from, trends.late.to)} · {trends.late.n} runs
            </span>
          )}
        </span>
        {trends?.reason && (
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--accent)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
            — trend curves hidden: {trends.reason}
          </span>
        )}
      </div>
    </div>
  );
}
