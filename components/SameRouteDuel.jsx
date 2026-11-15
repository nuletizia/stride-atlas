'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useAnalysisRuns,
  fmtDate, fmtPace, fmtDuration,
  fmtPaceUnit, paceUnit, fmtDistance, distUnit, routeLoops, MI_PER_KM,
} from '@/lib/shared';

export default function SameRouteDuel() {
  const data = useData();
  const { hovered, setHovered, isTouch, pendingFocusId, requestFocus } = useLink();
  const { show, hide } = useTooltip();
  const { units } = useTweaks();
  const runs = useAnalysisRuns();
  const routes = data.routes;

  // Comparable attempts only: runs on the same route within 15% of each
  // other's distance (see routeLoops). Ranked by pace, not total time.
  const loops = useMemo(() => routeLoops(runs, routes), [runs, routes]);

  const [selectedId, setSelectedId] = useState(null);
  // Fall back to the busiest loop whenever the selection disappears (e.g.
  // after a time-range change).
  useEffect(() => {
    if (!loops.length) return;
    if (!selectedId || !loops.some((l) => l.id === selectedId)) setSelectedId(loops[0].id);
  }, [loops, selectedId]);

  const loop = loops.find((l) => l.id === selectedId) || loops[0];
  const route = loop ? { name: loop.name } : null;
  const routeRuns = loop ? loop.runs : [];

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
          Needs at least two runs of similar length on the same route to duel. Drop more activities into <code>activities/</code> and re-run <code>npm run ingest</code>.
        </div>
      </div>
    );
  }

  const paces = routeRuns.map((r) => r.pace);
  const best = Math.min(...paces);
  const worst = Math.max(...paces);
  // s per display unit from a min/km pace delta.
  const paceK = units === 'mi' ? 1 / MI_PER_KM : 1;
  const secPer = (dMinKm) => Math.round(dMinKm * 60 * paceK);
  const meta = (r) => `${fmtDate(r.date, { year: true })} · ${fmtDistance(r.distance, units, 1)} ${distUnit(units)} · ${fmtDuration(r.duration)}`;

  // Month labels are sampled by bar index; skip one whose month repeats the
  // previous label so the axis never reads "Jan, Jan".
  const labelStep = Math.max(1, Math.floor(routeRuns.length / 6));
  const monthKey = (r) => r.date.slice(0, 7);
  const monthLabelShown = (i) => i < labelStep || monthKey(routeRuns[i]) !== monthKey(routeRuns[i - labelStep]);

  const W = 620;
  const H = 220;
  const BAR_GAP = 6;
  const BAR_W = Math.max(8, Math.min(36, (W - 40) / routeRuns.length - BAR_GAP));

  const first = routeRuns[0];
  const latest = routeRuns[routeRuns.length - 1];
  const bestRun = routeRuns.find((r) => r.pace === best);
  // Compare against the best attempt rather than the most recent one.
  // "Most recent" is a single point that can swing on any bad day; the
  // loop's best pace is the honest measure of how far you've come. Most
  // recent stays visible as a smaller progress check.
  const gapSec = secPer(first.pace - bestRun.pace);
  const gapPct = ((first.pace - bestRun.pace) / first.pace) * 100;
  const firstIsBest = bestRun.id === first.id;
  const recentIsBest = bestRun.id === latest.id;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Same-Route Duel</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 420 }}>
            Your personal grudge match on <b>{route.name}</b>, attempts of about {fmtDistance(loop.km, units, 1)} {distUnit(units)}. Each bar is one attempt; taller is a faster pace. The ringed bar is your best pace on this loop.
          </div>
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {loops.slice(0, 6).map((l) => (
          <button key={l.id} className={`chip ${loop.id === l.id ? 'active' : ''}`} onClick={() => setSelectedId(l.id)}>
            {l.name} · {fmtDistance(l.km, units, 1)} {distUnit(units)} · {l.runs.length}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 32, alignItems: 'center' }}>
        <div>
          <svg viewBox={`0 0 ${W} ${H + 40}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1={20} x2={W - 20} y1={H} y2={H} stroke="var(--ruleSoft)" />
            {routeRuns.map((r, i) => {
              const speedScore = (worst - r.pace) / (worst - best || 1);
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
                  data-tap-focus="true"
                  opacity={dim ? 0.2 : 1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
                    show(
                      <>
                        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
                        <div className="t-row"><span>Distance</span><span>{fmtDistance(r.distance, units, 2)} {distUnit(units)}</span></div>
                        <div className="t-row"><span>Pace</span><span>{fmtPaceUnit(r.pace, units)}{paceUnit(units)}</span></div>
                        <div className="t-row"><span>Duration</span><span>{fmtDuration(r.duration)}</span></div>
                        <div className="t-row"><span>Δ vs best</span><span>+{secPer(r.pace - best)}s{paceUnit(units)}</span></div>
                        {isBest && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Best pace on this loop</div>}
                      </>,
                      e.clientX, e.clientY
                    );
                  }}
                  onMouseLeave={() => {
                    if (isTouch && pendingFocusId === r.id) return;
                    setHovered(null); hide();
                  }}
                  onClick={() => { if (requestFocus(r.id)) { setHovered(null); hide(); } }}
                >
                  <rect x={x} y={y} width={BAR_W} height={barH} fill={`var(--type-${r.type})`} opacity={isBest ? 1 : 0.75} />
                  {isBest && <rect x={x - 1.5} y={y - 1.5} width={BAR_W + 3} height={barH + 3} fill="none" stroke="var(--ink)" strokeWidth={1.2} />}
                  {isHover && <rect x={x - 3} y={y - 3} width={BAR_W + 6} height={barH + 6} fill="none" stroke="var(--ink)" strokeDasharray="2 2" opacity={0.6} />}
                  {i % Math.max(1, Math.floor(routeRuns.length / 6)) === 0 && monthLabelShown(i) && (
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
            <div className="stat-value" style={{ fontSize: 20 }}>{fmtPaceUnit(first.pace, units)}<span className="mono muted" style={{ fontSize: 11 }}>{paceUnit(units)}</span></div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>{meta(first)}</div>
          </div>
          <div
            className="stat"
            style={{
              paddingLeft: 10,
              borderLeft: '3px solid var(--accent)',
            }}
          >
            <div className="stat-label" style={{ color: 'var(--accent)' }}>
              Best pace {firstIsBest && '(first attempt)'}
              {recentIsBest && !firstIsBest && '(most recent)'}
            </div>
            <div className="stat-value" style={{ fontSize: 22 }}>{fmtPaceUnit(bestRun.pace, units)}<span className="mono muted" style={{ fontSize: 11 }}>{paceUnit(units)}</span></div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 2 }}>{meta(bestRun)}</div>
          </div>
          {!recentIsBest && (
            <div className="mono muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 9.5, color: 'var(--inkMuted)' }}>Most recent</span>
              <br />
              {fmtPaceUnit(latest.pace, units)}{paceUnit(units)} · {meta(latest)}
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 12 }}>
            {firstIsBest ? (
              <>
                <div className="stat-label" style={{ marginBottom: 4 }}>Still your fastest</div>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 20, lineHeight: 1.2, color: 'var(--inkSoft)' }}>
                  Your first attempt still holds the record on this route.
                </div>
                <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {routeRuns.length} attempts so far
                </div>
              </>
            ) : (
              <>
                <div className="stat-label" style={{ marginBottom: 4 }}>PR beats first by</div>
                <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 34, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--positive)' }}>
                  −{gapSec}s<span style={{ fontSize: 18 }}>{paceUnit(units)}</span>
                </div>
                <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {gapPct.toFixed(1)}% faster · {routeRuns.length} attempts
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
