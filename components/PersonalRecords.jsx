'use client';

import { useMemo, useState } from 'react';
import {
  useLink, useData, useTweaks, useExclusions,
  fmtDate, fmtPace, fmtDuration,
  fmtPaceUnit, paceUnit, fmtDistance, distUnit, fmtHr,
  hasValidHr, efOf, stamOf,
  Highlight, HlNum,
} from '@/lib/shared';

// Window size in days; matches useFilteredRuns's mapping.
const RANGE_DAYS = { '1m': 30, '3m': 92, '6m': 183, '1y': 365, 'all': 99999 };

const RANGE_LABEL = {
  '1m': 'last 1 month',
  '3m': 'last 3 months',
  '6m': 'last 6 months',
  '1y': 'last year',
  'all': 'first half of history',
};

// `key` matches the bestSplits key emitted by ingest (kilometers as a string).
const DISTANCES = [
  { key: '1',       label: '1 km',      dist: 1.0 },
  { key: '5',       label: '5 km',      dist: 5.0 },
  { key: '10',      label: '10 km',     dist: 10.0 },
  { key: '21.0975', label: 'Half Mar.', dist: 21.0975 },
  { key: '42.195',  label: 'Marathon',  dist: 42.195 },
];

// Leaderboard ranking metrics. Local to this section (its own chip selector) —
// independent of PaceRibbon's global `metric`. Every metric is computable from
// summary data, so the leaderboard works in live Strava mode without streams.
// `needsHr` metrics drop runs without valid HR; `higherIsBetter` sets the
// "best" direction (efficiency/stamina/distance up; pace/HR down).
// Order + default mirror the Trend Ribbon's toggle: Pace, Distance, Heart,
// Efficiency, Stamina (Stamina last, but it's the default selection). Each
// metric carries the right superlatives for its two ends so the column
// headers read naturally (Longest/Shortest, Fastest/Slowest, ...).
const RANK_METRICS = [
  { id: 'pace',       label: 'Pace',       pairLabel: 'Fastest & Slowest',  topLabel: 'Fastest',        bottomLabel: 'Slowest',         higherIsBetter: false, needsHr: false, value: (r) => r.pace },
  { id: 'distance',   label: 'Distance',   pairLabel: 'Longest & Shortest', topLabel: 'Longest',        bottomLabel: 'Shortest',        higherIsBetter: true,  needsHr: false, value: (r) => r.distance },
  { id: 'hr',         label: 'Heart',      pairLabel: 'Lowest & Highest HR',topLabel: 'Lowest HR',      bottomLabel: 'Highest HR',      higherIsBetter: false, needsHr: true,  value: (r) => r.hr },
  { id: 'efficiency', label: 'Efficiency', pairLabel: 'Most & Least Efficient', topLabel: 'Most efficient', bottomLabel: 'Least efficient', higherIsBetter: true,  needsHr: true,  compound: true, value: efOf },
  { id: 'stamina',    label: 'Stamina',    pairLabel: 'Strongest & Weakest',topLabel: 'Strongest',      bottomLabel: 'Weakest',         higherIsBetter: true,  needsHr: true,  compound: true, value: stamOf },
];

function fmtRankValue(metric, r, units) {
  switch (metric.id) {
    case 'pace': return `${fmtPaceUnit(r.pace, units)}${paceUnit(units)}`;
    case 'distance': return `${fmtDistance(r.distance, units, 1)} ${distUnit(units)}`;
    case 'hr': return fmtHr(r);
    default: {
      const v = metric.value(r);
      return v != null ? v.toFixed(2) : '—';
    }
  }
}

