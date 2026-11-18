'use client';

// Showdown: two runs as game-style cards, side by side. Opened from an
// expanded RunCard ("Compare") or from `?vs=a,b` in the URL. The winner is
// the better run on the metric picked in "Winner by" (Stamina by default)
// and gets the bigger, accented card. Every bar is a percentile among the
// athlete's own runs, so a longer bar always means better.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useData, useLink, useTweaks, useExclusions,
  fmtDuration, fmtPace, fmtPaceUnit, paceUnit, fmtDistance, distUnit,
  elevToDisplay, elevUnit, fmtTemp, tempUnit, hasValidHr, paceToDisplay, pad, isInterrupted,
} from '@/lib/shared';
import { buildShowdown, suggestOpponents, opponentChoices, availableMetrics, SHOWDOWN_METRICS, DEFAULT_RANK, COHORT_TOL } from '@/lib/showdown';
import { stravaActivityUrl } from '@/lib/site';

const PLOTS_KEY = 'stride.showdownPlots';
const RANK_KEY = 'stride.showdownRankBy';

const fmtDay = (iso, year = true) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: year ? 'numeric' : undefined });

// Minutes → "m:ss" (or "h:mm:ss") for time gaps.
function fmtGap(min) {
  const s = Math.round(min * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// One line saying how the result was reached, e.g. "Higher stamina wins".
function verdict(sd, fmt) {
  const m = sd.metric;
  const row = sd.metrics.find((r) => r.selected);
  if (!sd.winner) return `Level on ${m.label.toLowerCase()}`;
  const w = row[sd.winner].value, l = row[sd.winner === 'a' ? 'b' : 'a'].value;
  return `${m.win} wins · ${fmt(m.id, w)} vs ${fmt(m.id, l)}`;
}

function fmtStat(key, v, units, tempUnits) {
  if (v == null) return '—';
  switch (key) {
    case 'pace': return `${fmtPaceUnit(v, units)}${paceUnit(units)}`;
    case 'efficiency':
    case 'stamina': return v.toFixed(2);
    case 'distance': return `${fmtDistance(v, units, 2)} ${distUnit(units)}`;
    case 'hr': return `${Math.round(v)} bpm`;
    case 'km1': return fmtPace(v);
    case 'elev': return `${Math.round(elevToDisplay(v, units))} ${elevUnit(units)}`;
    case 'temp': return `${fmtTemp(v, tempUnits)}${tempUnit(tempUnits)}`;
    default: return String(v);
  }
}

export default function Showdown() {
  const data = useData();
  const { showdown, setShowdown, closeShowdown, setFocusRequest } = useLink();
  const { units, tempUnits, stoppedThreshold } = useTweaks();
  const { excluded } = useExclusions();

  // Plots below the cards: collapsed by default, remembered per browser.
  const [plotsOpen, setPlotsOpen] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(PLOTS_KEY) === '1'; } catch { return false; }
  });
  const togglePlots = () => {
    const next = !plotsOpen;
    setPlotsOpen(next);
    try { localStorage.setItem(PLOTS_KEY, next ? '1' : '0'); } catch { /* storage blocked: fine */ }
  };
  // Metric that decides the winner. Remembered per browser.
  const [rankBy, setRankByState] = useState(() => {
    try {
      const v = typeof window !== 'undefined' && localStorage.getItem(RANK_KEY);
      return SHOWDOWN_METRICS.some((m) => m.id === v) ? v : DEFAULT_RANK;
    } catch { return DEFAULT_RANK; }
  });
  const setRankBy = (id) => {
    setRankByState(id);
    try { localStorage.setItem(RANK_KEY, id); } catch { /* storage blocked: fine */ }
  };
  // Zoomed onto the two runs (default) or the whole cloud.
  const [zoom, setZoom] = useState(true);

  const byId = useMemo(() => new Map(data.runs.map((r) => [String(r.id), r])), [data.runs]);
  const a = showdown ? byId.get(String(showdown.a)) : null;
  const b = showdown?.b != null ? byId.get(String(showdown.b)) : null;

  // ---- URL sync: ?vs=a,b ------------------------------------------------
  useEffect(() => {
    const vs = new URLSearchParams(window.location.search).get('vs');
    if (!vs) return;
    const [ia, ib] = vs.split(',');
    if (byId.has(ia)) setShowdown({ a: byId.get(ia).id, b: byId.has(ib) ? byId.get(ib).id : null });
    // Mount only: the URL is read once, then written below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const firstWrite = useRef(true);
  useEffect(() => {
    if (firstWrite.current) { firstWrite.current = false; return; }
    const url = new URL(window.location.href);
    if (showdown) url.searchParams.set('vs', [showdown.a, showdown.b].filter((x) => x != null).join(','));
    else url.searchParams.delete('vs');
    window.history.replaceState(window.history.state, '', url);
  }, [showdown]);

  // ---- Modal plumbing: Escape closes, page behind doesn't scroll ---------
  const open = !!a;
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') closeShowdown(); };
    // Lock both: the page scrolls on <html> here, not <body>.
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.overflow);
    els.forEach((el) => { el.style.overflow = 'hidden'; });
    document.addEventListener('keydown', onKey);
    return () => {
      els.forEach((el, i) => { el.style.overflow = prev[i]; });
      document.removeEventListener('keydown', onKey);
    };
  }, [open, closeShowdown]);

  const pool = useMemo(
    () => (excluded.size ? data.runs.filter((r) => !excluded.has(String(r.id))) : data.runs),
    [data.runs, excluded]
  );
  const suggestions = useMemo(() => suggestOpponents(a, pool), [a, pool]);
  const choices = useMemo(() => opponentChoices(a, data.runs), [a, data.runs]);
  const sd = useMemo(
    () => buildShowdown(a, b, pool, { rankBy, streamsSynced: data.streamsSynced !== false }),
    [a, b, pool, rankBy, data.streamsSynced]
  );

  if (!a) return null;

  const meta = data.typeMeta;
  const pick = (id) => setShowdown({ a: a.id, b: id });
  const openCard = (id) => { closeShowdown(); setFocusRequest(id); };

  // The run you opened stays on the left, the opponent on the right,
  // whoever wins. The plots still draw their arrow older → newer.
  const sides = b ? ['a', 'b'] : ['a'];
  const runOf = (s) => (s === 'a' ? a : b);
  const chrono = b ? [a, b].sort((x, y) => x.date.localeCompare(y.date)) : [a];
  // Stopped time: shown on both cards when either run passes the threshold
  // set in the View panel, so the pair stays comparable.
  const showStops = !!b && [a, b].some((r) => isInterrupted(r, stoppedThreshold));

  const picker = (
    <OpponentPicker
      a={a} b={b} suggestions={suggestions} choices={choices}
      meta={meta} units={units} onPick={pick} compact={!!b}
    />
  );

  return (
    <div className="sd-backdrop" data-showdown onClick={closeShowdown}>
      <div className="sd-sheet" role="dialog" aria-modal="true" aria-label="Run showdown" onClick={(e) => e.stopPropagation()}>
        <div className="sd-head">
          <div>
            <div className="eyebrow sd-eyebrow">Showdown</div>
            <div className="sd-title">
              {b ? <>Two runs, head to head</> : <>Pick an opponent for your {fmtDistance(a.distance, units)} {distUnit(units)}</>}
            </div>
          </div>
          <button className="chip" onClick={closeShowdown} aria-label="Close showdown">Close</button>
        </div>

        {!b && (
          <div className="sd-pickgrid">
            <ShowdownCard run={a} meta={meta} units={units} tempUnits={tempUnits} onOpen={openCard} />
            {picker}
          </div>
        )}

        {b && sd && (
          <>
            <div className="sd-rankby">
              <span className="mono sd-swap-label">Winner by</span>
              <div className="chip-row">
                {SHOWDOWN_METRICS.map((m) => {
                  const ok = sd.available.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      className={`chip ${sd.metric.id === m.id ? 'active' : ''}`}
                      onClick={() => ok && setRankBy(m.id)}
                      disabled={!ok}
                      title={ok ? undefined : 'Needs heart rate on both runs'}
                      style={m.compound ? { borderLeft: '3px solid var(--accent)' } : undefined}
                    >{m.label}</button>
                  );
                })}
              </div>
            </div>
            <div className="sd-tally mono">
              {verdict(sd, (k, v) => fmtStat(k, v, units, tempUnits))}
              {sd.metric.id !== rankBy && <span className="sd-tally-note">No heart rate on one run, so ranked by pace</span>}
            </div>
            <div className="sd-arena">
              {sides.map((s, i) => (
                <ShowdownCard
                  key={s}
                  run={runOf(s)}
                  meta={meta} units={units} tempUnits={tempUnits}
                  result={sd.winner == null ? 'draw' : sd.winner === s ? 'win' : 'lose'}
                  projected={sd.sameDist || runOf(s).distance === sd.km ? null : sd.time[s]}
                  km={sd.km}
                  gap={s === 'a' ? sd.time.a - sd.time.b : sd.time.b - sd.time.a}
                  stats={sd.metrics.concat(sd.context).map((st) => ({ ...st, mine: st[s], won: st.better === s }))}
                  onOpen={openCard}
                  showStops={showStops}
                  align={i === 0 ? 'left' : 'right'}
                />
              ))}
            </div>

            {picker}

            <div className="sd-plots-wrap">
              <div className="sd-plots-head">
                <button className="sd-disclosure" aria-expanded={plotsOpen} onClick={togglePlots}>
                  <span className="sd-caret" aria-hidden="true">▸</span>
                  <span className="stat-label">On your charts</span>
                  <span className="mono sd-plots-hint">Efficiency · Durability</span>
                </button>
                {plotsOpen && (
                  <div className="chip-row">
                    <button className={`chip ${zoom ? 'active' : ''}`} onClick={() => setZoom(true)}>These two</button>
                    <button className={`chip ${!zoom ? 'active' : ''}`} onClick={() => setZoom(false)}>All runs</button>
                  </div>
                )}
              </div>
              {plotsOpen && (
                <div className="sd-plots">
                  <MiniScatter
                    title="Aerobic Efficiency"
                    sub="Heart rate × pace · up and left is better"
                    runs={[...new Map(sd.cohorts.a.concat(sd.cohorts.b).map((r) => [r.id, r])).values()].filter(hasValidHr)}
                    contenders={chrono}
                    x={(r) => (hasValidHr(r) ? r.hr : null)}
                    xMinHalf={3}
                    xLabel={(v) => `${Math.round(v)} bpm`}
                    units={units}
                    zoom={zoom}
                    onOpen={openCard}
                    empty="Heart rate missing on one of these runs."
                  />
                  <MiniScatter
                    title="Aerobic Durability"
                    sub="Distance × pace · up and right is better"
                    runs={pool}
                    contenders={chrono}
                    x={(r) => r.distance}
                    xMinHalf={0.25}
                    xLabel={(v) => `${fmtDistance(v, units, zoom ? 2 : 0)} ${distUnit(units)}`}
                    units={units}
                    zoom={zoom}
                    onOpen={openCard}
                  />
                </div>
              )}
            </div>

            <p className="sd-foot">
              The winner is the better run on the metric picked above. Pace isn&rsquo;t adjusted for distance; Stamina is.
              Bars rank each run among your runs within {Math.round(COHORT_TOL * 100)}% of its own distance (Distance among all your runs), and a full bar is your best. A lower heart rate gets the longer bar.
              {' '}Times are moving time, as Strava reports them{showStops ? ', so stops at lights or for photos don\u2019t count against a run. Elapsed time is shown for reference' : ''}.
              {!sd.sameDist && <> Different distances, so times are projected to {fmtDistance(sd.km, units)} {distUnit(units)} with Riegel&rsquo;s formula.</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ShowdownCard({ run, meta, units, tempUnits, result, projected, km, gap, stats, onOpen, showStops, align = 'left' }) {
  const color = `var(--type-${run.type})`;
  const cls = ['sd-card', result ? `sd-${result}` : 'sd-solo', `sd-${align}`].join(' ');
  return (
    <div className={cls} style={{ '--sd-type': color }}>
      <div className="sd-card-top">
        <span className="mono sd-date">{fmtDay(run.date)}</span>
        {result === 'win' && <span className="sd-badge">★ Winner</span>}
        {result === 'draw' && <span className="sd-badge sd-badge-draw">Draw</span>}
      </div>
      <div className="sd-kind">
        <span className="sd-dot" />{meta[run.type].label}
        <span className="sd-route"> · {run.routeName}</span>
        {run.pr && <span className="sd-pr">PR</span>}
      </div>

      <div className="sd-hero">{fmtDuration(run.duration)}</div>
      {!stats?.length && <div className="mono sd-sub">
        {fmtDistance(run.distance, units, 2)} {distUnit(units)} · {fmtPaceUnit(run.pace, units)}{paceUnit(units)}
        {hasValidHr(run) && <> · {run.hr} bpm</>}
      </div>}
      {showStops && (() => {
        // `duration` is moving minutes; elapsed is recovered from the
        // stopped share, same as the expanded RunCard.
        const ratio = run.stoppedRatio ?? 0;
        const elapsed = ratio ? run.duration / (1 - ratio) : run.duration;
        return (
          <div className="mono sd-stops">
            Elapsed {fmtDuration(elapsed)}
            {ratio >= 0.005 ? <> · stopped {fmtGap(elapsed - run.duration)} ({Math.round(ratio * 100)}%)</> : <> · no stops</>}
          </div>
        );
      })()}
      {projected != null && (
        <div className="mono sd-proj">≈ {fmtDuration(projected)} over {fmtDistance(km, units)} {distUnit(units)}</div>
      )}
      {gap != null && Math.abs(gap) >= 1 / 60 && (
        <div className={`mono sd-gap ${gap < 0 ? 'sd-gap-win' : ''}`}>
          {gap < 0 ? '−' : '+'}{fmtGap(Math.abs(gap))}
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="sd-stats">
          {stats.map((st, i) => (
            <div key={st.id} className={`sd-stat ${st.won ? 'sd-stat-won' : ''} ${st.selected ? 'sd-stat-sel' : ''}`}
              title={st.mine.rank ? `${st.hint ? st.hint + '. ' : ''}${ordinal(st.mine.rank)} of ${st.mine.total} ${st.cohortAll ? 'runs' : 'similar runs'}` : undefined}>
              {i > 0 && !st.isMetric && stats[i - 1].isMetric && <div className="sd-group mono">Context</div>}
              <div className="sd-stat-row">
                <span className="sd-stat-label mono">{st.rowLabel}</span>
                <span className="sd-stat-val mono">{fmtStat(st.id, st.mine.value, units, tempUnits)}</span>
              </div>
              <div className="sd-bar">
                {st.mine.pct != null && <div className="sd-bar-fill" style={{ width: `${Math.max(4, st.mine.pct * 100)}%` }} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sd-card-foot">
        <button className="chip" onClick={() => onOpen(run.id)}>Open card</button>
        {run.stravaId && (
          <a className="view-on-strava" href={stravaActivityUrl(run.stravaId)} target="_blank" rel="noreferrer">View on Strava</a>
        )}
      </div>
      {run.device && <div className="mono sd-device">Recorded with {run.device}</div>}
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function OpponentPicker({ a, b, suggestions, choices, meta, units, onPick, compact }) {
  const runLabel = (r) => `${fmtDay(r.date)} · ${fmtDistance(r.distance, units)} ${distUnit(units)} · ${fmtDuration(r.duration)}`;
  const select = (
    <select
      className="sd-select mono"
      value={b ? String(b.id) : ''}
      onChange={(e) => e.target.value && onPick(choices.similar.concat(choices.rest).find((r) => String(r.id) === e.target.value).id)}
      aria-label="Pick any run"
    >
      <option value="">{compact ? 'Pick another run…' : 'Or pick any run…'}</option>
      {choices.similar.length > 0 && (
        <optgroup label="Similar distance">
          {choices.similar.map((r) => <option key={r.id} value={String(r.id)}>{runLabel(r)}</option>)}
        </optgroup>
      )}
      {choices.rest.length > 0 && (
        <optgroup label="Other runs">
          {choices.rest.map((r) => <option key={r.id} value={String(r.id)}>{runLabel(r)}</option>)}
        </optgroup>
      )}
    </select>
  );

  if (compact) {
    return (
      <div className="sd-swap">
        <span className="mono sd-swap-label">Opponent</span>
        <div className="chip-row">
          {suggestions.map(({ run, labels }) => (
            <button key={run.id} className={`chip ${b && b.id === run.id ? 'active' : ''}`} onClick={() => onPick(run.id)}>
              {labels.join(' · ')}
            </button>
          ))}
        </div>
        {select}
      </div>
    );
  }

  return (
    <div className="sd-picker">
      <div className="mono sd-swap-label">Suggested opponents</div>
      {suggestions.length === 0 && (
        <div className="sd-empty">No runs of a similar distance yet. Pick any run below.</div>
      )}
      {suggestions.map(({ run, labels }) => {
        const diff = run.duration - a.duration;
        return (
          <button key={run.id} className="sd-sugg" onClick={() => onPick(run.id)} style={{ '--sd-type': `var(--type-${run.type})` }}>
            <span className="sd-sugg-labels">{labels.map((l) => <span key={l} className="sd-sugg-tag mono">{l}</span>)}</span>
            <span className="sd-sugg-main">
              <span className="sd-sugg-time">{fmtDuration(run.duration)}</span>
              <span className="mono sd-sugg-meta">{fmtDay(run.date)} · {fmtDistance(run.distance, units, 2)} {distUnit(units)} · {meta[run.type].label}</span>
            </span>
            <span className={`mono sd-sugg-diff ${diff > 0 ? 'sd-gap-win' : ''}`}>
              {Math.abs(diff) < 1 / 60 ? 'even' : `you ${diff > 0 ? '−' : '+'}${fmtGap(Math.abs(diff))}`}
            </span>
          </button>
        );
      })}
      {select}
    </div>
  );
}

// Small static scatter: gray cohort dots, the two contenders ringed in
// their type color, an arrow from the older run to the newer one. Pace on
// y with faster at the top, matching the dashboard panels.
function MiniScatter({ title, sub, runs, contenders, x, xMinHalf = 1, xLabel, units, zoom, onOpen, empty }) {
  const W = 320, H = 190, M = { l: 40, r: 12, t: 14, b: 26 };
  const ok = contenders.every((r) => x(r) != null && r.pace);
  const pts = runs.filter((r) => x(r) != null && r.pace);
  const all = pts.concat(contenders.filter((r) => x(r) != null));

  let body = <div className="sd-empty">{empty}</div>;
  if (ok && all.length) {
    const [c0, c1] = contenders;
    const xs = all.map(x), ps = all.map((r) => r.pace);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), p0 = Math.min(...ps), p1 = Math.max(...ps);
    if (zoom) {
      // Center on the pair so they land around 1/4 and 3/4 of the frame,
      // however close they are. Small fixed floors (a few bpm, 250 m, 3 s/km)
      // keep a near-identical pair from zooming into noise.
      const fit = (a, b, minHalf) => {
        const c = (a + b) / 2;
        const half = Math.max(Math.abs(a - b), minHalf);
        return [c - half, c + half];
      };
      [x0, x1] = fit(x(c0), x(c1), xMinHalf);
      [p0, p1] = fit(c0.pace, c1.pace, 0.05);
    } else {
      const xp = (x1 - x0) * 0.08 || 1, pp = (p1 - p0) * 0.1 || 0.2;
      x0 -= xp; x1 += xp; p0 -= pp; p1 += pp;
    }
    // Gray context dots: only those inside the frame.
    const inFrame = (r) => { const v = x(r); return v >= x0 && v <= x1 && r.pace >= p0 && r.pace <= p1; };
    const xf = (v) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
    const yf = (p) => M.t + ((p - p0) / (p1 - p0)) * (H - M.t - M.b);
    const P0 = { x: xf(x(c0)), y: yf(c0.pace) }, P1 = { x: xf(x(c1)), y: yf(c1.pace) };
    // Stop the arrow short of the ring it points at.
    const dx = P1.x - P0.x, dy = P1.y - P0.y, len = Math.hypot(dx, dy) || 1;
    const shrink = Math.min(10, len / 2);
    const ids = new Set(contenders.map((r) => r.id));
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" role="img" aria-label={`${title}: the two runs among your others`}>
        <defs>
          <marker id={`sd-arrow-${title.replace(/\W/g, '')}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink)" />
          </marker>
        </defs>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--rule)" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--rule)" />
        <text x={M.l} y={H - 8} className="sd-axis">{xLabel(x0)}</text>
        <text x={W - M.r} y={H - 8} textAnchor="end" className="sd-axis">{xLabel(x1)}</text>
        <text x={M.l - 5} y={M.t + 8} textAnchor="end" className="sd-axis">{fmtPace(paceToDisplay(p0, units))}</text>
        <text x={M.l - 5} y={H - M.b} textAnchor="end" className="sd-axis">{fmtPace(paceToDisplay(p1, units))}</text>
        {pts.filter((r) => !ids.has(r.id) && inFrame(r)).map((r) => (
          <circle key={r.id} cx={xf(x(r))} cy={yf(r.pace)} r={2.4} fill="var(--inkMuted)" opacity={0.35} />
        ))}
        {len > 14 && (
          <line
            x1={P0.x + (dx / len) * shrink} y1={P0.y + (dy / len) * shrink}
            x2={P1.x - (dx / len) * shrink} y2={P1.y - (dy / len) * shrink}
            stroke="var(--ink)" strokeWidth={1.4} markerEnd={`url(#sd-arrow-${title.replace(/\W/g, '')})`}
          />
        )}
        {contenders.map((r, i) => {
          const P = i === 0 ? P0 : P1;
          // Each label on its dot's outer side, so the pair's labels never
          // print over each other or over the arrow between them.
          const other = i === 0 ? P1 : P0;
          const left = P.x < other.x || (P.x === other.x && i === 0);
          return (
            <g key={r.id} className="sd-pt" onClick={() => onOpen(r.id)}>
              <title>{`${fmtDay(r.date)} · open this run's card`}</title>
              <circle cx={P.x} cy={P.y} r={6} fill={`var(--type-${r.type})`} stroke="var(--bg)" strokeWidth={1.5} />
              <circle cx={P.x} cy={P.y} r={9.5} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
              <text x={left ? P.x - 12 : P.x + 12} y={P.y + 3} textAnchor={left ? 'end' : 'start'} className="sd-pt-label">{fmtDay(r.date, false)} &rsquo;{String(r.date).slice(2, 4)}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <div className="sd-plot">
      <div className="stat-label">{title}</div>
      <div className="mono sd-plot-sub">{sub}</div>
      {body}
    </div>
  );
}
