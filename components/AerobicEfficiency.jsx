'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useFilteredRuns,
  fmtDate, fmtPace, fmtHr, hasValidHr, pad,
} from '@/lib/shared';

function solve3(A, b) {
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-8) return null;
  const col = (m, c, col_) => m.map((row, i) => row.map((v, j) => (j === c ? col_[i] : v)));
  return [det(col(A, 0, b)) / d, det(col(A, 1, b)) / d, det(col(A, 2, b)) / d];
}

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
    const earlyCutoff = dateRange.start + range * 0.4;
    const lateCutoff = dateRange.start + range * 0.6;

    return types.map((t) => {
      const typeRuns = inView.filter((r) => r.type === t);
      if (typeRuns.length < 4) return { type: t, enough: false };

      const paces = typeRuns.map((r) => r.pace).sort((a, b) => a - b);
      const median = paces[Math.floor(paces.length / 2)];
      const bandLo = median - 0.35;
      const bandHi = median + 0.35;

      const inBand = typeRuns.filter((r) => r.pace >= bandLo && r.pace <= bandHi);
      const early = inBand.filter((r) => new Date(r.date).getTime() <= earlyCutoff);
      const late = inBand.filter((r) => new Date(r.date).getTime() >= lateCutoff);

      if (!early.length || !late.length) return { type: t, enough: false };

      const earlyHr = early.reduce((a, r) => a + r.hr, 0) / early.length;
      const lateHr = late.reduce((a, r) => a + r.hr, 0) / late.length;
      const delta = lateHr - earlyHr;
      const pct = (delta / earlyHr) * 100;
      const dateFmt = (iso) =>
        new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const earlyDates = early.map((r) => r.date).sort();
      const lateDates = late.map((r) => r.date).sort();

      return {
        type: t, enough: true,
        bandLo, bandHi, median,
        earlyHr, lateHr, delta, pct,
        earlyN: early.length, lateN: late.length,
        earlyLabel: `${dateFmt(earlyDates[0])} → ${dateFmt(earlyDates[earlyDates.length - 1])}`,
        lateLabel: `${dateFmt(lateDates[0])} → ${dateFmt(lateDates[lateDates.length - 1])}`,
      };
    });
  }, [inView, dateRange]);

  const trend = useMemo(() => {
    const sel = inView.filter((r) => r.type === trendType);
    if (sel.length < 4) return null;
    const paces = sel.map((r) => r.pace);
    const medianPace = paces.slice().sort((a, b) => a - b)[Math.floor(paces.length / 2)];

    const ts = sel.map((r) => new Date(r.date).getTime());
    const tMin = Math.min(...ts);
    const tNorm = ts.map((t) => (t - tMin) / 86400000);
    const n = sel.length;

    const sumT = tNorm.reduce((a, v) => a + v, 0);
    const sumP = sel.reduce((a, r) => a + r.pace, 0);
    const sumHr = sel.reduce((a, r) => a + r.hr, 0);
    const sumTT = tNorm.reduce((a, v) => a + v * v, 0);
    const sumPP = sel.reduce((a, r) => a + r.pace * r.pace, 0);
    const sumTP = sel.reduce((a, r, i) => a + tNorm[i] * r.pace, 0);
    const sumTHr = sel.reduce((a, r, i) => a + tNorm[i] * r.hr, 0);
    const sumPHr = sel.reduce((a, r) => a + r.pace * r.hr, 0);

    const A = [
      [n, sumT, sumP],
      [sumT, sumTT, sumTP],
      [sumP, sumTP, sumPP],
    ];
    const Y = [sumHr, sumTHr, sumPHr];
    const sol = solve3(A, Y);
    if (!sol) return null;
    const [c, a, b] = sol;

    const tMaxNorm = Math.max(...tNorm);
    const startHr = a * 0 + b * medianPace + c;
    const endHr = a * tMaxNorm + b * medianPace + c;

    return {
      startHr, endHr, medianPace,
      startY: yFor(startHr),
      endY: yFor(endHr),
      delta: endHr - startHr,
      days: tMaxNorm, n,
    };
  }, [inView, trendType, bounds]);

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
                  {typeMeta[trendType].label} · start · {Math.round(trend.startHr)} bpm @ {fmtPace(trend.medianPace)}
                </text>
                <text x={W - M.r - 6} y={trend.endY - 4} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: `var(--type-${trendType})`, fontWeight: 600 }}>
                  now · {Math.round(trend.endHr)} bpm @ {fmtPace(trend.medianPace)} ({trend.delta >= 0 ? '+' : '−'}{Math.abs(Math.round(trend.delta))})
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
            Compares average HR at each workout type&rsquo;s median pace, across the first 40% vs last 40% of the visible window — lower recent HR means you&rsquo;re running the same effort with less strain.
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
                        @ {fmtPace(b.median)}/km
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
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)',
            fontSize: 12.5, color: 'var(--inkSoft)', lineHeight: 1.55,
            fontStyle: 'italic', fontFamily: 'var(--serif)',
          }}>
            {(() => {
              const wins = bandReadouts.filter((b) => b.enough && b.delta < -1);
              if (!wins.length) return 'Not enough separation yet — run more in consistent pace bands to build the trend.';
              const best = wins.reduce((a, b) => (a.delta < b.delta ? a : b));
              return (
                <>
                  Biggest fitness gain: <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>{typeMeta[best.type].label}</b> — average HR dropped{' '}
                  <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>{Math.abs(best.delta).toFixed(1)} bpm</b>{' '}
                  at {fmtPace(best.median)}/km. You&rsquo;re doing the same work with less effort.
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
