'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useExclusions, hasValidHr,
  fmtDate, fmtDistance, distUnit, fmtPaceUnit, paceUnit,
} from '@/lib/shared';
import {
  buildFitnessDuel, autoGrouping, periodKeyOf,
  DUEL_METRICS, DEFAULT_DUEL_METRIC, GROUPINGS, MIN_DUELS,
} from '@/lib/fitnessDuel';

// Panel picks persist per browser and are shared with the compact tile, so
// the tile shows the same story the full panel was last left on.
const PREFS_KEY = 'stride.fitnessDuel.v1';

function useFitnessDuelPrefs() {
  const [prefs, setPrefs] = useState({ metric: DEFAULT_DUEL_METRIC, group: null });
  useEffect(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) || 'null');
      if (p && typeof p === 'object') setPrefs((x) => ({ ...x, ...p }));
    } catch { /* stay on defaults */ }
  }, []);
  const update = useCallback((patch) => setPrefs((x) => {
    const next = { ...x, ...patch };
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);
  return [prefs, update];
}

const NOUN = { month: 'month', quarter: 'quarter', half: 'half year', year: 'year' };
export const groupNoun = (id) => NOUN[id] || 'period';

// Whole history minus excluded runs: the time range does not apply, since
// each period is ranked against every other one.
export function useFitnessDuel() {
  const data = useData();
  const { excluded } = useExclusions();
  const runs = useMemo(
    () => (excluded.size ? data.runs.filter((r) => !excluded.has(String(r.id))) : data.runs),
    [data.runs, excluded],
  );
  const [prefs, setPrefs] = useFitnessDuelPrefs();
  const auto = useMemo(() => autoGrouping(runs), [runs]);
  const groupId = GROUPINGS.some((g) => g.id === prefs.group) ? prefs.group : auto;
  const hasHr = useMemo(() => runs.some(hasValidHr), [runs]);
  const wanted = DUEL_METRICS.find((m) => m.id === prefs.metric) || DUEL_METRICS.find((m) => m.id === DEFAULT_DUEL_METRIC);
  // No heart rate anywhere: the HR metrics can't decide a duel, so fall
  // back to pace (Showdown does the same per pair).
  const metricId = wanted.needsHr && !hasHr ? 'pace' : wanted.id;
  const result = useMemo(
    () => buildFitnessDuel(runs, { metricId, groupId }),
    [runs, metricId, groupId],
  );
  return { result, prefs, setPrefs, groupId, auto, hasHr, metricId, fellBack: metricId !== wanted.id };
}

const pct = (v) => `${Math.round(v * 100)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function FitnessDuel() {
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus } = useLink();
  const { show, hide } = useTooltip();
  const { units } = useTweaks();
  const { result, setPrefs, groupId, auto, hasHr, fellBack } = useFitnessDuel();
  const { metric, periods, solid, peak, low, latest, totalDuels, grouping } = result;
  const noun = groupNoun(groupId);

  const hoveredKey = hovered?.date ? periodKeyOf(hovered.date, grouping.months) : null;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const words = metric.words;

  // Header mirrors Run Cards: title + blurb on the left, the main picker
  // (what decides a duel) on the right, secondary options behind the gear.
  const header = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>
            Fitness Duel
            <span className="num muted" style={{ marginLeft: 8, fontSize: 10, letterSpacing: 0, textTransform: 'none' }}>by {noun}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 520 }}>
            Each run takes on your runs of similar distance from every other {noun}, as in Showdown. A {noun}&rsquo;s score is the share of duels it won, so 50% is your average and higher is better. Uses your whole history, whatever the time range. Open <b>⚙</b> to group by quarter, half year or year.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Winner by</span>
          <div className="chip-row">
            {DUEL_METRICS.map((m) => {
              const off = m.needsHr && !hasHr;
              return (
                <button
                  key={m.id}
                  className={`chip ${metric.id === m.id ? 'active' : ''}`}
                  onClick={() => !off && setPrefs({ metric: m.id })}
                  disabled={off}
                  title={off ? 'Needs heart rate data' : m.rule}
                  style={{
                    ...(m.compound ? { borderLeft: '3px solid var(--accent)' } : {}),
                    ...(off ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <button
            className={`chip ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Grouping"
            aria-label="Toggle settings"
            aria-expanded={settingsOpen}
            style={{ padding: '5px 9px', fontSize: 12 }}
          >⚙</button>
        </div>
      </div>

      {settingsOpen && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 4,
          background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)',
          display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
            <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Group by</span>
            <div className="chip-row">
              {GROUPINGS.map((g) => (
                <button key={g.id} className={`chip ${groupId === g.id ? 'active' : ''}`} onClick={() => setPrefs({ group: g.id })}>
                  {g.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.4 }}>
              The length of each period. <b>{GROUPINGS.find((g) => g.id === auto).label}</b> suits how long your history is. Longer periods hold more runs, so their scores are steadier.
            </span>
          </div>
        </div>
      )}
      {fellBack && (
        <div className="mono muted" style={{ fontSize: 11, marginBottom: 12 }}>No heart rate on your runs, so ranked by pace</div>
      )}
    </>
  );

  if (solid.length < 2) {
    return (
      <div className="panel" style={{ padding: '20px 22px' }}>
        {header}
        <div style={{ fontSize: 13, color: 'var(--inkSoft)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
          Not enough duels yet. It needs at least two {noun}s with two or more runs and {MIN_DUELS} or more duels each. Try a shorter grouping in <b>⚙</b>.
        </div>
      </div>
    );
  }

  const W = 620, H = 230, L = 34, R = 12, T = 12, B = 34;
  const plotW = W - L - R, plotH = H - T - B;
  const n = periods.length;
  const x = (i) => L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => T + (1 - v) * plotH;
  const step = Math.max(1, Math.ceil(30 / (plotW / Math.max(1, n - 1))));
  const maxDuels = Math.max(...solid.map((p) => p.duels));
  const path = periods
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.score != null && !p.thin)
    .map(({ p, i }, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`)
    .join('');

  const bestLine = (r) => `${fmtDate(r.date, { year: true })} · ${fmtDistance(r.distance, units, 1)} ${distUnit(units)} · ${fmtPaceUnit(r.pace, units)}${paceUnit(units)}`;

  const latestIsPeak = latest && peak && latest.key === peak.key;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      {header}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line
                  x1={L} x2={W - R} y1={y(v)} y2={y(v)}
                  stroke={v === 0.5 ? 'var(--rule)' : 'var(--ruleSoft)'}
                  strokeDasharray={v === 0.5 ? undefined : '2 3'}
                />
                <text x={L - 6} y={y(v) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>{pct(v)}</text>
              </g>
            ))}
            <text x={W - R} y={y(0.5) - 4} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>your average</text>

            <path d={path} fill="none" stroke="var(--inkSoft)" strokeWidth={1.5} strokeLinejoin="round" />

            {periods.map((p, i) => {
              const showLabel = i % step === 0;
              const label = showLabel && (
                <g key={`l-${p.key}`}>
                  <text x={x(i)} y={H - 18} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>{p.short}</text>
                  {p.year && (p.yearStart || i === 0) && (
                    <text x={x(i)} y={H - 6} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>{p.year}</text>
                  )}
                </g>
              );
              if (p.score == null) return label;
              const isPeak = peak && p.key === peak.key;
              const isLinked = hoveredKey === p.key;
              const dim = hovered && !isLinked;
              const r = p.thin ? 3 : 3 + Math.min(1, p.duels / maxDuels) * 3.5;
              return (
                <g key={p.key}>
                  {label}
                  <g
                    data-tap-focus="true"
                    opacity={dim ? 0.35 : 1}
                    style={{ cursor: p.best ? 'pointer' : 'default' }}
                    onMouseEnter={(e) => {
                      if (p.best) setHovered({ runId: p.best.id, routeId: p.best.routeId, type: p.best.type, date: p.best.date });
                      show(
                        <>
                          <span className="t-title">{p.long}</span>
                          <div className="t-row"><span>Duels won</span><span>{Math.round(p.won * 10) / 10} of {p.duels}</span></div>
                          <div className="t-row"><span>Score</span><span>{pct(p.score)}</span></div>
                          <div className="t-row"><span>Runs</span><span>{p.runs}</span></div>
                          {p.best && <div className="t-row"><span>Standout</span><span>{bestLine(p.best)}</span></div>}
                          {p.thin && <div className="t-pill" style={{ background: 'var(--inkMuted)', color: 'var(--bg)' }}>Few duels, read loosely</div>}
                          {isPeak && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{words.best(noun)}</div>}
                        </>,
                        e.clientX, e.clientY,
                      );
                    }}
                    onMouseLeave={() => {
                      if (isTouch && p.best && pendingFocusId === p.best.id) return;
                      setHovered(null); hide();
                    }}
                    onClick={() => { if (p.best && requestFocus(p.best.id)) { setHovered(null); hide(); } }}
                  >
                    {/* generous invisible hit area */}
                    <circle cx={x(i)} cy={y(p.score)} r={12} fill="transparent" />
                    <circle
                      cx={x(i)} cy={y(p.score)} r={isPeak ? r + 1 : r}
                      fill={p.thin ? 'var(--bg)' : isPeak ? 'var(--accent)' : 'var(--ink)'}
                      stroke={p.thin ? 'var(--inkMuted)' : 'none'}
                      strokeWidth={1.2}
                    />
                    {(isPeak || isLinked) && (
                      <circle cx={x(i)} cy={y(p.score)} r={r + 4} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray={isLinked && !isPeak ? '2 2' : undefined} />
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
          <div className="mono muted" style={{ fontSize: 10.5, marginTop: 6 }}>
            Bigger dots rest on more duels. Hollow dots have fewer than {MIN_DUELS} duels or a single run. Click a dot to open its standout run.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="stat" style={{ paddingLeft: 10, borderLeft: '3px solid var(--accent)' }}>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>{words.best(noun)}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{peak.long}</div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>Won {pct(peak.score)} of {peak.duels} duels · {plural(peak.runs, 'run')}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Latest {noun}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{latest.long}</div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>Won {pct(latest.score)} of {latest.duels} duels · {plural(latest.runs, 'run')}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{words.worst(noun)}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{low.long}</div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>Won {pct(low.score)} of {low.duels} duels · {plural(low.runs, 'run')}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 12 }}>
            <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, lineHeight: 1.25, color: 'var(--inkSoft)' }}>
              {latestIsPeak
                ? words.yet(noun)
                : latest.score >= 0.5
                  ? `Above your average, ${Math.round((peak.score - latest.score) * 100)} points off your best.`
                  : `Below your average right now.`}
            </div>
            <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
              {totalDuels.toLocaleString('en-US')} duels · {metric.rule}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
