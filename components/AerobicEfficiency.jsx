'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr, pad,
  Highlight, HlNum,
} from '@/lib/shared';

export default function AerobicEfficiency() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered } = useLink();
  const { show, hide } = useTooltip();
  const typeMeta = data.typeMeta;

  const [activeTypes, setActiveTypes] = useState(
    () => new Set(['easy', 'tempo', 'long', 'intervals', 'race'])
  );
  const [trendType, setTrendType] = useState('tempo');

  // If the median pace slowed between early and late halves by more than
  // this, the HR drop is likely pace-driven (easier effort), not fitness,
  // so we flag it. Pace drifting FASTER is a pure win on both axes and is
  // never flagged — a lower HR at a faster pace is unambiguously fitness.
  const PACE_DRIFT_WARN = 0.15; // min/km ≈ 9 s/km

  const toggleType = (t) => {
    const next = new Set(activeTypes);
    if (next.has(t)) next.delete(t); else next.add(t);
    if (next.size === 0) next.add(t);
    setActiveTypes(next);
  };

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

  const xFor = (pace) => M.l + ((pace - bounds.paceMin) / (bounds.paceMax - bounds.paceMin)) * plotW;
  const yFor = (hr) => M.t + (1 - (hr - bounds.hrMin) / (bounds.hrMax - bounds.hrMin)) * plotH;

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

  const paceTicks = useMemo(() => {
    const ticks = [];
    const first = Math.ceil(bounds.paceMin * 2) / 2;
    for (let p = first; p <= bounds.paceMax; p += 0.5) ticks.push(p);
    return ticks;
  }, [bounds]);

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

      // Need ≥3 per half so we're averaging multiple runs, not a single session.
      if (early.length < 3 || late.length < 3) return { type: t, enough: false };

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
      startY: yFor(band.earlyHr),
      endY: yFor(band.lateHr),
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
        <div className="t-row"><span>Pace</span><span>{fmtPace(r.pace)}/km</span></div>
        <div className="t-row"><span>Avg HR</span><span>{fmtHr(r)}</span></div>
        <div className="t-row"><span>Distance</span><span>{r.distance.toFixed(2)} km</span></div>
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
            Every run plotted by <b>pace × heart rate</b>. As you get fitter, dots drift <b>down-left</b> — faster <i>and</i> lower HR.
            Color shows workout type; darker dots are more recent.
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {hrTicks.map((hr) => (
              <g key={`hr-${hr}`}>
                <line x1={M.l} x2={W - M.r} y1={yFor(hr)} y2={yFor(hr)} stroke="var(--ruleSoft)" strokeWidth={1} />
                <text x={M.l - 8} y={yFor(hr) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>{hr}</text>
              </g>
            ))}

            {paceTicks.map((p, i) => (
              <g key={`p-${p}`}>
                <line
                  x1={xFor(p)} x2={xFor(p)}
                  y1={M.t} y2={H - M.b}
                  stroke="var(--ruleSoft)" strokeWidth={1}
                  strokeDasharray={i === 0 || i === paceTicks.length - 1 ? '0' : '2 3'}
                />
                <text x={xFor(p)} y={H - M.b + 16} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkMuted)' }}>{fmtPace(p)}</text>
              </g>
            ))}

            <text
              x={M.l - 36} y={M.t + plotH / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${M.l - 36} ${M.t + plotH / 2})`}
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >Avg HR (bpm)</text>
            <text
              x={M.l + plotW / 2} y={H - 6}
              textAnchor="middle"
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >Pace (min / km) · faster ←</text>

            <g opacity="0.5">
              <defs>
                <marker id="ae-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
                </marker>
              </defs>
              <line
                x1={W - M.r - 16} y1={M.t + 18}
                x2={M.l + 32} y2={H - M.b - 14}
                stroke="var(--inkSoft)" strokeWidth={1}
                strokeDasharray="3 3"
                markerEnd="url(#ae-arrow)"
              />
              <text x={M.l + 40} y={H - M.b - 20} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13, fill: 'var(--inkSoft)' }}>improving</text>
            </g>

            {trend && activeTypes.has(trendType) && (
              <g>
                <line x1={M.l} x2={W - M.r} y1={trend.startY} y2={trend.startY} stroke={`var(--type-${trendType})`} strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />
                <line x1={M.l} x2={W - M.r} y1={trend.endY} y2={trend.endY} stroke={`var(--type-${trendType})`} strokeWidth={1.5} opacity={0.7} />
                <text x={W - M.r - 6} y={trend.startY - 4} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: `var(--type-${trendType})`, opacity: 0.7 }}>
                  {typeMeta[trendType].label} · early · {Math.round(trend.startHr)} bpm @ {fmtPace(trend.startPace)}
                </text>
                <text x={W - M.r - 6} y={trend.endY - 4} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: `var(--type-${trendType})`, fontWeight: 600 }}>
                  recent · {Math.round(trend.endHr)} bpm @ {fmtPace(trend.endPace)} ({trend.delta >= 0 ? '+' : '−'}{Math.abs(Math.round(trend.delta))} bpm{trend.paceDrifted ? ' · pace shifted' : ''})
                </text>
              </g>
            )}

            {inView
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((r) => {
                const active = activeTypes.has(r.type);
                if (!active) return null;
                const cx = xFor(r.pace);
                const cy = yFor(r.hr);
                const rec = recencyOf(r.date);
                const isHover = hovered?.runId === r.id;
                const isMatch = hovered && !isHover && (hovered.type === r.type || hovered.routeId === r.routeId);
                const dim = hovered && !isHover && !isMatch;
                const size = 3.5 + Math.sqrt(r.distance) * 0.7;
                const fillOp = dim ? 0.1 : (0.25 + rec * 0.65);
                const stroke = dim ? 'none' : (isHover ? 'var(--ink)' : 'none');

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
                    <circle cx={cx} cy={cy} r={size} fill={`var(--type-${r.type})`} fillOpacity={fillOp} stroke={stroke} strokeWidth={isHover ? 1.5 : 0} />
                    {r.pr && !dim && (
                      <circle cx={cx} cy={cy} r={size + 2} fill="none" stroke={`var(--type-${r.type})`} strokeWidth={1} opacity={0.8} />
                    )}
                  </g>
                );
              })}

            <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />
          </svg>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, paddingLeft: M.l, fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
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
                        {fmtPace(b.earlyPace)} → {fmtPace(b.latePace)}
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
                          ⚠ pace shifted {b.paceDelta > 0 ? '+' : '−'}{Math.abs(b.paceDelta * 60).toFixed(0)}s/km — delta may be pace-driven
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
        // Only count wins where pace didn't drift — otherwise the "gain"
        // could be the runner slowing down, not getting fitter.
        const wins = bandReadouts.filter((b) => b.enough && b.delta < -1 && !b.paceDrifted);
        if (!wins.length) {
          const drifted = bandReadouts.filter((b) => b.enough && b.delta < -1 && b.paceDrifted);
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
            at similar pace (<HlNum>{fmtPace(best.earlyPace)} → {fmtPace(best.latePace)}</HlNum>). You&rsquo;re doing the same work with less effort.
          </Highlight>
        );
      })()}
    </div>
  );
}
