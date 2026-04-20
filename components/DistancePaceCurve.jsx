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
    const filtered = isAllMode ? inView : inView.filter((r) => activeTypes.has(r.type));
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
  }, [inView, activeTypes, isAllMode, dateRange, bounds]);

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
            if (!isAllMode && !activeTypes.has(r.type)) return null;
            const cx = xFor(r.distance);
            const cy = yFor(r.pace);
            const rec = recencyOf(r.date);
            const isHover = hovered?.runId === r.id;
            const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
            const dim = hovered && !isHover && !isMatch;
            const size = 3.2 + Math.sqrt(r.distance) * 0.55;
            const fillOp = dim ? 0.1 : (0.25 + rec * 0.65);
            const fill = isAllMode ? 'var(--ink)' : `var(--type-${r.type})`;

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
                  fill={fill}
                  fillOpacity={fillOp}
                  stroke={isHover ? 'var(--ink)' : 'none'}
                  strokeWidth={isHover ? 1.5 : 0}
                />
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          older
          <svg width={120} height={10} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="dpcrecgrad" x1="0" x2="1">
                <stop offset="0" stopColor="var(--type-tempo)" stopOpacity={0.25} />
                <stop offset="1" stopColor="var(--type-tempo)" stopOpacity={0.9} />
              </linearGradient>
            </defs>
            <rect width={120} height={10} fill="url(#dpcrecgrad)" rx={5} />
          </svg>
          newer
        </span>
        {trends?.reason && (
          <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--accent)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
            — trend curves hidden: {trends.reason}
          </span>
        )}
      </div>

      {(() => {
        const e = trends?.early, l = trends?.late;
        if (!e || !l || e.narrow || l.narrow) {
          return <Highlight tone="muted">Need more runs (or more distance spread) to fit a trend — keep logging to unlock this line.</Highlight>;
        }
        const lo = Math.max(e.dLo, l.dLo);
        const hi = Math.min(e.dHi, l.dHi);
        let dRef = hi > lo ? (lo + hi) / 2 : (l.dLo + l.dHi) / 2;
        dRef = dRef < 10 ? Math.max(1, Math.round(dRef)) : Math.round(dRef / 5) * 5;
        // If rounding pushed us outside the overlap, pull back in.
        if (hi > lo) dRef = Math.min(hi, Math.max(lo, dRef));
        const earlyPace = e.a + e.b * Math.log(dRef);
        const latePace = l.a + l.b * Math.log(dRef);
        const deltaSec = (earlyPace - latePace) * 60;
        const dRefDisp = kmToDisplay(dRef, units);
        const dRefDispLabel = dRefDisp < 10 ? dRefDisp.toFixed(1) : Math.round(dRefDisp);
        // Convert the per-km seconds delta into the displayed pace unit.
        const deltaSecDisp = deltaSec * paceK;
        if (deltaSec > 3) {
          return (
            <Highlight>
              You&rsquo;re running faster: at <HlNum>{dRefDispLabel} {distUnit(units)}</HlNum>, recent pace is{' '}
              <HlNum>{deltaSecDisp.toFixed(0)} s{paceUnit(units)}</HlNum> quicker than early pace{' '}
              (<HlNum>{fmtPace(paceToDisplay(earlyPace, units))} → {fmtPace(paceToDisplay(latePace, units))}</HlNum>). The cloud is drifting up.
            </Highlight>
          );
        }
        if (deltaSec < -3) {
          return (
            <Highlight tone="muted">
              At <HlNum>{dRefDispLabel} {distUnit(units)}</HlNum>, recent pace is <HlNum>{Math.abs(deltaSecDisp).toFixed(0)} s{paceUnit(units)}</HlNum> slower than early pace — a heavier stretch, or a shift in run mix.
            </Highlight>
          );
        }
        return (
          <Highlight tone="muted">
            Recent pace is holding steady against your earlier runs — the curve hasn&rsquo;t shifted yet.
          </Highlight>
        );
      })()}
    </div>
  );
}