export default function PersonalRecords() {
  const data = useData();
  const { excluded } = useExclusions();
  // All-time (PR values never change with the time filter), minus the runs
  // the user has excluded from stats.
  const runs = useMemo(
    () => (excluded.size ? data.runs.filter((r) => !excluded.has(String(r.id))) : data.runs),
    [data.runs, excluded],
  );
  const { hovered, setHovered, setFocusRequest, requestFocus } = useLink();
  const { timeRange, units } = useTweaks();
  const meta = data.typeMeta;

  // Best & Toughest leaderboard — ranked all-time by the locally-selected
  // metric (default Stamina). Defined above the streamsSynced gate so it also
  // renders in live mode, where the distance splits are still awaiting sync.
  const [rankBy, setRankBy] = useState('stamina');
  const leaderboard = useMemo(() => {
    const metric = RANK_METRICS.find((m) => m.id === rankBy) || RANK_METRICS[0];
    const pool = (metric.needsHr ? runs.filter(hasValidHr) : runs)
      .filter((r) => metric.value(r) != null);
    const sorted = [...pool].sort((a, b) =>
      metric.higherIsBetter ? metric.value(b) - metric.value(a) : metric.value(a) - metric.value(b));
    const best = sorted.slice(0, 3);
    const bestIds = new Set(best.map((r) => r.id));
    const toughest = [...sorted].reverse().filter((r) => !bestIds.has(r.id)).slice(0, 3);
    return { metric, best, toughest };
  }, [runs, rankBy]);

  function renderLeaderboard() {
    const { metric, best, toughest } = leaderboard;
    if (!best.length) return null;
    const row = (r, i) => {
      const color = `var(--type-${r.type})`;
      const isHover = hovered?.runId === r.id;
      return (
        <div
          key={r.id}
          data-tap-focus="true"
          onMouseEnter={() => setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date })}
          onMouseLeave={() => setHovered(null)}
          onClick={() => { if (requestFocus(r.id)) setHovered(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 9px', borderRadius: 4, cursor: 'pointer',
            background: isHover ? 'var(--bgSunken)' : 'transparent',
            borderLeft: `2px solid ${color}`,
          }}
        >
          <span className="mono muted" style={{ fontSize: 11, width: 13, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fmtDate(r.date, { year: true })}
            </div>
            <div className="mono muted" style={{ fontSize: 10, marginTop: 1 }}>
              {meta[r.type].label} · {fmtDistance(r.distance, units, 1)} {distUnit(units)}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {fmtRankValue(metric, r, units)}
          </span>
        </div>
      );
    };
    return (
      <div style={{ borderTop: '1px solid var(--ruleSoft)', marginTop: 18, paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div className="stat-label" style={{ marginBottom: 4 }}>{metric.pairLabel} Runs</div>
            <div style={{ fontSize: 12.5, color: 'var(--inkSoft)', maxWidth: 420 }}>
              Across all your runs, ranked all-time.
            </div>
          </div>
          <div className="chip-row">
            {RANK_METRICS.map((m) => (
              <button
                key={m.id}
                className={`chip ${rankBy === m.id ? 'active' : ''}`}
                onClick={() => setRankBy(m.id)}
                style={m.compound ? { borderLeft: '3px solid var(--accent)' } : undefined}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
          <div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--positive)', marginBottom: 6 }}>△ {metric.topLabel}</div>
            {best.map(row)}
          </div>
          {toughest.length > 0 && (
            <div>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--inkMuted)', marginBottom: 6 }}>▽ {metric.bottomLabel}</div>
              {toughest.map(row)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // PR splits are computed from per-activity GPS streams. In summary mode
  // (Strava API without streams) we don't have them yet — show a placeholder.
  if (data.streamsSynced === false) {
    return (
      <div className="panel" style={{ padding: '20px 22px' }}>
        <div style={{ marginBottom: 16 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>Personal Records</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 640 }}>
            Rolling 1 km / 5 km / 10 km / HM / Marathon splits need your per-activity GPS stream
            (one extra API call per run). We only fetched summaries so far. Tap <b>Sync full history</b>
            to compute these in the background.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
          {DISTANCES.map((d) => (
            <div key={d.key} style={{
              padding: 14, background: 'var(--bgSunken)',
              border: '1px dashed var(--rule)', borderRadius: 4, textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--inkMuted)' }}>
                {d.label}
              </div>
              <div className="mono muted" style={{ fontSize: 10, marginTop: 6, letterSpacing: '.06em' }}>
                awaiting sync
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="chip" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            Sync full history (coming soon)
          </button>
        </div>
        {renderLeaderboard()}
      </div>
    );
  }

  // Cutoff semantics:
  //   - timeRange !== 'all': cutoff = window start → "was" = best BEFORE cutoff
  //   - timeRange === 'all': no real "before", so cutoff = midpoint of history
  //     → "was" = best from the FIRST HALF of all history
  // Edge cases handled in the card:
  //   - PR itself was set before cutoff → "PR set before this window (date)"
  //   - no runs at this distance before cutoff → "first coverage in this window"
  const { distancePRs, isAllTime } = useMemo(() => {
    if (!runs.length) {
      return {
        distancePRs: DISTANCES.map((d) => ({ ...d, run: null })),
        isAllTime: true,
      };
    }

    const ts = runs.map((r) => new Date(r.date + 'T00:00:00').getTime());
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    const isAllTime = timeRange === 'all';
    const days = RANGE_DAYS[timeRange] || 99999;
    // Match useFilteredRuns: window anchored at the most recent run's date.
    const windowStart = tMax - days * 86400000;
    const cutoffT = isAllTime ? tMin + (tMax - tMin) / 2 : windowStart;

    const prs = DISTANCES.map((d) => {
      const candidates = runs
        .filter((r) => r.bestSplits && r.bestSplits[d.key] != null)
        .map((r) => ({ run: r, time: r.bestSplits[d.key] }))
        .sort((a, b) => a.time - b.time || a.run.date.localeCompare(b.run.date));
      if (!candidates.length) return { ...d, run: null };

      const best = candidates[0];
      const bestT = new Date(best.run.date + 'T00:00:00').getTime();
      const bestBeforeCutoff = bestT < cutoffT;

      // Best among runs dated strictly before the cutoff.
      const prevBest = candidates.find((c) => {
        const t = new Date(c.run.date + 'T00:00:00').getTime();
        return t < cutoffT;
      });

      return {
        ...d,
        run: best.run,
        bestMin: best.time,
        bestBeforeCutoff,
        prevRun: prevBest?.run || null,
        prevMin: prevBest?.time ?? null,
        attempts: candidates.length,
      };
    });

    return { distancePRs: prs, isAllTime };
  }, [runs, timeRange]);

  const rangeLabel = RANGE_LABEL[timeRange] || 'selected window';

  const biggestDrop = useMemo(() => {
    const drops = distancePRs
      .filter((d) => d.run && d.prevMin != null && !d.bestBeforeCutoff)
      .map((d) => ({
        record: d,
        secDropped: (d.prevMin - d.bestMin) * 60,
      }))
      .filter((d) => d.secDropped > 1);
    if (!drops.length) return null;
    return drops.reduce((a, b) => (a.secDropped > b.secDropped ? a : b));
  }, [distancePRs]);

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ marginBottom: 16 }}>
        <div className="stat-label" style={{ marginBottom: 4 }}>Personal Records</div>
        <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 640 }}>
          Your fastest rolling split at each classic distance, always <b>all-time</b> and unaffected by
          the time-range filter. The comparison line shows your best time{' '}
          {isAllTime
            ? <>in the <b>first half</b> of your history</>
            : <>before the <b>{rangeLabel}</b></>}
          , so you can see how much you&rsquo;ve improved since.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        {distancePRs.map((d) => (
          <DistancePR key={d.key} record={d} onHover={setHovered} onFocus={setFocusRequest} hovered={hovered} isAllTime={isAllTime} />
        ))}
      </div>

      {renderLeaderboard()}

      {biggestDrop ? (
        <Highlight>
          Biggest PR drop: <HlNum>{biggestDrop.record.label}</HlNum> down{' '}
          <HlNum>{biggestDrop.secDropped.toFixed(0)} s</HlNum>:{' '}
          <HlNum>{fmtDuration(biggestDrop.record.prevMin)} → {fmtDuration(biggestDrop.record.bestMin)}</HlNum>
          {' '}on <HlNum>{fmtDate(biggestDrop.record.run.date, { year: true })}</HlNum>. Keep the streak going.
        </Highlight>
      ) : (
        <Highlight tone="muted">
          PRs locked in across your classic distances. Next improvement starts with a harder effort.
        </Highlight>
      )}
    </div>
  );
}

function DistancePR({ record, onHover, onFocus, hovered, isAllTime }) {
  const data = useData();
  const { units } = useTweaks();
  const meta = data.typeMeta;
  if (!record.run) {
    return (
      <div style={{ padding: 14, background: 'var(--bgSunken)', border: '1px dashed var(--rule)', borderRadius: 4, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18, color: 'var(--inkMuted)' }}>{record.label}</div>
        <div className="mono muted" style={{ fontSize: 10, marginTop: 6 }}>Not yet covered</div>
        <div className="mono muted" style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>
          no run ≥ {record.dist.toFixed(2)} km
        </div>
      </div>
    );
  }
  const r = record.run;
  const color = `var(--type-${r.type})`;
  const isHover = hovered?.runId === r.id;
  const prPace = record.bestMin / record.dist;

  // Comparison line logic:
  //   bestBeforeCutoff → PR was set before the cutoff; current window hasn't
  //                      beaten it. Only meaningful for non-All-Time filters.
  //   else if prevMin present → "was X · date · −Δs" improvement line
  //   else                    → no attempts at this distance before the cutoff
  let compareBlock;
  if (record.bestBeforeCutoff && !isAllTime) {
    compareBlock = (
      <div className="mono muted" style={{ fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
        PR set before this window · no improvement since
      </div>
    );
  } else if (record.prevMin != null) {
    const improveSec = (record.prevMin - record.bestMin) * 60;
    compareBlock = (
      <div className="mono" style={{ fontSize: 10, marginTop: 4, color: 'var(--inkMuted)', letterSpacing: '.02em' }}>
        was <b style={{ color: 'var(--inkSoft)', fontWeight: 500 }}>{fmtDuration(record.prevMin)}</b>
        {' · '}{fmtDate(record.prevRun.date)}
        {improveSec > 0.5 && (
          <span className="stat-delta up" style={{ marginLeft: 6, fontSize: 10, fontWeight: 500 }}>
            −{improveSec.toFixed(0)}s
          </span>
        )}
      </div>
    );
  } else {
    compareBlock = (
      <div className="mono muted" style={{ fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
        {isAllTime ? 'only covered in recent half' : 'first coverage in this window'}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => onHover({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date })}
      onMouseLeave={() => onHover(null)}
      onClick={() => { onHover(null); onFocus(r.id); }}
      style={{
        position: 'relative',
        padding: '14px 14px 12px',
        background: 'var(--bg)',
        borderTop: `3px solid ${color}`,
        borderRight: `1px solid ${isHover ? 'var(--ink)' : 'var(--rule)'}`,
        borderBottom: `1px solid ${isHover ? 'var(--ink)' : 'var(--rule)'}`,
        borderLeft: `1px solid ${isHover ? 'var(--ink)' : 'var(--rule)'}`,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      <div className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        {record.label}
      </div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
        {fmtDuration(record.bestMin)}
      </div>
      <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
        {fmtPaceUnit(prPace, units)}{paceUnit(units)}
      </div>
      <div style={{ borderTop: '1px dashed var(--ruleSoft)', marginTop: 8, paddingTop: 6 }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>Set on</div>
        <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 13 }}>
          {fmtDate(r.date, { year: true })}
        </div>
        <div className="mono muted" style={{ fontSize: 10, marginTop: 1 }}>
          {meta[r.type].label}{r.note ? ` · ${r.note}` : ''}
        </div>
        {compareBlock}
      </div>
    </div>
  );
}
