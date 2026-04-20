'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr, pad,
  fmtDistance, fmtPaceUnit, paceToDisplay,
  MI_PER_KM, distUnit, paceUnit, paceUnitLong,
  Highlight, HlNum,
} from '@/lib/shared';

export default function AerobicEfficiency() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered } = useLink();
  const { show, hide } = useTooltip();
  const { units } = useTweaks();
  const typeMeta = data.typeMeta;
  // min/km → min/display-unit (1 for km; 1/MI_PER_KM for miles).
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;

  // Empty set = "All" mode: every type visible, dots rendered in a neutral
  // ink color so the cloud reads as one population. Clicking a type chip
  // drops into colored-by-type mode.
  const [activeTypes, setActiveTypes] = useState(() => new Set());
  const isAllMode = activeTypes.size === 0;
  const [trendType, setTrendType] = useState('tempo');

  // If the median pace slowed between early and late halves by more than
  // this, the HR drop is likely pace-driven (easier effort), not fitness,
  // so we flag it. Pace drifting FASTER is a pure win on both axes and is
  // never flagged — a lower HR at a faster pace is unambiguously fitness.
  const PACE_DRIFT_WARN = 0.15; // min/km ≈ 9 s/km

  const toggleType = (t) => {
    const next = new Set(activeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    // Empty set is intentional — it means "All" mode.
    setActiveTypes(next);
  };
  const selectAll = () => setActiveTypes(new Set());

  const W = 640;
  const H = 360;
  const M = { l: 48, r: 20, t: 22, b: 40 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;

  // Filter out recovery (outlier HR band) and any run missing valid HR data
  // (e.g. Amazfit exports without HR — they'd otherwise drag bounds to 0).
  const inView = useMemo(
    () => runs.filter((r) => r.type !== 'recovery' && hasValidHr(r)),
    [runs]
  );

  const bounds = useMemo(() => {
    if (!inView.length) return { paceMin: 3.5, paceMax: 7, hrMin: 120, hrMax: 190 };
    let paceMin = Infinity, paceMax = -Infinity, hrMin = Infinity, hrMax = -Infinity;
    inView.forEach((r) => {
      if (r.pace < paceMin) paceMin = r.pace;
      if (r.pace > paceMax) paceMax = r.pace;
      if (r.hr < hrMin) hrMin = r.hr;
      if (r.hr > hrMax) hrMax = r.hr;
    });
    const paceP = (paceMax - paceMin) * 0.08 || 0.3;
    const hrP = (hrMax - hrMin) * 0.1 || 5;
    return {
      paceMin: paceMin - paceP,
      paceMax: paceMax + paceP,
      hrMin: Math.floor((hrMin - hrP) / 5) * 5,
      hrMax: Math.ceil((hrMax + hrP) / 5) * 5,
    };
  }, [inView]);

  // X: HR (low → high, left-to-right natural).
  // Y: Pace, inverted so fastest pace (smallest min/km value) sits at the top
  // — improvement reads as "up-left": faster pace at lower HR.
  const xFor = (hr) => M.l + ((hr - bounds.hrMin) / (bounds.hrMax - bounds.hrMin)) * plotW;
  const yFor = (pace) => M.t + ((pace - bounds.paceMin) / (bounds.paceMax - bounds.paceMin)) * plotH;

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

  // Pace ticks live at clean *display* values (e.g. 5:00, 5:30 min/km or
  // 8:00, 9:00 min/mi); each carries the km-denominated pace used by xFor.
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

  const hrTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(bounds.hrMin / 10) * 10;
    for (let hr = first; hr <= bounds.hrMax; hr += 10) ticks.push(hr);
    return ticks;
  }, [bounds]);

  const bandReadouts = useMemo(() => {
    const types = ['easy', 'tempo', 'long', 'intervals'];
    const range = dateRange.end - dateRange.start || 1;
    const midpoint = dateRange.start + range * 0.5;

    const medianOf = (arr) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };

    return types.map((t) => {
      const typeRuns = inView.filter((r) => r.type === t);
      if (typeRuns.length < 4) return { type: t, enough: false };

      const early = typeRuns.filter((r) => new Date(r.date).getTime() <= midpoint);
      const late = typeRuns.filter((r) => new Date(r.date).getTime() > midpoint);

      // Need ≥2 per half so each side is at least a short average, not a
      // single session. (Relaxed from 3; noisier but reaches more types.)
      if (early.length < 2 || late.length < 2) return { type: t, enough: false };

      const earlyHr = early.reduce((a, r) => a + r.hr, 0) / early.length;
      const lateHr = late.reduce((a, r) => a + r.hr, 0) / late.length;
      const delta = lateHr - earlyHr;
      const pct = (delta / earlyHr) * 100;

      const earlyPace = medianOf(early.map((r) => r.pace));
      const latePace = medianOf(late.map((r) => r.pace));
      const paceDelta = latePace - earlyPace;
      // Positive paceDelta = late half slower. Only the "slower" direction
      // makes the HR drop ambiguous; drifting faster is strictly a win.
      const paceDrifted = paceDelta >= PACE_DRIFT_WARN;

      const dateFmt = (iso) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const earlyDates = early.map((r) => r.date).sort();
      const lateDates = late.map((r) => r.date).sort();

      return {
        type: t, enough: true,
        earlyHr, lateHr, delta, pct,
        earlyPace, latePace, paceDelta, paceDrifted,
        earlyN: early.length, lateN: late.length,
        earlyLabel: `${dateFmt(earlyDates[0])} → ${dateFmt(earlyDates[earlyDates.length - 1])}`,
        lateLabel: `${dateFmt(lateDates[0])} → ${dateFmt(lateDates[lateDates.length - 1])}`,
      };
    });
  }, [inView, dateRange]);

  // Chart's trend lines match the readout cards exactly: mean HR of each
  // half (first 50% vs last 50%), plus each half's own median pace so the
  // reader sees *where* on the pace axis the HR sat.
  const trend = useMemo(() => {
    const band = bandReadouts.find((b) => b.type === trendType);
    if (!band || !band.enough) return null;
    return {
      startHr: band.earlyHr,
      endHr: band.lateHr,
      startPace: band.earlyPace,
      endPace: band.latePace,
      // HR now lives on the X axis, so the reference lines are vertical.
      startX: xFor(band.earlyHr),
      endX: xFor(band.lateHr),
      delta: band.delta,
      paceDrifted: band.paceDrifted,
    };
  }, [bandReadouts, trendType, bounds]);

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
        {r.pr && <div className="t-row" style={{ marginTop: 4 }}><span style={{ color: 'var(--positive)' }}>● PR</span><span /></div>}
      </>
    );
  };

  const TYPES_ALL = ['easy', 'tempo', 'long', 'intervals', 'race'];

  if (!inView.length) return null;

  return (
    <div className="panel" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 560 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>Aerobic Efficiency</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5 }}>
            Every run plotted by <b>heart rate × pace</b>. As you get fitter, dots drift <b>up-left</b> — faster pace at a <i>lower</i> HR.
            Color shows workout type; darker dots are more recent.
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
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
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

            <g opacity="0.5">
              <defs>
                <marker id="ae-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
                </marker>
              </defs>
              {/* Improvement points up-left: faster pace (higher Y position) at
                   lower HR (lower X position). Dotted style (not dashed) to
                   keep it visually distinct from the dashed "early" trend. */}
              <line
                x1={W - M.r - 16} y1={H - M.b - 14}
                x2={M.l + 32} y2={M.t + 18}
                stroke="var(--inkMuted)" strokeWidth={1}
                strokeDasharray="1 4"
                strokeLinecap="round"
                markerEnd="url(#ae-arrow)"
              />
              <text x={M.l + 40} y={M.t + 32} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, fill: 'var(--inkSoft)' }}>improving</text>
            </g>

            {trend && (isAllMode || activeTypes.has(trendType)) && (
              <g>
                {/* Two vertical reference lines at each half's mean HR. Labels
                     stack in the top-right of the plot to avoid colliding
                     with each other when the two HRs are close. */}
                <line x1={trend.startX} x2={trend.startX} y1={M.t} y2={H - M.b} stroke={`var(--type-${trendType})`} strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />
                <line x1={trend.endX} x2={trend.endX} y1={M.t} y2={H - M.b} stroke={`var(--type-${trendType})`} strokeWidth={1.5} opacity={0.7} />
                <text x={W - M.r - 6} y={M.t + 10} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: `var(--type-${trendType})`, opacity: 0.7 }}>
                  {typeMeta[trendType].label} · early · {Math.round(trend.startHr)} bpm @ {fmtPace(paceToDisplay(trend.startPace, units))}
                </text>
                <text x={W - M.r - 6} y={M.t + 22} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: `var(--type-${trendType})`, fontWeight: 600 }}>
                  recent · {Math.round(trend.endHr)} bpm @ {fmtPace(paceToDisplay(trend.endPace, units))} ({trend.delta >= 0 ? '+' : '−'}{Math.abs(Math.round(trend.delta))} bpm{trend.paceDrifted ? ' · pace shifted' : ''})
                </text>
              </g>
            )}

            {inView
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((r) => {
                const active = isAllMode || activeTypes.has(r.type);
                if (!active) return null;
                const cx = xFor(r.hr);
                const cy = yFor(r.pace);
                const rec = recencyOf(r.date);
                const isHover = hovered?.runId === r.id;
                const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
                const dim = hovered && !isHover && !isMatch;
                const size = 3.5 + Math.sqrt(r.distance) * 0.7;
                const fillOp = dim ? 0.1 : (0.25 + rec * 0.65);
                const stroke = dim ? 'none' : (isHover ? 'var(--ink)' : 'none');
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
                    <circle cx={cx} cy={cy} r={size} fill={fill} fillOpacity={fillOp} stroke={stroke} strokeWidth={isHover ? 1.5 : 0} />
                  </g>
                );
              })}

            <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />
          </svg>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 8, paddingLeft: M.l, fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.08em', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={24} height={6}>
                <line x1={0} x2={24} y1={3} y2={3} stroke={`var(--type-${trendType})`} strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} />
              </svg>
              early {trend && (
                <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--inkSoft)' }}>
                  · {typeMeta[trendType].label} · {Math.round(trend.startHr)} bpm @ {fmtPace(paceToDisplay(trend.startPace, units))}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={24} height={6}>
                <line x1={0} x2={24} y1={3} y2={3} stroke={`var(--type-${trendType})`} strokeWidth={1.6} />
              </svg>
              recent {trend && (
                <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
                  · {Math.round(trend.endHr)} bpm @ {fmtPace(paceToDisplay(trend.endPace, units))}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>older</span>
              <svg width={120} height={10} style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="recgrad" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--type-tempo)" stopOpacity={0.25} />
                    <stop offset="1" stopColor="var(--type-tempo)" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <rect width={120} height={10} fill="url(#recgrad)" rx={5} />
              </svg>
              <span>newer</span>
            </span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 16 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--inkMuted)',
            textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
          }}>
            <span>HR at typical pace · early vs recent</span>
            <span style={{ fontStyle: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 10.5, color: 'var(--inkMuted)' }}>Click to plot trend →</span>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--inkMuted)', marginBottom: 10,
            fontStyle: 'italic', fontFamily: 'var(--serif)',
          }}>
            The visible date range is split in half at its midpoint — runs before go into <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>early</b>, runs after into <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>recent</b>. Within each workout type we compare the average HR of the two halves (≥3 runs per half) and also show the median pace of each half — if pace drifted noticeably between the two, the HR delta is likely pace-driven and gets flagged.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {bandReadouts.map((b) => {
              const isActive = trendType === b.type;
              const color = `var(--type-${b.type})`;
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
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{typeMeta[b.type].label}</span>
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
                        {b.earlyN} early · {b.lateN} recent
                      </div>
                      <div style={{ marginTop: 2, fontSize: 9.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', opacity: 0.8 }}>
                        {b.earlyLabel} · {b.lateLabel}
                      </div>
                      {b.paceDrifted && (
                        <div style={{
                          marginTop: 6, fontSize: 10, fontFamily: 'var(--mono)',
                          color: 'var(--type-tempo)', fontStyle: 'italic',
                        }}>
                          ⚠ pace shifted {b.paceDelta > 0 ? '+' : '−'}{Math.abs(b.paceDelta * 60 * paceK).toFixed(0)}s{paceUnit(units)} — delta may be pace-driven
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
        // Any HR drop counts (delta < 0). Pace-drift still disqualifies —
        // otherwise the "gain" could be the runner slowing down, not fitness.
        const wins = bandReadouts.filter((b) => b.enough && b.delta < 0 && !b.paceDrifted);
        if (!wins.length) {
          const drifted = bandReadouts.filter((b) => b.enough && b.delta < 0 && b.paceDrifted);
          if (drifted.length) {
            return <Highlight tone="muted">Some HR drops look like fitness, but pace shifted between halves — hold pace steady within a type to get a cleaner read.</Highlight>;
          }
          return <Highlight tone="muted">Not enough separation yet — keep logging runs to build the trend.</Highlight>;
        }
        const best = wins.reduce((a, b) => (a.delta < b.delta ? a : b));
        return (
          <Highlight>
            Biggest fitness gain: <HlNum>{typeMeta[best.type].label}</HlNum> — average HR dropped{' '}
            <HlNum>{Math.abs(best.delta).toFixed(1)} bpm</HlNum>{' '}
            at similar pace (<HlNum>{fmtPace(paceToDisplay(best.earlyPace, units))} → {fmtPace(paceToDisplay(best.latePace, units))}</HlNum>). You&rsquo;re doing the same work with less effort.
          </Highlight>
        );
      })()}
    </div>
  );
}
