'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtDuration,
  fmtPaceUnit, paceUnit,
} from '@/lib/shared';

export default function SameRouteDuel() {
  const data = useData();
  const { hovered, setHovered } = useLink();
  const { show, hide } = useTooltip();
  const { units } = useTweaks();
  const runs = useFilteredRuns();
  const routes = data.routes;

  const routeCounts = useMemo(() => {
    const c = {};
    runs.forEach((r) => { c[r.routeId] = (c[r.routeId] || 0) + 1; });
    return routes
      .map((r) => ({ ...r, count: c[r.id] || 0 }))
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.count - a.count);
  }, [runs, routes]);

  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => {
    if (!selectedId && routeCounts.length) setSelectedId(routeCounts[0].id);
  }, [routeCounts, selectedId]);

  const route = routes.find((r) => r.id === selectedId);
  const routeRuns = useMemo(
    () => runs.filter((r) => r.routeId === selectedId).sort((a, b) => a.date.localeCompare(b.date)),
    [runs, selectedId]
  );

  const matchIds = useMemo(() => {
    if (!hovered) return null;
    const s = new Set();
    routeRuns.forEach((r) => {
      if (r.id === hovered.runId || r.routeId === hovered.routeId) s.add(r.id);
    });
    return s;
  }, [hovered, routeRuns]);

  if (!route || !routeRuns.length) {
    return (
      <div className="panel" style={{ padding: '20px 22px' }}>
        <div className="stat-label" style={{ marginBottom: 6 }}>Same-Route Duel</div>
        <div style={{ fontSize: 13, color: 'var(--inkSoft)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
          Needs at least two runs on the same route to duel. Drop more activities into <code>activities/</code> and re-run <code>npm run ingest</code>.
        </div>
      </div>
    );
  }

  const durations = routeRuns.map((r) => r.duration);
  const best = Math.min(...durations);
  const worst = Math.max(...durations);

  const W = 620;
  const H = 220;
  const BAR_GAP = 6;
  const BAR_W = Math.max(8, Math.min(36, (W - 40) / routeRuns.length - BAR_GAP));

  const first = routeRuns[0];
  const latest = routeRuns[routeRuns.length - 1];
  const bestRun = routeRuns.find((r) => r.duration === best);
  const improveSec = (first.duration - latest.duration) * 60;
  const improvePct = ((first.duration - latest.duration) / first.duration) * 100;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Same-Route Duel</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 420 }}>
            Your personal grudge match. Each bar = one attempt at <b>{route.name}</b>. Taller is faster.
          </div>
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {routeCounts.slice(0, 6).map((r) => (
          <button key={r.id} className={`chip ${selectedId === r.id ? 'active' : ''}`} onClick={() => setSelectedId(r.id)}>
            {r.name} · {r.count}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32, alignItems: 'center' }}>
        <div>
          <svg viewBox={`0 0 ${W} ${H + 40}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1={20} x2={W - 20} y1={H} y2={H} stroke="var(--ruleSoft)" />
            {routeRuns.map((r, i) => {
              const speedScore = (worst - r.duration) / (worst - best || 1);
              const barH = 30 + speedScore * (H - 50);
              const x = 20 + i * (BAR_W + BAR_GAP);
              const y = H - barH;
              const isHover = hovered?.runId === r.id;
              const isMatch = matchIds && matchIds.has(r.id);
              const dim = hovered && !isMatch;
              const isBest = r.id === bestRun.id;
              return (
                <g
                  key={r.id}
                  opacity={dim ? 0.2 : 1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
                    show(
                      <>
                        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
                        <div className="t-row"><span>Duration</span><span>{fmtDuration(r.duration)}</span></div>
                        <div className="t-row"><span>Pace</span><span>{fmtPaceUnit(r.pace, units)}{paceUnit(units)}</span></div>
                        <div className="t-row"><span>Δ vs best</span><span>+{((r.duration - best) * 60).toFixed(0)}s</span></div>
                        {isBest && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Route best</div>}
                      </>,
                      e.clientX, e.clientY
                    );
                  }}
                  onMouseLeave={() => { setHovered(null); hide(); }}
                >
                  <rect x={x} y={y} width={BAR_W} height={barH} fill={`var(--type-${r.type})`} opacity={isBest ? 1 : 0.75} />
                  {isBest && <rect x={x - 1.5} y={y - 1.5} width={BAR_W + 3} height={barH + 3} fill="none" stroke="var(--ink)" strokeWidth={1.2} />}
                  {isHover && <rect x={x - 3} y={y - 3} width={BAR_W + 6} height={barH + 6} fill="none" stroke="var(--ink)" strokeDasharray="2 2" opacity={0.6} />}
                  {i % Math.max(1, Math.floor(routeRuns.length / 6)) === 0 && (
                    <text x={x + BAR_W / 2} y={H + 14} textAnchor="middle" style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)' }}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="stat">
            <div className="stat-label">First attempt</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmtDuration(first.duration)}</div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>{fmtDate(first.date, { year: true })} · {fmtPaceUnit(first.pace, units)}{paceUnit(units)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Most recent</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{fmtDuration(latest.duration)}</div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>{fmtDate(latest.date, { year: true })} · {fmtPaceUnit(latest.pace, units)}{paceUnit(units)}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 12 }}>
            <div className="stat-label" style={{ marginBottom: 4 }}>You got faster by</div>
            <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', color: improveSec >= 0 ? 'var(--positive)' : 'var(--accent)' }}>
              {improveSec >= 0 ? '−' : '+'}{Math.abs(improveSec).toFixed(0)}s
            </div>
            <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
              {improvePct >= 0 ? '−' : '+'}{Math.abs(improvePct).toFixed(1)}% over {routeRuns.length} attempts
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
