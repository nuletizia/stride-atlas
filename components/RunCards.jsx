'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useData, useLink, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtDuration, fmtHr, hasValidHr,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  elevToDisplay, distUnit, paceUnit, elevUnit,
  MI_PER_KM,
} from '@/lib/shared';

export default function RunCards() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered, focusRequest, setFocusRequest } = useLink();
  const { units } = useTweaks();
  const meta = data.typeMeta;

  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [similarityMode, setSimilarityMode] = useState('type_distance');
  const [distTol, setDistTol] = useState(15);
  const [density, setDensity] = useState('compact');
  const [expandedId, setExpandedId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [capped, setCapped] = useState(true);
  const [rankBy, setRankBy] = useState('pace'); // 'pace' | 'hr'
  const [settingsOpen, setSettingsOpen] = useState(false);
  const CAP = 18;

  // How many runs in the current filter have valid HR. If fewer than 3, HR
  // ranking is too noisy to be useful, so we lock the toggle to pace.
  const hrValidCount = useMemo(
    () => runs.filter(hasValidHr).length,
    [runs]
  );
  const hrAvailable = hrValidCount >= 3;
  const effectiveRankBy = hrAvailable ? rankBy : 'pace';

  // Type-wide rank — same denominator for every card of the same type, so
  // "3/47" on card A and "14/47" on card B are directly comparable. Peer rank
  // (below) has a card-specific denominator driven by the ±distTol filter.
  // In HR mode we rank only runs with valid HR, ascending (lowest first);
  // runs without HR get no type rank.
  const typeRankMap = useMemo(() => {
    const byType = new Map();
    runs.forEach((r) => {
      if (!byType.has(r.type)) byType.set(r.type, []);
      byType.get(r.type).push(r);
    });
    const out = new Map();
    for (const [, arr] of byType) {
      if (effectiveRankBy === 'hr') {
        const withHr = arr.filter(hasValidHr);
        const sorted = [...withHr].sort((a, b) => a.hr - b.hr);
        sorted.forEach((r, i) => out.set(r.id, { rank: i + 1, total: withHr.length }));
      } else {
        const sorted = [...arr].sort((a, b) => a.pace - b.pace);
        sorted.forEach((r, i) => out.set(r.id, { rank: i + 1, total: arr.length }));
      }
    }
    return out;
  }, [runs, effectiveRankBy]);

  const withPeers = useMemo(() => {
    return runs.map((r) => {
      const typeRank = typeRankMap.get(r.id) || null;
      const peers = runs.filter((other) => {
        if (other.id === r.id) return false;
        if (similarityMode === 'route') return other.routeId === r.routeId;
        if (other.type !== r.type) return false;
        if (distTol >= 100) return true;
        return Math.abs(other.distance - r.distance) / r.distance <= distTol / 100;
      });
      const n = peers.length;
      const base = {
        ...r,
        typeRank: typeRank?.rank ?? null,
        typeRankTotal: typeRank?.total ?? null,
      };
      if (n === 0) return {
        ...base, peers: [], peerCount: 0, peerIds: new Set(),
        avgPace: null, bestPace: null, paceDelta: 0, paceRank: null, paceRankTotal: 0,
        avgHR: null, bestHR: null, hrPeerCount: 0, hrDelta: null, hrRank: null, hrRankTotal: 0,
      };

      // Pace aggregates — computed over the full peer set.
      const avgPace = peers.reduce((a, p) => a + p.pace, 0) / n;
      const bestPace = Math.min(...peers.map((p) => p.pace));
      const avgDist = peers.reduce((a, p) => a + p.distance, 0) / n;
      const pacesSorted = [...peers.map((p) => p.pace), r.pace].sort((a, b) => a - b);
      const paceRank = pacesSorted.indexOf(r.pace) + 1;
      const paceRankTotal = n + 1;

      // HR aggregates — only over peers with valid HR. Self must also have
      // valid HR to get an HR rank; otherwise HR mode falls back to "no data".
      const hrPeers = peers.filter(hasValidHr);
      const hrPeerCount = hrPeers.length;
      const avgHR = hrPeerCount ? hrPeers.reduce((a, p) => a + p.hr, 0) / hrPeerCount : null;
      const bestHR = hrPeerCount ? Math.min(...hrPeers.map((p) => p.hr)) : null;
      let hrRank = null, hrRankTotal = 0, hrDelta = null;
      if (hasValidHr(r) && hrPeerCount) {
        const hrsSorted = [...hrPeers.map((p) => p.hr), r.hr].sort((a, b) => a - b);
        hrRank = hrsSorted.indexOf(r.hr) + 1;
        hrRankTotal = hrPeerCount + 1;
        hrDelta = r.hr - avgHR;
      }

      // Active mode fields (consumed by RunCard directly).
      const active = effectiveRankBy === 'hr'
        ? { peerCount: hrPeerCount, rank: hrRank, rankTotal: hrRankTotal }
        : { peerCount: n, rank: paceRank, rankTotal: paceRankTotal };

      return {
        ...base,
        peers, peerIds: new Set(peers.map((p) => p.id)),
        avgPace, bestPace, avgDist,
        paceDelta: r.pace - avgPace, paceRank, paceRankTotal,
        avgHR, bestHR, hrPeerCount, hrDelta, hrRank, hrRankTotal,
        ...active,
      };
    });
  }, [runs, similarityMode, distTol, typeRankMap, effectiveRankBy]);

  const filtered = useMemo(() => {
    let arr = withPeers;
    if (typeFilter !== 'all') arr = arr.filter((r) => r.type === typeFilter);
    if (sortBy === 'newest') arr = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    else if (sortBy === 'fastest') arr = [...arr].sort((a, b) => a.pace - b.pace);
    else if (sortBy === 'longest') arr = [...arr].sort((a, b) => b.distance - a.distance);
    else if (sortBy === 'prs') arr = [...arr].sort((a, b) => (b.pr ? 1 : 0) - (a.pr ? 1 : 0) || b.date.localeCompare(a.date));
    return arr;
  }, [withPeers, typeFilter, sortBy]);

  const focusId = pinnedId ?? expandedId ?? hovered?.runId;
  const focusRun = withPeers.find((r) => r.id === focusId);
  const focusPeerIds = focusRun?.peerIds;

  // Click a peer tile inside "Recent similar runs" → expand that peer's card
  // and scroll to it. Also used by cross-panel jumps (AE/DPC dot click).
  // If the target is hidden by the type filter, widen to 'all' first so the
  // card exists in the DOM. Always uncap so the node is rendered.
  const jumpToRun = (runId) => {
    const target = withPeers.find((r) => r.id === runId);
    if (!target) return;
    if (typeFilter !== 'all' && target.type !== typeFilter) setTypeFilter('all');
    if (capped) setCapped(false);
    setExpandedId(runId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`run-card-${runId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  };

  // Cross-panel jump: another panel (e.g. AE / DPC scatter) writes a runId
  // into LinkContext.focusRequest; we trigger jumpToRun and clear it.
  useEffect(() => {
    if (!focusRequest) return;
    jumpToRun(focusRequest);
    setFocusRequest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const types = ['all', 'easy', 'tempo', 'intervals', 'recovery', 'long', 'race'];
  const minCol = density === 'compact' ? 150 : 220;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>
            Run Cards
            <span className="num muted" style={{ marginLeft: 8, fontSize: 10, letterSpacing: 0, textTransform: 'none' }}>
              {capped
                ? `${Math.min(CAP, filtered.length)}/${filtered.length} runs`
                : `${filtered.length}/${filtered.length} runs`}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 620 }}>
            Click a card to expand full stats. Open <b>⚙</b> to tune sort, ranking, density, and similarity.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Show</span>
          <div className="chip-row">
            {types.map((t) => (
              <button
                key={t}
                className={`chip ${typeFilter === t ? 'active' : ''}`}
                onClick={() => setTypeFilter(t)}
                style={t !== 'all' && typeFilter !== t ? { borderLeft: `3px solid var(--type-${t})` } : {}}
              >
                {t === 'all' ? 'All' : meta[t].label}
                <span className="num muted" style={{ marginLeft: 6, opacity: 0.7 }}>
                  {t === 'all' ? withPeers.length : withPeers.filter((r) => r.type === t).length}
                </span>
              </button>
            ))}
          </div>
          <button
            className={`chip ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Sort, ranking, density, similarity"
            aria-label="Toggle settings"
            style={{ padding: '5px 9px', fontSize: 12 }}
          >⚙</button>
        </div>
      </div>

      {settingsOpen && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 4,
          background: 'var(--bgSunken)', border: '1px solid var(--ruleSoft)',
          display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Sort</span>
            <div className="chip-row">
              {[
                { id: 'newest', label: 'Newest' },
                { id: 'fastest', label: 'Fastest' },
                { id: 'longest', label: 'Longest' },
                { id: 'prs', label: 'PRs' },
              ].map((s) => (
                <button key={s.id} className={`chip ${sortBy === s.id ? 'active' : ''}`} onClick={() => setSortBy(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Rank by</span>
            <div className="chip-row">
              <button
                className={`chip ${effectiveRankBy === 'pace' ? 'active' : ''}`}
                onClick={() => setRankBy('pace')}
              >Pace</button>
              <button
                className={`chip ${effectiveRankBy === 'hr' ? 'active' : ''}`}
                onClick={() => hrAvailable && setRankBy('hr')}
                disabled={!hrAvailable}
                title={hrAvailable ? 'Rank by average heart rate' : 'Too few runs with HR data'}
                style={!hrAvailable ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >HR</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Density</span>
            <div className="seg" style={{ height: 26 }}>
              <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')} style={{ padding: '4px 8px' }}>Dense</button>
              <button className={density === 'roomy' ? 'on' : ''} onClick={() => setDensity('roomy')} style={{ padding: '4px 8px' }}>Roomy</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                Similar · {similarityMode === 'route' ? 'same route' : 'same type'}
              </span>
              {similarityMode !== 'route' && (
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink)', fontWeight: 500 }}>
                  {distTol === 0 ? 'exact dist.' : distTol >= 100 ? 'any dist.' : `±${distTol}% dist.`}
                </span>
              )}
            </div>
            {similarityMode !== 'route' && (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={distTol}
                onChange={(e) => setDistTol(+e.target.value)}
                style={{ flex: 1, accentColor: 'var(--ink)' }}
              />
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`chip ${similarityMode === 'type_distance' ? 'active' : ''}`} onClick={() => setSimilarityMode('type_distance')}>Type</button>
              <button className={`chip ${similarityMode === 'route' ? 'active' : ''}`} onClick={() => setSimilarityMode('route')}>Same route</button>
            </div>
          </div>
        </div>
      )}

          {pinnedId && focusRun && (
            <div style={{
              marginBottom: 14, padding: '10px 14px',
              background: 'var(--bgSunken)', border: '1px solid var(--rule)', borderRadius: 4,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 12.5 }}>
                <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>Pinned · </span>
                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15 }}>
                  {fmtDate(focusRun.date, { year: true })} · {meta[focusRun.type].label} · {fmtDistance(focusRun.distance, units, 1)} {distUnit(units)}
                </span>
                <span className="muted"> — lighting up {focusRun.peerCount} similar run{focusRun.peerCount === 1 ? '' : 's'}</span>
              </div>
              <button className="chip" onClick={() => setPinnedId(null)}>Clear pin</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minCol}px, 1fr))`, gap: density === 'compact' ? 8 : 12 }}>
            {(capped ? filtered.slice(0, CAP) : filtered).map((r) => {
              const isFocus = focusId === r.id;
              const isPeer = focusPeerIds && focusPeerIds.has(r.id);
              const dim = focusId && !isFocus && !isPeer;
              const isExpanded = expandedId === r.id;
              return (
                <RunCard
                  key={r.id}
                  run={r}
                  density={density}
                  isFocus={isFocus}
                  isPeer={isPeer}
                  dim={dim}
                  expanded={isExpanded}
                  pinned={pinnedId === r.id}
                  meta={meta}
                  rankBy={effectiveRankBy}
                  units={units}
                  onHoverIn={() => setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date })}
                  onHoverOut={() => setHovered(null)}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  onPin={(e) => { e.stopPropagation(); setPinnedId(pinnedId === r.id ? null : r.id); }}
                  onPeerClick={jumpToRun}
                />
              );
            })}
          </div>

          {capped && filtered.length > CAP && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ruleSoft)' }}>
              <button className="chip" onClick={() => setCapped(false)}>
                Show {filtered.length - CAP} more
              </button>
            </div>
          )}
          {!capped && filtered.length > CAP && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ruleSoft)' }}>
              <button className="chip" onClick={() => setCapped(true)}>Show less</button>
            </div>
          )}

          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--inkMuted)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18 }}>
              No runs match these filters.
            </div>
          )}
    </div>
  );
}

function RunCard({ run, density, isFocus, isPeer, dim, expanded, pinned, meta, rankBy, units, onHoverIn, onHoverOut, onClick, onPin, onPeerClick }) {
  const color = `var(--type-${run.type})`;
  const hasPeers = run.peerCount > 0;
  const isHrMode = rankBy === 'hr';
  // min/km → min/display-unit; used to format per-unit pace deltas.
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;
  // Local to the expanded card: grid view (numeric tiles) vs scatter
  // (mini HR × pace plot of the peer cohort + current run).
  const [peerView, setPeerView] = useState('grid');

  // Metric accessor — lets the rest of the render read `m.*` without caring
  // which mode is active. `better(d)` is always "delta < 0", because both
  // lower pace and lower HR are the good direction.
  const m = isHrMode
    ? {
        delta: run.hrDelta,
        avg: run.avgHR,
        best: run.bestHR,
        self: run.hr,
        fmt: (v) => (v == null ? '—' : `${Math.round(v)}`),
        unit: 'bpm',
        fmtDeltaShort: (d) => `${Math.abs(Math.round(d))} bpm`,
        fmtDeltaLong: (d) => `${Math.abs(Math.round(d))} bpm vs avg`,
      }
    : {
        delta: run.paceDelta,
        avg: run.avgPace,
        best: run.bestPace,
        self: run.pace,
        fmt: (v) => fmtPace(paceToDisplay(v, units)),
        unit: paceUnit(units),
        fmtDeltaShort: (d) => `${Math.abs(d * 60 * paceK).toFixed(0)}s`,
        fmtDeltaLong: (d) => `${Math.abs(d * 60 * paceK).toFixed(0)}s${paceUnit(units)} vs avg`,
      };
  const delta = m.delta ?? 0;
  const hasDelta = m.delta != null;
  const better = hasDelta && delta < 0;
  const sign = better ? '−' : '+';

  // Type-wide rank shares a denominator across every card of the same type.
  // In HR mode the label gets a "· HR" suffix so the shrunken denominator is
  // self-explanatory.
  const typeRankText = run.typeRankTotal
    ? `${ordinal(run.typeRank)}/${run.typeRankTotal} ${meta[run.type].label.toLowerCase()}${isHrMode ? ' · HR' : ''}`
    : null;
  const compact = density === 'compact' && !expanded;

  const cardStyle = {
    position: 'relative',
    background: 'var(--bg)',
    borderTop: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    borderRight: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    borderBottom: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    borderLeft: `3px solid ${color}`,
    borderRadius: 4,
    padding: compact ? '8px 10px' : '12px 14px',
    opacity: dim ? 0.28 : 1,
    boxShadow: isFocus ? '0 2px 0 0 var(--ink)' : isPeer ? `0 0 0 1px ${color}` : 'none',
    cursor: 'pointer',
    transition: 'opacity 140ms, border-color 120ms',
    gridColumn: expanded ? '1 / -1' : 'auto',
  };

  if (compact) {
    return (
      <div id={`run-card-${run.id}`} onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {new Date(run.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 10.5, color: 'var(--inkSoft)', fontWeight: 500 }}>
            {meta[run.type].label}
            {run.pr && <span style={{ marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 8.5, background: 'var(--ink)', color: 'var(--bg)', padding: '1px 4px', borderRadius: 2 }}>PR</span>}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
          <span className="num" style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>
            {fmtDistance(run.distance, units, 1)}<span className="mono muted" style={{ fontSize: 9.5, marginLeft: 1, fontWeight: 400 }}>{distUnit(units)}</span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.1 }}>
            <span className="num" style={{ fontSize: 13, color: 'var(--inkSoft)', fontWeight: 500 }}>
              {fmtPaceUnit(run.pace, units)}<span className="mono muted" style={{ fontSize: 9, marginLeft: 1, fontWeight: 400 }}>{paceUnit(units)}</span>
            </span>
            <span
              className="num"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: hasValidHr(run) ? 'var(--inkSoft)' : 'var(--inkMuted)',
                fontStyle: hasValidHr(run) ? 'normal' : 'italic',
              }}
            >
              {hasValidHr(run) ? run.hr : '—'}<span className="mono muted" style={{ fontSize: 9, marginLeft: 1, fontWeight: 400 }}>bpm</span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.06em' }} title={`Rank across all runs of this type · ${isHrMode ? 'HR' : 'pace'}`}>
            {typeRankText || '—'}
          </span>
          {hasPeers ? <MiniPeerBar run={run} color={color} rankBy={rankBy} /> : <span className="mono muted" style={{ fontSize: 9, fontStyle: 'italic' }}>no peers</span>}
          <span className={`stat-delta num ${better ? 'up' : 'down'}`} style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {hasPeers && hasDelta ? `${sign}${m.fmtDeltaShort(delta)}` : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div id={`run-card-${run.id}`} onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
            {new Date(run.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: expanded ? 'numeric' : undefined })}
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 16, marginTop: 1 }}>
            {meta[run.type].label} · <span style={{ fontStyle: 'normal', fontFamily: 'var(--sans)', fontSize: 13 }}>{run.routeName}</span>
            {run.pr && <span style={{ marginLeft: 6, fontStyle: 'normal', fontFamily: 'var(--mono)', fontSize: 9, background: 'var(--ink)', color: 'var(--bg)', padding: '1px 5px', borderRadius: 2, letterSpacing: '.1em', verticalAlign: 'middle' }}>PR</span>}
          </div>
        </div>
        {expanded && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="chip" onClick={onPin}>{pinned ? 'Unpin' : 'Pin'}</button>
            <button className="chip" onClick={(e) => { e.stopPropagation(); onClick(); }}>Close</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 10, marginBottom: 10 }}>
        <CardStat label="Dist" value={fmtDistance(run.distance, units, 2)} unit={distUnit(units)} />
        <CardStat label="Pace" value={fmtPaceUnit(run.pace, units)} unit={paceUnit(units)} />
        <CardStat label="HR" value={hasValidHr(run) ? run.hr : '—'} unit={hasValidHr(run) ? 'bpm' : ''} />
        {expanded && <CardStat label="Time" value={fmtDuration(run.duration)} />}
        {expanded && <CardStat label="Elev" value={run.elev != null ? `${Math.round(elevToDisplay(run.elev, units))}` : '—'} unit={run.elev != null ? elevUnit(units) : ''} />}
      </div>

      {hasPeers && run.rank != null ? (
        <div style={{ borderTop: '1px dashed var(--ruleSoft)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              vs {run.peerCount} {isHrMode ? 'HR peers' : 'similar'} · {ordinal(run.rank)} of {run.rankTotal}
              {typeRankText && (
                <span style={{ marginLeft: 8, opacity: 0.75 }}>· {typeRankText}</span>
              )}
            </span>
            {hasDelta && (
              <span className={`stat-delta num ${better ? 'up' : 'down'}`} style={{ fontSize: 12, fontWeight: 500 }}>
                {sign}{m.fmtDeltaLong(delta)}
              </span>
            )}
          </div>
          <PeerDistribution run={run} color={color} showAxis={expanded} rankBy={rankBy} units={units} />
          {expanded && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--inkSoft)' }}>
              <span>Peer best: <b style={{ color: 'var(--ink)' }}>{m.fmt(m.best)}{isHrMode ? ' bpm' : ''}</b></span>
              <span>Peer avg: <b style={{ color: 'var(--ink)' }}>{m.fmt(m.avg)}{isHrMode ? ' bpm' : ''}</b></span>
              <span>This run: <b style={{ color: 'var(--ink)' }}>{m.fmt(m.self)}{isHrMode ? ' bpm' : ''}</b></span>
            </div>
          )}
        </div>
      ) : (
        <div className="mono muted" style={{ fontSize: 10.5, fontStyle: 'italic', textAlign: 'center', padding: '6px 0', borderTop: '1px dashed var(--ruleSoft)', marginTop: 4 }}>
          {isHrMode && hasPeers
            ? 'No HR data for this run — can’t rank by heart rate'
            : 'First of its kind — no similar runs yet'}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--ruleSoft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Recent similar runs{peerView === 'grid' ? ` · sorted by ${isHrMode ? 'lowest avg HR' : 'fastest pace'}` : ' · HR × pace'}
            </div>
            <div
              className="seg"
              style={{ height: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={peerView === 'grid' ? 'on' : ''}
                onClick={(e) => { e.stopPropagation(); setPeerView('grid'); }}
                style={{ padding: '3px 8px', fontSize: 10.5 }}
              >Grid</button>
              <button
                className={peerView === 'scatter' ? 'on' : ''}
                onClick={(e) => { e.stopPropagation(); setPeerView('scatter'); }}
                style={{ padding: '3px 8px', fontSize: 10.5 }}
              >Scatter</button>
            </div>
          </div>
          {peerView === 'scatter' ? (
            <PeerScatter
              run={run}
              color={color}
              onPeerClick={onPeerClick}
              units={units}
            />
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 6 }}>
            {(() => {
              // Sort by active metric. In HR mode, peers without valid HR sink
              // to the bottom. Runs are ranked starting from 1 for the best
              // one on the metric; the current run's own rank is `run.rank`.
              const sorted = [...run.peers].sort((a, b) => {
                if (isHrMode) {
                  const aHas = hasValidHr(a), bHas = hasValidHr(b);
                  if (aHas && !bHas) return -1;
                  if (!aHas && bHas) return 1;
                  if (!aHas && !bHas) return b.date.localeCompare(a.date);
                  return a.hr - b.hr;
                }
                return a.pace - b.pace;
              });
              return sorted.slice(0, 8).map((p, i) => {
                const pFaster = p.pace < run.pace;
                const pLowerHr = hasValidHr(p) && hasValidHr(run) && p.hr < run.hr;
                const clickable = typeof onPeerClick === 'function';
                return (
                  <div
                    key={p.id}
                    onClick={clickable ? (e) => { e.stopPropagation(); onPeerClick(p.id); } : undefined}
                    style={{
                      padding: '6px 8px',
                      background: 'var(--bgSunken)',
                      borderLeft: `2px solid ${color}`,
                      borderRadius: 3,
                      cursor: clickable ? 'pointer' : 'default',
                      transition: 'background-color 120ms, transform 120ms',
                    }}
                    onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = 'var(--bgRaised)'; } : undefined}
                    onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = 'var(--bgSunken)'; } : undefined}
                    title={clickable ? 'Jump to this run' : undefined}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.06em' }}>
                        {i + 1}. {fmtDate(p.date, { year: true })}
                      </span>
                      {clickable && (
                        <span className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', opacity: 0.6 }}>↗</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                      <span className="num" style={{ fontSize: 11.5, fontWeight: 500 }}>{fmtDistance(p.distance, units, 1)}{distUnit(units)}</span>
                      <span className="num" style={{ fontSize: 11.5, color: pFaster ? 'var(--positive)' : 'var(--accent)' }}>{fmtPaceUnit(p.pace, units)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                      <span className="mono" style={{ fontSize: 10, color: hasValidHr(p) ? (pLowerHr ? 'var(--positive)' : 'var(--inkSoft)') : 'var(--inkMuted)', fontStyle: hasValidHr(p) ? 'normal' : 'italic' }}>
                        HR {hasValidHr(p) ? `${p.hr} bpm` : '—'}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          )}
          {run.note && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--inkSoft)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
              &ldquo;{run.note}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Reads the active metric off a run/peer: `pace` unless rankBy === 'hr'.
// In HR mode we only want HR-valid entries; the caller filters accordingly.
function axisFor(run, rankBy) {
  const isHr = rankBy === 'hr';
  const peers = isHr ? run.peers.filter(hasValidHr) : run.peers;
  const self = isHr ? run.hr : run.pace;
  const avg = isHr ? run.avgHR : run.avgPace;
  const values = peers.map((p) => (isHr ? p.hr : p.pace));
  return { isHr, peers, self, avg, values };
}

function MiniPeerBar({ run, color, rankBy }) {
  const { isHr, peers, self, avg, values } = axisFor(run, rankBy);
  if (!peers.length || self == null || avg == null) {
    return <div className="mono muted" style={{ fontSize: 9, fontStyle: 'italic', flex: 1, textAlign: 'center' }}>no HR peers</div>;
  }
  const all = [...values, self];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(isHr ? 1 : 0.1, hi - lo);
  const selfX = ((self - lo) / span) * 100;
  const avgX = ((avg - lo) / span) * 100;
  return (
    <div style={{ position: 'relative', flex: 1, height: 10, margin: '0 4px' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
      {peers.map((p) => {
        const v = isHr ? p.hr : p.pace;
        const x = ((v - lo) / span) * 100;
        return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 3, width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: color, opacity: 0.45 }} />;
      })}
      <span style={{ position: 'absolute', left: `${avgX}%`, top: 1, width: 1, height: 8, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
      <span style={{ position: 'absolute', left: `${selfX}%`, top: -1, width: 2, height: 12, marginLeft: -1, background: 'var(--ink)' }} />
    </div>
  );
}

function PeerDistribution({ run, color, showAxis, rankBy, units = 'km' }) {
  const { isHr, peers, self, avg, values } = axisFor(run, rankBy);
  if (!peers.length || self == null || avg == null) return null;
  const all = [...values, self];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(isHr ? 1 : 0.1, hi - lo);
  const selfX = ((self - lo) / span) * 100;
  const avgX = ((avg - lo) / span) * 100;
  return (
    <div>
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
        {peers.map((p) => {
          const v = isHr ? p.hr : p.pace;
          const x = ((v - lo) / span) * 100;
          return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 6, width: 6, height: 6, marginLeft: -3, borderRadius: '50%', background: color, opacity: 0.45 }} />;
        })}
        <span style={{ position: 'absolute', left: `${avgX}%`, top: 3, width: 1, height: 12, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
        <span style={{ position: 'absolute', left: `${selfX}%`, top: 1, width: 2, height: 16, marginLeft: -1, background: 'var(--ink)' }} />
      </div>
      {showAxis && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--inkMuted)', marginTop: 2 }}>
          <span>{isHr ? `lower HR ${Math.round(lo)}` : `faster ${fmtPace(paceToDisplay(lo, units))}`}</span>
          <span>{isHr ? `higher HR ${Math.round(hi)}` : `slower ${fmtPace(paceToDisplay(hi, units))}`}</span>
        </div>
      )}
    </div>
  );
}

// SVG scatter dot with a generous invisible hit target. Also grows and
// outlines on hover so the user has clear feedback that it's clickable.
function ScatterDot({ cx, cy, r, fill, fillOpacity, stroke, strokeWidth, title, onClick, isSelf }) {
  const [hover, setHover] = useState(false);
  const clickable = typeof onClick === 'function';
  const hoverR = clickable ? r + 1.5 : r;
  return (
    <g
      style={{ cursor: clickable ? 'pointer' : 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={clickable ? (e) => { e.stopPropagation(); onClick(e); } : undefined}
    >
      <title>{title}</title>
      {/* Invisible hit target — ~12px radius is comfortable even on touch. */}
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle
        cx={cx} cy={cy}
        r={hover ? hoverR : r}
        fill={fill} fillOpacity={fillOpacity}
        stroke={hover && clickable ? 'var(--ink)' : stroke}
        strokeWidth={hover && clickable ? Math.max(strokeWidth + 0.5, 1.5) : strokeWidth}
        style={{ transition: 'r 100ms, stroke-width 100ms' }}
      />
    </g>
  );
}

// Mini HR × pace scatter plotting this run + its similar-run cohort.
// Complements the numeric grid by showing where the current run sits
// spatially among its peers. Same axis convention as the Aerobic Efficiency
// panel: HR on X (low → high), pace on Y (faster = top). Improving corner
// is up-left. Dots are clickable — clicking a peer jumps to that run.
function PeerScatter({ run, color, onPeerClick, units = 'km' }) {
  const selfHasHr = hasValidHr(run);
  const hrPeers = run.peers.filter(hasValidHr);
  const hiddenCount = run.peers.length - hrPeers.length;

  if (!selfHasHr || hrPeers.length === 0) {
    return (
      <div className="mono muted" style={{
        fontSize: 11, fontStyle: 'italic', textAlign: 'center',
        padding: '24px 12px',
        background: 'var(--bgSunken)', borderRadius: 3,
      }}>
        {!selfHasHr
          ? 'This run has no HR data — scatter view needs heart rate to place dots.'
          : 'None of the similar runs have HR data yet.'}
      </div>
    );
  }

  const points = [...hrPeers, run];
  const paces = points.map((p) => p.pace);
  const hrs = points.map((p) => p.hr);
  const paceLo = Math.min(...paces);
  const paceHi = Math.max(...paces);
  const hrLo = Math.min(...hrs);
  const hrHi = Math.max(...hrs);
  const pP = (paceHi - paceLo) * 0.12 || 0.3;
  const hP = (hrHi - hrLo) * 0.12 || 5;
  const bounds = {
    paceMin: paceLo - pP,
    paceMax: paceHi + pP,
    hrMin: Math.floor((hrLo - hP) / 5) * 5,
    hrMax: Math.ceil((hrHi + hP) / 5) * 5,
  };

  const W = 320, H = 180;
  const M = { l: 40, r: 14, t: 14, b: 30 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  // X: HR (low → high, left-to-right natural).
  // Y: pace, inverted so fastest pace (smallest min/km value) sits at the
  // top — improving corner reads as "up-left": faster pace at lower HR.
  const xFor = (hr) => M.l + ((hr - bounds.hrMin) / (bounds.hrMax - bounds.hrMin)) * plotW;
  const yFor = (p) => M.t + ((p - bounds.paceMin) / (bounds.paceMax - bounds.paceMin)) * plotH;

  // Two pace + two HR reference ticks, rounded to clean values.
  const paceTickStep = (bounds.paceMax - bounds.paceMin) > 1.5 ? 0.5 : 0.25;
  const paceTicks = [];
  const firstPace = Math.ceil(bounds.paceMin / paceTickStep) * paceTickStep;
  for (let p = firstPace; p <= bounds.paceMax; p += paceTickStep) paceTicks.push(+p.toFixed(2));
  const hrTicks = [];
  const firstHr = Math.ceil(bounds.hrMin / 10) * 10;
  for (let h = firstHr; h <= bounds.hrMax; h += 10) hrTicks.push(h);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}>
        {/* Grid — HR verticals on X, pace horizontals on Y */}
        {hrTicks.map((hr, i) => (
          <g key={`h-${hr}`}>
            <line
              x1={xFor(hr)} x2={xFor(hr)}
              y1={M.t} y2={H - M.b}
              stroke="var(--ruleSoft)" strokeWidth={1}
              strokeDasharray={i === 0 || i === hrTicks.length - 1 ? '0' : '2 3'}
            />
            <text x={xFor(hr)} y={H - M.b + 13} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>{hr}</text>
          </g>
        ))}
        {paceTicks.map((p) => (
          <g key={`p-${p}`}>
            <line x1={M.l} x2={W - M.r} y1={yFor(p)} y2={yFor(p)} stroke="var(--ruleSoft)" strokeWidth={1} />
            <text x={M.l - 6} y={yFor(p) + 3} textAnchor="end" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>{fmtPace(paceToDisplay(p, units))}</text>
          </g>
        ))}

        {/* Axis labels */}
        <text
          x={M.l - 30} y={M.t + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${M.l - 30} ${M.t + plotH / 2})`}
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkSoft)', letterSpacing: '.08em', textTransform: 'uppercase' }}
        >Pace · faster ↑</text>
        <text
          x={M.l + plotW / 2} y={H - 4}
          textAnchor="middle"
          style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkSoft)', letterSpacing: '.08em', textTransform: 'uppercase' }}
        >HR (bpm)</text>

        {/* Improving arrow (up-left: faster pace + lower HR) */}
        <g opacity="0.45">
          <defs>
            <marker id={`ps-arrow-${run.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--inkSoft)" />
            </marker>
          </defs>
          <line
            x1={W - M.r - 10} y1={H - M.b - 10}
            x2={M.l + 20} y2={M.t + 14}
            stroke="var(--inkSoft)" strokeWidth={0.8}
            strokeDasharray="2 3"
            markerEnd={`url(#ps-arrow-${run.id})`}
          />
          <text x={M.l + 30} y={M.t + 22} style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 10, fill: 'var(--inkSoft)' }}>improving</text>
        </g>

        {/* Peer dots — wrapped with an invisible larger hit circle so they're
            easy to click. Hover enlarges + stroke-highlights the visible dot. */}
        {hrPeers.map((p) => (
          <ScatterDot
            key={p.id}
            cx={xFor(p.hr)} cy={yFor(p.pace)}
            r={4.5}
            fill={color}
            fillOpacity={0.55}
            stroke="var(--bg)"
            strokeWidth={1}
            title={`${fmtDate(p.date, { year: true })} · ${fmtDistance(p.distance, units, 1)}${distUnit(units)} · ${fmtPaceUnit(p.pace, units)}${paceUnit(units)} · ${p.hr} bpm · click to open`}
            onClick={onPeerClick ? () => onPeerClick(p.id) : undefined}
          />
        ))}

        {/* Current run — larger, outlined so it reads as the focus. Not
            clickable (it's already the expanded card). */}
        <ScatterDot
          cx={xFor(run.hr)} cy={yFor(run.pace)}
          r={6.5}
          fill={color}
          fillOpacity={0.9}
          stroke="var(--ink)"
          strokeWidth={1.5}
          title={`This run · ${fmtDate(run.date, { year: true })} · ${fmtDistance(run.distance, units, 1)}${distUnit(units)} · ${fmtPaceUnit(run.pace, units)}${paceUnit(units)} · ${run.hr} bpm`}
          isSelf
        />

        {/* Plot border */}
        <rect x={M.l} y={M.t} width={plotW} height={plotH} fill="none" stroke="var(--rule)" strokeWidth={1} />
      </svg>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--inkMuted)',
      }}>
        <span>
          <span style={{
            display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
            background: color, border: '1.5px solid var(--ink)', verticalAlign: 'middle',
            marginRight: 5,
          }} />
          this run
          <span style={{ display: 'inline-block', marginLeft: 14 }}>
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: color, opacity: 0.55, verticalAlign: 'middle', marginRight: 5,
            }} />
            peer
          </span>
        </span>
        {hiddenCount > 0 && (
          <span style={{ fontStyle: 'italic', color: 'var(--inkMuted)' }}>
            {hiddenCount} peer{hiddenCount === 1 ? '' : 's'} hidden · no HR
          </span>
        )}
      </div>
    </div>
  );
}

function CardStat({ label, value, unit }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
        {value}
        {unit && <span className="mono muted" style={{ fontSize: 9.5, marginLeft: 2, fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
