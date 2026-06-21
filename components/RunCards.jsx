'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useData, useLink, useTweaks, useFilteredRuns, useExclusions,
  fmtDate, fmtPace, fmtDuration, fmtHr, hasValidHr, isInterrupted,
  fmtDistance, fmtPaceUnit, kmToDisplay, paceToDisplay,
  elevToDisplay, distUnit, paceUnit, elevUnit, efOf,
  fmtTemp, tempUnit,
  Highlight, HlNum, MI_PER_KM,
} from '@/lib/shared';

export default function RunCards() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered, focusRequest, setFocusRequest, setUserSelectedRunId, selectedRunId } = useLink();
  const { units, tempUnits, stoppedThreshold } = useTweaks();
  const { isExcluded, toggle: toggleExclusion } = useExclusions();
  const meta = data.typeMeta;

  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [similarityMode, setSimilarityMode] = useState('type_distance');
  const [distTol, setDistTol] = useState(15);
  const [density, setDensity] = useState('compact');
  const [expandedId, setExpandedId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [capped, setCapped] = useState(true);
  const [rankBy, setRankBy] = useState('pace'); // 'pace' | 'hr' | 'efficiency'
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Transient: the run we just jumped to, so we can flash-outline its card
  // as an orientation cue. Cleared by a timer after the animation ends.
  const [flashingRunId, setFlashingRunId] = useState(null);
  // Local hover state — scoped to this panel so card-hover highlights peers
  // within the grid without rippling out to every other chart (cards are a
  // terminal "detail" view, not an index; the global link was noise here).
  // The inverse direction (chart dot hover → card focus) still works via the
  // global `hovered` below.
  const [hoveredCardId, setHoveredCardId] = useState(null);
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
  // HR and Efficiency modes rank only runs with valid HR; pace mode ranks
  // every run. Pace and HR sort ascending (lower = better), efficiency
  // sorts descending (higher = better).
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
      } else if (effectiveRankBy === 'efficiency') {
        const withHr = arr.filter(hasValidHr);
        const sorted = [...withHr].sort((a, b) => efOf(b) - efOf(a));
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
        ef: efOf(r), avgEF: null, bestEF: null, efPeerCount: 0, efDelta: null, efRank: null, efRankTotal: 0,
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

      // Efficiency aggregates — share the HR-valid peer set since the metric
      // requires HR. Sort/rank descending because higher efficiency is better.
      const efPeers = hrPeers;
      const efPeerCount = efPeers.length;
      const efSelf = efOf(r);
      const avgEF = efPeerCount ? efPeers.reduce((a, p) => a + efOf(p), 0) / efPeerCount : null;
      const bestEF = efPeerCount ? Math.max(...efPeers.map(efOf)) : null;
      let efRank = null, efRankTotal = 0, efDelta = null;
      if (efSelf != null && efPeerCount) {
        const efsSorted = [...efPeers.map(efOf), efSelf].sort((a, b) => b - a);
        efRank = efsSorted.indexOf(efSelf) + 1;
        efRankTotal = efPeerCount + 1;
        efDelta = efSelf - avgEF;
      }

      // Active mode fields (consumed by RunCard directly).
      const active = effectiveRankBy === 'hr'
        ? { peerCount: hrPeerCount, rank: hrRank, rankTotal: hrRankTotal }
        : effectiveRankBy === 'efficiency'
          ? { peerCount: efPeerCount, rank: efRank, rankTotal: efRankTotal }
          : { peerCount: n, rank: paceRank, rankTotal: paceRankTotal };

      return {
        ...base,
        peers, peerIds: new Set(peers.map((p) => p.id)),
        avgPace, bestPace, avgDist,
        paceDelta: r.pace - avgPace, paceRank, paceRankTotal,
        avgHR, bestHR, hrPeerCount, hrDelta, hrRank, hrRankTotal,
        ef: efSelf, avgEF, bestEF, efPeerCount, efDelta, efRank, efRankTotal,
        ...active,
      };
    });
  }, [runs, similarityMode, distTol, typeRankMap, effectiveRankBy]);

  const filtered = useMemo(() => {
    let arr = withPeers;
    // HR-required modes only consider HR-valid runs. A run with no HR
    // can't be ranked on heart rate or efficiency, so showing it in the
    // grid alongside ranked peers would be misleading — and it'd dilute
    // the rank denominator with cards that always read "—". Hide them.
    if (effectiveRankBy === 'hr' || effectiveRankBy === 'efficiency') {
      arr = arr.filter(hasValidHr);
    }
    if (typeFilter !== 'all') arr = arr.filter((r) => r.type === typeFilter);
    if (sortBy === 'newest') arr = [...arr].sort((a, b) => b.date.localeCompare(a.date));
    else if (sortBy === 'fastest') arr = [...arr].sort((a, b) => a.pace - b.pace);
    else if (sortBy === 'longest') arr = [...arr].sort((a, b) => b.distance - a.distance);
    else if (sortBy === 'prs') arr = [...arr].sort((a, b) => (b.pr ? 1 : 0) - (a.pr ? 1 : 0) || b.date.localeCompare(a.date));
    return arr;
  }, [withPeers, typeFilter, sortBy, effectiveRankBy]);

  const focusId = pinnedId ?? expandedId ?? hoveredCardId ?? hovered?.runId;
  const focusRun = withPeers.find((r) => r.id === focusId);
  const focusPeerIds = focusRun?.peerIds;

  // Click a peer tile inside "Recent similar runs" → expand that peer's card
  // and scroll to it. Also used by cross-panel jumps (AE/DPC dot click).
  // If the target is hidden by the type filter, widen to 'all' first so the
  // card exists in the DOM. Same fallback for the active rank mode: when an
  // HR-less run is jumped to while in HR/EF mode (which hides such runs),
  // flip back to pace so the target card actually appears. Always uncap so
  // the node is rendered.
  const jumpToRun = (runId) => {
    const target = withPeers.find((r) => r.id === runId);
    if (!target) return;
    if (typeFilter !== 'all' && target.type !== typeFilter) setTypeFilter('all');
    if ((effectiveRankBy === 'hr' || effectiveRankBy === 'efficiency') && !hasValidHr(target)) {
      setRankBy('pace');
    }
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
  // into LinkContext.focusRequest; we trigger jumpToRun, flash the arrival,
  // and clear the request.
  useEffect(() => {
    if (!focusRequest) return;
    jumpToRun(focusRequest);
    setFlashingRunId(focusRequest);
    setFocusRequest(null);
    const t = setTimeout(() => setFlashingRunId(null), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Click-outside-the-panel-to-collapse. Only pointerdowns truly outside the
  // RunCards panel dismiss the expansion — clicks inside the panel (type
  // chips, ⚙, settings drawer, another card, peer tiles) keep their own
  // behaviour. Saves a long scroll back up on mobile to close the card
  // without breaking desktop navigation of the panel's chrome.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!expandedId) return;
    const onPointerDown = (e) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target)) return;
      setExpandedId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expandedId]);

  // Mirror the expanded card into LinkContext so cross-panel views (Trend
  // Ribbons + the two scatters) can ring the matching dot. The "default
  // = latest run" fallback lives in Dashboard so it works in compact
  // view too (where RunCards isn't mounted); here we only own the
  // user's explicit override.
  useEffect(() => {
    setUserSelectedRunId(expandedId);
    return () => setUserSelectedRunId(null);
  }, [expandedId, setUserSelectedRunId]);

  const types = ['all', 'easy', 'tempo', 'intervals', 'recovery', 'long', 'race'];
  const minCol = density === 'compact' ? 150 : 220;

  return (
    <div className="panel" ref={panelRef} style={{ padding: '20px 22px' }}>
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
            Every run as a card. Click one to expand and see it compared against a cohort of <b>similar</b> runs.
            Click any dot in <i>Aerobic Efficiency</i> or <i>Aerobic Durability</i> to jump straight to that run here.
            Open <b>⚙</b> to change what counts as &ldquo;similar&rdquo;, how ranks are computed, and card density.
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
          display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
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
            <span style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.4 }}>
              Order of cards in the grid.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 260 }}>
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
              <button
                className={`chip ${effectiveRankBy === 'efficiency' ? 'active' : ''}`}
                onClick={() => hrAvailable && setRankBy('efficiency')}
                disabled={!hrAvailable}
                title={hrAvailable ? 'Speed (m/min) ÷ avg HR; higher = more efficient' : 'Too few runs with HR data'}
                style={{
                  borderLeft: '3px solid var(--accent)',
                  ...(hrAvailable ? {} : { opacity: 0.4, cursor: 'not-allowed' }),
                }}
              >Efficiency</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.4 }}>
              What each card&rsquo;s rank number means. <b>Pace</b> = fastest first. <b>HR</b> = lowest avg HR first (useful for aerobic base). <b>Efficiency</b> = highest speed-per-bpm first.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 180 }}>
            <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em' }}>Density</span>
            <div className="seg" style={{ height: 26 }}>
              <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')} style={{ padding: '4px 8px' }}>Dense</button>
              <button className={density === 'roomy' ? 'on' : ''} onClick={() => setDensity('roomy')} style={{ padding: '4px 8px' }}>Roomy</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.4 }}>
              Card size. <b>Dense</b> fits more per row.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240, maxWidth: 300 }}>
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
            <span style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.4 }}>
              Which runs count as peers on each card. <b>Type</b> picks same-workout peers within {distTol === 0 ? 'exactly the same distance' : distTol >= 100 ? 'any distance' : <>±{distTol}% of this run&rsquo;s distance</>}; tighter means a more direct comparison, looser means more peers. <b>Same route</b> restricts to identical routes.
            </span>
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
                <span className="muted">, lighting up {focusRun.peerCount} similar run{focusRun.peerCount === 1 ? '' : 's'}</span>
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
              const isFlashing = flashingRunId === r.id;
              // The card matching the cross-panel ring, only when the
              // user hasn't explicitly opened a different one. Gives the
              // "latest run by default" state a visible anchor here.
              const isLatestRing = !expandedId && selectedRunId === r.id;
              return (
                <RunCard
                  key={r.id}
                  run={r}
                  density={density}
                  isFocus={isFocus}
                  isPeer={isPeer}
                  dim={dim}
                  excluded={isExcluded(r.id)}
                  expanded={isExpanded}
                  pinned={pinnedId === r.id}
                  flashing={isFlashing}
                  isLatestRing={isLatestRing}
                  meta={meta}
                  rankBy={effectiveRankBy}
                  units={units}
                  tempUnits={tempUnits}
                  stoppedThreshold={stoppedThreshold}
                  onHoverIn={() => setHoveredCardId(r.id)}
                  onHoverOut={() => setHoveredCardId(null)}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  onPin={(e) => { e.stopPropagation(); setPinnedId(pinnedId === r.id ? null : r.id); }}
                  onToggleExclude={(e) => { e.stopPropagation(); toggleExclusion(r.id); }}
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

function RunCard({ run, density, isFocus, isPeer, dim, excluded, expanded, pinned, flashing, isLatestRing, meta, rankBy, units, tempUnits, stoppedThreshold, onHoverIn, onHoverOut, onClick, onPin, onToggleExclude, onPeerClick }) {
  const color = `var(--type-${run.type})`;
  const hasPeers = run.peerCount > 0;
  const isHrMode = rankBy === 'hr';
  const isEfMode = rankBy === 'efficiency';
  // Stopped time (red lights, pauses) = elapsed − moving. `run.duration` is
  // moving minutes; elapsed is recovered from the stopped share. Shown only on
  // the opened card, as a Moving / Elapsed pair next to the time — we don't
  // exclude or re-rank on it.
  const interrupted = isInterrupted(run, stoppedThreshold);
  const stoppedPct = Math.round((run.stoppedRatio ?? 0) * 100);
  const elapsedMin = run.stoppedRatio ? run.duration / (1 - run.stoppedRatio) : run.duration;
  // min/km → min/display-unit; used to format per-unit pace deltas.
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;
  // Local to the expanded card: grid view (numeric tiles) vs scatter
  // (mini HR × pace plot of the peer cohort + current run).
  const [peerView, setPeerView] = useState('grid');

  // Metric accessor — lets the rest of the render read `m.*` without caring
  // which mode is active. Pace and HR: lower delta = better. Efficiency
  // inverts: higher delta = better. The `better`/`sign` derivation below
  // handles that asymmetry so the styling stays mode-agnostic.
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
    : isEfMode
    ? {
        delta: run.efDelta,
        avg: run.avgEF,
        best: run.bestEF,
        self: run.ef,
        fmt: (v) => (v == null ? '—' : v.toFixed(2)),
        unit: '',
        fmtDeltaShort: (d) => Math.abs(d).toFixed(2),
        fmtDeltaLong: (d) => `${Math.abs(d).toFixed(2)} vs avg`,
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
  // Better-direction: lower for pace/HR, higher for efficiency.
  const better = hasDelta && (isEfMode ? delta > 0 : delta < 0);
  // Sign always tracks the actual sign of the delta, so a positive
  // efficiency delta reads as "+0.05" (good) rather than getting flipped
  // by the `better`-derived sign the old code used.
  const sign = delta < 0 ? '−' : '+';

  // Type-wide rank shares a denominator across every card of the same type.
  // HR and Efficiency modes get a suffix so the shrunken denominator (HR-
  // valid runs only) is self-explanatory.
  const typeRankText = run.typeRankTotal
    ? `${ordinal(run.typeRank)}/${run.typeRankTotal} ${meta[run.type].label.toLowerCase()}${isHrMode ? ' · HR' : isEfMode ? ' · EF' : ''}`
    : null;
  const compact = density === 'compact' && !expanded;

  const cardStyle = {
    position: 'relative',
    background: 'var(--bg)',
    borderTop: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    borderRight: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    borderBottom: `1px solid ${isFocus ? 'var(--ink)' : isPeer ? color : 'var(--rule)'}`,
    // Excluded runs get a dashed left rule + reduced opacity so it's obvious
    // at a glance they're not feeding any stat. Peer-dim (0.28) still wins
    // when this card isn't the current focus/peer.
    borderLeft: `3px ${excluded ? 'dashed' : 'solid'} ${color}`,
    borderRadius: 4,
    padding: compact ? '8px 10px' : '12px 14px',
    opacity: dim ? 0.28 : excluded ? 0.5 : 1,
    // Priority: focus (interactive) > peer (similar) > latest-ring
    // (default cross-panel selection). Latest-ring uses an accent
    // outline matching the chart-dot ring so the visual link reads
    // immediately.
    boxShadow: isFocus
      ? '0 2px 0 0 var(--ink)'
      : isPeer
        ? `0 0 0 1px ${color}`
        : isLatestRing
          ? '0 0 0 1.5px var(--accent)'
          : 'none',
    cursor: 'pointer',
    transition: 'opacity 140ms, border-color 120ms, box-shadow 140ms',
    gridColumn: expanded ? '1 / -1' : 'auto',
  };

  if (compact) {
    return (
      <div id={`run-card-${run.id}`} data-run-card-id={run.id} className={flashing ? 'run-card-flash' : undefined} onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {new Date(run.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontFamily: 'var(--sans)', fontSize: 10.5, color: 'var(--inkSoft)', fontWeight: 500 }}>
              {meta[run.type].label}
              {run.pr && <span style={{ marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 8.5, background: 'var(--ink)', color: 'var(--bg)', padding: '1px 4px', borderRadius: 2 }}>PR</span>}
            </span>
            <ExcludeToggle excluded={excluded} onToggle={onToggleExclude} size={11} />
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
            <span
              className="num"
              title="Efficiency: speed (m/min) ÷ avg HR · higher is better"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: run.ef != null ? 'var(--inkSoft)' : 'var(--inkMuted)',
                fontStyle: run.ef != null ? 'normal' : 'italic',
              }}
            >
              {run.ef != null ? run.ef.toFixed(2) : '—'}<span className="mono muted" style={{ fontSize: 9, marginLeft: 2, fontWeight: 400 }}>EF</span>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.06em' }} title={`Rank across all runs of this type · ${isHrMode ? 'HR' : isEfMode ? 'efficiency' : 'pace'}`}>
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
    <div id={`run-card-${run.id}`} data-run-card-id={run.id} className={flashing ? 'run-card-flash' : undefined} onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <ExcludeToggle excluded={excluded} onToggle={onToggleExclude} />
          {expanded && (
            <>
              <button className="chip" onClick={onPin}>{pinned ? 'Unpin' : 'Pin'}</button>
              <button className="chip" onClick={(e) => { e.stopPropagation(); onClick(); }}>Close</button>
            </>
          )}
        </div>
      </div>

      {expanded && run.note && (
        <div style={{ marginBottom: 8, fontSize: 12.5, color: 'var(--inkSoft)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
          &ldquo;{run.note}&rdquo;
        </div>
      )}

      {expanded && (() => {
        const peerCount = isHrMode || isEfMode
          ? (isEfMode ? run.efPeerCount : run.hrPeerCount)
          : run.peerCount;
        const typeLabel = meta[run.type].label.toLowerCase();
        const metricWord = isHrMode ? 'HR' : isEfMode ? 'efficiency' : 'pace';
        // Better- and worse-direction phrases per metric. "Better" matches
        // the directional `better` flag computed above (delta<0 for pace/HR,
        // delta>0 for efficiency).
        const betterPhrase = isHrMode ? 'lower HR' : isEfMode ? 'more efficient' : 'faster';
        const deltaStr = hasDelta ? m.fmtDeltaShort(delta) : null;
        if (!peerCount) {
          return (
            <Highlight tone="muted">
              First of its kind with the current peer criteria. Widen <b>Similar</b> in <b>⚙</b> to bring more peers into comparison.
            </Highlight>
          );
        }
        // PR banner only in pace mode — a Strava PR is a time/pace record,
        // not an HR or efficiency one, so the "Personal record" framing
        // would over-claim in those modes.
        if (run.pr && !isHrMode && !isEfMode) {
          return (
            <Highlight>
              <HlNum>Personal record</HlNum> over <HlNum>{fmtDistance(run.distance, units, 1)} {distUnit(units)}</HlNum>
              {hasDelta && delta < 0 && <>, <HlNum>{deltaStr}</HlNum> faster than the avg of <HlNum>{peerCount}</HlNum> similar {typeLabel} peers</>}
              .
            </Highlight>
          );
        }
        if (run.rank === 1) {
          return (
            <Highlight>
              <HlNum>Best of {peerCount}</HlNum> similar {typeLabel} peers on {metricWord}
              {hasDelta && better && <>, <HlNum>{deltaStr}</HlNum> better than the avg</>}
              .
            </Highlight>
          );
        }
        if (run.rank != null && run.rank <= 3 && run.rankTotal >= 5) {
          return (
            <Highlight>
              <HlNum>{ordinal(run.rank)} of {peerCount}</HlNum> similar peers on {metricWord}
              {hasDelta && better && <>, <HlNum>{deltaStr}</HlNum> better than the avg</>}
              .
            </Highlight>
          );
        }
        if (hasDelta && better) {
          return (
            <Highlight>
              <HlNum>{deltaStr}</HlNum> {betterPhrase} than the avg of <HlNum>{peerCount}</HlNum> similar {typeLabel} peers, ranked <HlNum>{ordinal(run.rank)}</HlNum> of {run.rankTotal}.
            </Highlight>
          );
        }
        if (hasDelta && !better) {
          return (
            <Highlight tone="muted">
              Ranked <HlNum>{ordinal(run.rank)}</HlNum> of <HlNum>{run.rankTotal}</HlNum> similar peers, <HlNum>{deltaStr}</HlNum> off the {metricWord} avg.
            </Highlight>
          );
        }
        return (
          <Highlight tone="muted">
            Ranked <HlNum>{ordinal(run.rank)}</HlNum> of <HlNum>{run.rankTotal}</HlNum> similar {typeLabel} peers on {metricWord}.
          </Highlight>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 10, marginBottom: 10, marginTop: expanded ? 12 : 0 }}>
        <CardStat label="Dist" value={fmtDistance(run.distance, units, 2)} unit={distUnit(units)} />
        <CardStat label="Pace" value={fmtPaceUnit(run.pace, units)} unit={paceUnit(units)} />
        <CardStat label="HR" value={hasValidHr(run) ? run.hr : '—'} unit={hasValidHr(run) ? 'bpm' : ''} />
        <CardStat
          label="EF"
          value={run.ef != null ? run.ef.toFixed(2) : '—'}
          title="Efficiency: speed (m/min) ÷ avg HR · higher is better"
        />
        {expanded && !interrupted && <CardStat label="Time" value={fmtDuration(run.duration)} />}
        {expanded && interrupted && <CardStat label="Moving" value={fmtDuration(run.duration)} />}
        {expanded && interrupted && (
          <CardStat
            label="Elapsed"
            value={fmtDuration(elapsedMin)}
            title={`${stoppedPct}% of elapsed time was stopped (red lights, pauses). Pace and EF use moving time.`}
          />
        )}
        {expanded && <CardStat label="Elev" value={run.elev != null ? `${Math.round(elevToDisplay(run.elev, units))}` : '—'} unit={run.elev != null ? elevUnit(units) : ''} />}
        {expanded && run.temp != null && <CardStat label="Temp" value={fmtTemp(run.temp, tempUnits)} unit={tempUnit(tempUnits)} />}
      </div>

      {hasPeers && run.rank != null ? (
        <div style={{ borderTop: '1px dashed var(--ruleSoft)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              vs {run.peerCount} {isHrMode ? 'HR peers' : isEfMode ? 'EF peers' : 'similar'} · {ordinal(run.rank)} of {run.rankTotal}
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
          {(isHrMode || isEfMode) && hasPeers
            ? `No HR data for this run; can’t rank by ${isEfMode ? 'efficiency' : 'heart rate'}`
            : 'First of its kind. No similar runs yet'}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--ruleSoft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
            <div className="mono" style={{
              fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase',
              flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.5,
            }}>
              Recent similar runs{peerView === 'grid' ? ` · sorted by ${isHrMode ? 'lowest avg HR' : isEfMode ? 'highest efficiency' : 'fastest pace'}` : ' · HR × pace'}
            </div>
            <div
              className="seg"
              style={{ height: 24, flexShrink: 0 }}
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
              // Sort by active metric. HR and EF modes float HR-less peers
              // to the bottom (they can't be ranked on those metrics).
              // EF sorts descending since higher efficiency is better.
              const sorted = [...run.peers].sort((a, b) => {
                if (isHrMode) {
                  const aHas = hasValidHr(a), bHas = hasValidHr(b);
                  if (aHas && !bHas) return -1;
                  if (!aHas && bHas) return 1;
                  if (!aHas && !bHas) return b.date.localeCompare(a.date);
                  return a.hr - b.hr;
                }
                if (isEfMode) {
                  const aHas = hasValidHr(a), bHas = hasValidHr(b);
                  if (aHas && !bHas) return -1;
                  if (!aHas && bHas) return 1;
                  if (!aHas && !bHas) return b.date.localeCompare(a.date);
                  return efOf(b) - efOf(a);
                }
                return a.pace - b.pace;
              });
              return sorted.slice(0, 8).map((p, i) => {
                const pFaster = p.pace < run.pace;
                const pLowerHr = hasValidHr(p) && hasValidHr(run) && p.hr < run.hr;
                const pEf = efOf(p);
                const pHigherEf = pEf != null && run.ef != null && pEf > run.ef;
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
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 1 }}>
                      <span
                        className="mono"
                        title="Efficiency: speed (m/min) ÷ avg HR · higher is better"
                        style={{
                          fontSize: 10,
                          color: pEf != null ? (pHigherEf ? 'var(--positive)' : 'var(--inkSoft)') : 'var(--inkMuted)',
                          fontStyle: pEf != null ? 'normal' : 'italic',
                        }}
                      >
                        EF {pEf != null ? pEf.toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// Reads the active metric off a run/peer for the mini distribution charts.
// HR + Efficiency modes filter peers to those with valid HR (efficiency
// requires HR by definition).
function axisFor(run, rankBy) {
  const isHr = rankBy === 'hr';
  const isEf = rankBy === 'efficiency';
  if (isEf) {
    const peers = run.peers.filter(hasValidHr);
    const self = run.ef;
    const avg = run.avgEF;
    const values = peers.map(efOf);
    return { isHr: false, isEf: true, peers, self, avg, values };
  }
  const peers = isHr ? run.peers.filter(hasValidHr) : run.peers;
  const self = isHr ? run.hr : run.pace;
  const avg = isHr ? run.avgHR : run.avgPace;
  const values = peers.map((p) => (isHr ? p.hr : p.pace));
  return { isHr, isEf: false, peers, self, avg, values };
}

function MiniPeerBar({ run, color, rankBy }) {
  const { isHr, isEf, peers, self, avg, values } = axisFor(run, rankBy);
  if (!peers.length || self == null || avg == null) {
    return <div className="mono muted" style={{ fontSize: 9, fontStyle: 'italic', flex: 1, textAlign: 'center' }}>{isEf ? 'no EF peers' : 'no HR peers'}</div>;
  }
  const all = [...values, self];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  // Per-axis floors for the visible span — too small and a near-uniform
  // cohort collapses every dot onto the marker.
  const span = Math.max(isHr ? 1 : isEf ? 0.05 : 0.1, hi - lo);
  const selfX = ((self - lo) / span) * 100;
  const avgX = ((avg - lo) / span) * 100;
  return (
    <div style={{ position: 'relative', flex: 1, height: 10, margin: '0 4px' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
      {peers.map((p, i) => {
        const v = isEf ? values[i] : (isHr ? p.hr : p.pace);
        const x = ((v - lo) / span) * 100;
        return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 3, width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: color, opacity: 0.45 }} />;
      })}
      <span style={{ position: 'absolute', left: `${avgX}%`, top: 1, width: 1, height: 8, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
      <span style={{ position: 'absolute', left: `${selfX}%`, top: -1, width: 2, height: 12, marginLeft: -1, background: 'var(--ink)' }} />
    </div>
  );
}

function PeerDistribution({ run, color, showAxis, rankBy, units = 'km' }) {
  const { isHr, isEf, peers, self, avg, values } = axisFor(run, rankBy);
  if (!peers.length || self == null || avg == null) return null;
  const all = [...values, self];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(isHr ? 1 : isEf ? 0.05 : 0.1, hi - lo);
  const selfX = ((self - lo) / span) * 100;
  const avgX = ((avg - lo) / span) * 100;
  // Axis-end labels — describe what each end means in the active metric.
  // Pace and HR: lower (left) is better. Efficiency: higher (right) is
  // better. Labels include the numeric value so the user can read the
  // actual extent of the cohort.
  const leftLabel = isHr
    ? `lower HR ${Math.round(lo)}`
    : isEf
      ? `lower EF ${lo.toFixed(2)}`
      : `faster ${fmtPace(paceToDisplay(lo, units))}`;
  const rightLabel = isHr
    ? `higher HR ${Math.round(hi)}`
    : isEf
      ? `higher EF ${hi.toFixed(2)}`
      : `slower ${fmtPace(paceToDisplay(hi, units))}`;
  return (
    <div>
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
        {peers.map((p, i) => {
          const v = isEf ? values[i] : (isHr ? p.hr : p.pace);
          const x = ((v - lo) / span) * 100;
          return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 6, width: 6, height: 6, marginLeft: -3, borderRadius: '50%', background: color, opacity: 0.45 }} />;
        })}
        <span style={{ position: 'absolute', left: `${avgX}%`, top: 3, width: 1, height: 12, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
        <span style={{ position: 'absolute', left: `${selfX}%`, top: 1, width: 2, height: 16, marginLeft: -1, background: 'var(--ink)' }} />
      </div>
      {showAxis && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--inkMuted)', marginTop: 2 }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
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

function CardStat({ label, value, unit, title }) {
  return (
    <div title={title}>
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

// Per-card "exclude from stats" toggle. A ban (circle-slash) glyph: faint
// when the run counts, filled accent when it's excluded. Stops propagation
// (via the parent's onToggleExclude) so it doesn't also expand the card.
function ExcludeToggle({ excluded, onToggle, size = 13 }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={excluded}
      aria-label={excluded ? 'Include this run in stats' : 'Exclude this run from stats'}
      title={excluded
        ? 'Excluded from stats (records, ribbons, scatters). Click to include.'
        : 'Exclude this run from stats (records, ribbons, scatters). Stays in your log.'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 7, height: size + 7, padding: 0, flexShrink: 0,
        border: 'none', background: 'none', cursor: 'pointer',
        color: excluded ? 'var(--accent)' : 'var(--inkMuted)',
        opacity: excluded ? 1 : 0.5,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" stroke="currentColor" strokeWidth="2.4" />
      </svg>
    </button>
  );
}
