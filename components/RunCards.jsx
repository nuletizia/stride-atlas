'use client';

import { useMemo, useState } from 'react';
import {
  useData, useLink, useFilteredRuns,
  fmtDate, fmtPace, fmtDuration, fmtHr, hasValidHr,
} from '@/lib/shared';

export default function RunCards() {
  const data = useData();
  const runs = useFilteredRuns();
  const { hovered, setHovered } = useLink();
  const meta = data.typeMeta;

  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [similarityMode, setSimilarityMode] = useState('type_distance');
  const [distTol, setDistTol] = useState(15);
  const [density, setDensity] = useState('compact');
  const [expandedId, setExpandedId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  const [capped, setCapped] = useState(true);
  const CAP = 24;
  const PREVIEW_COUNT = 20;

  const withPeers = useMemo(() => {
    return runs.map((r) => {
      const peers = runs.filter((other) => {
        if (other.id === r.id) return false;
        if (similarityMode === 'route') return other.routeId === r.routeId;
        if (other.type !== r.type) return false;
        if (distTol >= 100) return true;
        return Math.abs(other.distance - r.distance) / r.distance <= distTol / 100;
      });
      const n = peers.length;
      if (n === 0) return { ...r, peers: [], peerCount: 0, peerIds: new Set() };
      const avgPace = peers.reduce((a, p) => a + p.pace, 0) / n;
      const bestPace = Math.min(...peers.map((p) => p.pace));
      const peersWithHr = peers.filter(hasValidHr);
      const avgHR = peersWithHr.length
        ? peersWithHr.reduce((a, p) => a + p.hr, 0) / peersWithHr.length
        : null;
      const avgDist = peers.reduce((a, p) => a + p.distance, 0) / n;
      const paces = [...peers.map((p) => p.pace), r.pace].sort((a, b) => a - b);
      const rank = paces.indexOf(r.pace) + 1;
      return {
        ...r, peers, peerCount: n, peerIds: new Set(peers.map((p) => p.id)),
        avgPace, bestPace, avgHR, avgDist,
        paceDelta: r.pace - avgPace,
        rank, rankTotal: peers.length + 1,
      };
    });
  }, [runs, similarityMode, distTol]);

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

  const types = ['all', 'easy', 'tempo', 'long', 'intervals', 'race', 'recovery'];
  const minCol = density === 'compact' ? 150 : 220;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>
            Run Cards
            <span className="num muted" style={{ marginLeft: 8, fontSize: 10, letterSpacing: 0, textTransform: 'none' }}>
              {collapsed
                ? `${Math.min(PREVIEW_COUNT, filtered.length)}/${filtered.length} runs`
                : capped
                  ? `${Math.min(CAP, filtered.length)}/${filtered.length} runs`
                  : `${filtered.length}/${filtered.length} runs`}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 560 }}>
            {collapsed
              ? <>Most recent runs with peer comparison. Rank is computed by <b>pace</b> among this run and its similar runs.</>
              : <>Click a card to expand full stats and compare against its <b>similar runs</b> — {similarityMode === 'route' ? 'same route' : distTol === 0 ? 'same type, exact distance' : distTol >= 100 ? 'same type, any distance' : `same type within ±${distTol}% distance`}. Rank is by <b>pace</b>.</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={distTol}
                    onChange={(e) => setDistTol(+e.target.value)}
                    style={{ flex: 1, accentColor: 'var(--ink)' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`chip ${similarityMode === 'type_distance' ? 'active' : ''}`} onClick={() => setSimilarityMode('type_distance')}>Type</button>
                <button className={`chip ${similarityMode === 'route' ? 'active' : ''}`} onClick={() => setSimilarityMode('route')}>Same route</button>
              </div>
            </div>
          )}
          <button
            className="chip"
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: !collapsed ? 'var(--ink)' : 'var(--bgRaised)',
              color: !collapsed ? 'var(--bg)' : 'var(--inkSoft)',
              borderColor: !collapsed ? 'var(--ink)' : 'var(--rule)',
              marginLeft: !collapsed ? 8 : 0,
            }}
          >
            {collapsed ? 'Expand ↗' : 'Collapse ↙'}
          </button>
        </div>
      </div>

      {collapsed && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minCol}px, 1fr))`, gap: 8 }}>
          {filtered.slice(0, PREVIEW_COUNT).map((r) => {
            const isFocus = focusId === r.id;
            const isPeer = focusPeerIds && focusPeerIds.has(r.id);
            const dim = focusId && !isFocus && !isPeer;
            return (
              <RunCard
                key={r.id}
                run={r}
                density="compact"
                isFocus={isFocus}
                isPeer={isPeer}
                dim={dim}
                expanded={false}
                pinned={pinnedId === r.id}
                meta={meta}
                onHoverIn={() => setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date })}
                onHoverOut={() => setHovered(null)}
                onClick={() => setCollapsed(false)}
                onPin={() => {}}
              />
            );
          })}
        </div>
      )}

      {!collapsed && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--ruleSoft)', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              <div className="seg" style={{ height: 26 }}>
                <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')} style={{ padding: '4px 8px' }}>Dense</button>
                <button className={density === 'roomy' ? 'on' : ''} onClick={() => setDensity('roomy')} style={{ padding: '4px 8px' }}>Roomy</button>
              </div>
            </div>
          </div>

          {pinnedId && focusRun && (
            <div style={{
              marginBottom: 14, padding: '10px 14px',
              background: 'var(--bgSunken)', border: '1px solid var(--rule)', borderRadius: 4,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 12.5 }}>
                <span className="mono muted" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>Pinned · </span>
                <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 15 }}>
                  {fmtDate(focusRun.date, { year: true })} · {meta[focusRun.type].label} · {focusRun.distance.toFixed(1)} km
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
                  onHoverIn={() => setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date })}
                  onHoverOut={() => setHovered(null)}
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  onPin={(e) => { e.stopPropagation(); setPinnedId(pinnedId === r.id ? null : r.id); }}
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
        </>
      )}
    </div>
  );
}

function RunCard({ run, density, isFocus, isPeer, dim, expanded, pinned, meta, onHoverIn, onHoverOut, onClick, onPin }) {
  const color = `var(--type-${run.type})`;
  const hasPeers = run.peerCount > 0;
  const paceDelta = run.paceDelta ?? 0;
  const faster = paceDelta < 0;
  const deltaSec = Math.abs(paceDelta * 60);
  const rankText = hasPeers ? `${ordinal(run.rank)}/${run.rankTotal}` : '—';
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
      <div onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {new Date(run.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 10.5, color: 'var(--inkSoft)', fontWeight: 500 }}>
            {meta[run.type].label}
            {run.pr && <span style={{ marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 8.5, background: 'var(--ink)', color: 'var(--bg)', padding: '1px 4px', borderRadius: 2 }}>PR</span>}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="num" style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>
            {run.distance.toFixed(1)}<span className="mono muted" style={{ fontSize: 9.5, marginLeft: 1, fontWeight: 400 }}>km</span>
          </span>
          <span className="num" style={{ fontSize: 13, color: 'var(--inkSoft)', fontWeight: 500 }}>
            {fmtPace(run.pace)}<span className="mono muted" style={{ fontSize: 9, marginLeft: 1, fontWeight: 400 }}>/km</span>
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.06em' }}>
            {hasPeers ? rankText : '—'}
          </span>
          {hasPeers ? <MiniPeerBar run={run} color={color} /> : <span className="mono muted" style={{ fontSize: 9, fontStyle: 'italic' }}>no peers</span>}
          <span className={`stat-delta num ${faster ? 'up' : 'down'}`} style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>
            {hasPeers ? `${faster ? '−' : '+'}${deltaSec.toFixed(0)}s` : ''}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div onMouseEnter={onHoverIn} onMouseLeave={onHoverOut} onClick={onClick} style={cardStyle}>
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

      <div style={{ display: 'grid', gridTemplateColumns: expanded ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
        <CardStat label="Dist" value={run.distance.toFixed(2)} unit="km" />
        <CardStat label="Pace" value={fmtPace(run.pace)} unit="/km" />
        <CardStat label="HR" value={hasValidHr(run) ? run.hr : '—'} unit={hasValidHr(run) ? 'bpm' : ''} />
        {expanded && <CardStat label="Time" value={fmtDuration(run.duration)} />}
        {expanded && <CardStat label="Elev" value={`${run.elev}`} unit="m" />}
      </div>

      {hasPeers ? (
        <div style={{ borderTop: '1px dashed var(--ruleSoft)', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              vs {run.peerCount} similar · {ordinal(run.rank)} of {run.rankTotal}
            </span>
            <span className={`stat-delta num ${faster ? 'up' : 'down'}`} style={{ fontSize: 12, fontWeight: 500 }}>
              {faster ? '−' : '+'}{deltaSec.toFixed(0)}s/km vs avg
            </span>
          </div>
          <PeerDistribution run={run} color={color} showAxis={expanded} />
          {expanded && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--inkSoft)' }}>
              <span>Peer best: <b style={{ color: 'var(--ink)' }}>{fmtPace(run.bestPace)}</b></span>
              <span>Peer avg: <b style={{ color: 'var(--ink)' }}>{fmtPace(run.avgPace)}</b></span>
              <span>This run: <b style={{ color: 'var(--ink)' }}>{fmtPace(run.pace)}</b></span>
            </div>
          )}
        </div>
      ) : (
        <div className="mono muted" style={{ fontSize: 10.5, fontStyle: 'italic', textAlign: 'center', padding: '6px 0', borderTop: '1px dashed var(--ruleSoft)', marginTop: 4 }}>
          First of its kind — no similar runs yet
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--ruleSoft)' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Recent similar runs
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            {run.peers.slice(0, 8).sort((a, b) => b.date.localeCompare(a.date)).map((p) => {
              const pFaster = p.pace < run.pace;
              return (
                <div key={p.id} style={{ padding: '6px 8px', background: 'var(--bgSunken)', borderLeft: `2px solid ${color}`, borderRadius: 3 }}>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--inkMuted)', letterSpacing: '.06em' }}>{fmtDate(p.date)}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
                    <span className="num" style={{ fontSize: 11.5, fontWeight: 500 }}>{p.distance.toFixed(1)}km</span>
                    <span className="num" style={{ fontSize: 11.5, color: pFaster ? 'var(--positive)' : 'var(--accent)' }}>{fmtPace(p.pace)}</span>
                  </div>
                </div>
              );
            })}
          </div>
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

function MiniPeerBar({ run, color }) {
  const paces = [...run.peers.map((p) => p.pace), run.pace];
  const minP = Math.min(...paces);
  const maxP = Math.max(...paces);
  const span = Math.max(0.1, maxP - minP);
  const selfX = ((run.pace - minP) / span) * 100;
  const avgX = ((run.avgPace - minP) / span) * 100;
  return (
    <div style={{ position: 'relative', flex: 1, height: 10, margin: '0 4px' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
      {run.peers.map((p) => {
        const x = ((p.pace - minP) / span) * 100;
        return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 3, width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: color, opacity: 0.45 }} />;
      })}
      <span style={{ position: 'absolute', left: `${avgX}%`, top: 1, width: 1, height: 8, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
      <span style={{ position: 'absolute', left: `${selfX}%`, top: -1, width: 2, height: 12, marginLeft: -1, background: 'var(--ink)' }} />
    </div>
  );
}

function PeerDistribution({ run, color, showAxis }) {
  const paces = [...run.peers.map((p) => p.pace), run.pace];
  const minP = Math.min(...paces);
  const maxP = Math.max(...paces);
  const span = Math.max(0.1, maxP - minP);
  const selfX = ((run.pace - minP) / span) * 100;
  const avgX = ((run.avgPace - minP) / span) * 100;
  return (
    <div>
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 8, height: 2, background: 'var(--bgSunken)', borderRadius: 1 }} />
        {run.peers.map((p) => {
          const x = ((p.pace - minP) / span) * 100;
          return <span key={p.id} style={{ position: 'absolute', left: `${x}%`, top: 6, width: 6, height: 6, marginLeft: -3, borderRadius: '50%', background: color, opacity: 0.45 }} />;
        })}
        <span style={{ position: 'absolute', left: `${avgX}%`, top: 3, width: 1, height: 12, marginLeft: -0.5, background: 'var(--inkMuted)' }} />
        <span style={{ position: 'absolute', left: `${selfX}%`, top: 1, width: 2, height: 16, marginLeft: -1, background: 'var(--ink)' }} />
      </div>
      {showAxis && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--inkMuted)', marginTop: 2 }}>
          <span>faster {fmtPace(minP)}</span>
          <span>slower {fmtPace(maxP)}</span>
        </div>
      )}
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
