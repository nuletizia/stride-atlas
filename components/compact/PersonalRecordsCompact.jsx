'use client';

import { useMemo } from 'react';
import {
  useData, useTweaks, fmtDuration, fmtPaceUnit, paceUnit,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

const DISTANCES = [
  { key: '1',       label: '1K',  dist: 1.0 },
  { key: '5',       label: '5K',  dist: 5.0 },
  { key: '10',      label: '10K', dist: 10.0 },
  { key: '21.0975', label: 'HM',  dist: 21.0975 },
  { key: '42.195',  label: 'Mar', dist: 42.195 },
];

const RANGE_DAYS = { '1m': 30, '3m': 92, '6m': 183, '1y': 365, 'all': 99999 };

// Simplified Personal Records. Per-distance tiles show the all-time PR plus
// the improvement vs the previous period, mirroring the full panel's cutoff
// logic: in filtered ranges the cutoff is the window start (so "prev" is
// the best before that window began); in All Time the cutoff is the
// midpoint so we compare first half → second half of history.
//
// Placeholder tile renders when streams haven't been synced (summary-mode
// Strava users) since rolling splits require per-activity streams.
export default function PersonalRecordsCompact() {
  const data = useData();
  const { units, timeRange } = useTweaks();
  const runs = data.runs;

  const { prs, biggestDrop } = useMemo(() => {
    if (data.streamsSynced === false) return { prs: null, biggestDrop: null };
    if (!runs.length) {
      return {
        prs: DISTANCES.map((d) => ({ ...d, best: null, prev: null, bestBeforeCutoff: false, dropSec: 0 })),
        biggestDrop: null,
      };
    }

    const ts = runs.map((r) => new Date(r.date + 'T00:00:00').getTime());
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    const isAllTime = timeRange === 'all';
    const days = RANGE_DAYS[timeRange] || 99999;
    const windowStart = tMax - days * 86400000;
    // Filtered range: previous-period best = best before window opened.
    // All time: no real "before", so split the history at its midpoint.
    const cutoffT = isAllTime ? tMin + (tMax - tMin) / 2 : windowStart;

    const rows = DISTANCES.map((d) => {
      const candidates = runs
        .filter((r) => r.bestSplits && r.bestSplits[d.key] != null)
        .map((r) => ({ run: r, time: r.bestSplits[d.key] }))
        .sort((a, b) => a.time - b.time);
      if (!candidates.length) {
        return { ...d, best: null, prev: null, bestBeforeCutoff: false, dropSec: 0 };
      }
      const best = candidates[0];
      const bestT = new Date(best.run.date + 'T00:00:00').getTime();
      const bestBeforeCutoff = bestT < cutoffT;
      const prevBest = candidates.find((c) => {
        const t = new Date(c.run.date + 'T00:00:00').getTime();
        return t < cutoffT;
      });
      const dropSec = prevBest && !bestBeforeCutoff
        ? (prevBest.time - best.time) * 60
        : 0;
      return { ...d, best, prev: prevBest || null, bestBeforeCutoff, dropSec };
    });

    const drops = rows.filter((r) => r.dropSec > 1);
    const bd = drops.length ? drops.reduce((a, b) => (a.dropSec > b.dropSec ? a : b)) : null;

    return { prs: rows, biggestDrop: bd };
  }, [runs, data.streamsSynced, timeRange]);

  if (!prs) {
    return (
      <CompactTile label="Personal Records" headline="Unlock when full history syncs.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 4,
          }}
        >
          {DISTANCES.map((d) => (
            <div
              key={d.key}
              style={{
                padding: '8px 4px',
                textAlign: 'center',
                border: '1px dashed var(--ruleSoft)',
                borderRadius: 3,
              }}
            >
              <div className="mono muted" style={{ fontSize: 10, letterSpacing: '.08em' }}>
                {d.label}
              </div>
              <div className="mono muted" style={{ fontSize: 9, marginTop: 3, opacity: 0.65 }}>
                —
              </div>
            </div>
          ))}
        </div>
      </CompactTile>
    );
  }

  const covered = prs.filter((d) => d.best).length;
  let headline;
  if (covered === 0) {
    headline = 'No standard-distance PRs yet.';
  } else if (biggestDrop) {
    headline = `Biggest drop: ${biggestDrop.label} −${biggestDrop.dropSec.toFixed(0)}s.`;
  } else {
    headline = `${covered} of ${DISTANCES.length} distances covered.`;
  }

  return (
    <CompactTile label="Personal Records" headline={headline}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
        }}
      >
        {prs.map((d) => (
          <div
            key={d.key}
            style={{
              padding: '8px 4px',
              textAlign: 'center',
              border: `1px solid var(--ruleSoft)`,
              borderTop: d.best ? '2px solid var(--accent)' : '1px dashed var(--ruleSoft)',
              borderRadius: 3,
              background: 'var(--bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div className="mono muted" style={{ fontSize: 9.5, letterSpacing: '.08em' }}>
              {d.label}
            </div>
            {d.best ? (
              <>
                <div className="num" style={{ fontSize: 14, fontWeight: 500, marginTop: 2, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDuration(d.best.time)}
                </div>
                <div className="mono muted" style={{ fontSize: 8.5, lineHeight: 1.3 }}>
                  {fmtPaceUnit(d.best.time / d.dist, units)}{paceUnit(units)}
                </div>
                {/* Improvement line. Three branches — clean drop, PR predates
                    the window, or this distance only showed up recently. */}
                {d.dropSec > 0.5 ? (
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      marginTop: 1,
                      color: 'var(--positive)',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                    title={`Was ${fmtDuration(d.prev.time)} · beat by ${d.dropSec.toFixed(0)}s`}
                  >
                    −{d.dropSec.toFixed(0)}s
                  </div>
                ) : d.bestBeforeCutoff ? (
                  <div
                    className="mono muted"
                    style={{ fontSize: 8.5, marginTop: 1, fontStyle: 'italic' }}
                    title="PR set before this window opened"
                  >
                    pre-window
                  </div>
                ) : (
                  <div
                    className="mono muted"
                    style={{ fontSize: 8.5, marginTop: 1, fontStyle: 'italic' }}
                    title="First attempt at this distance falls in the current window"
                  >
                    first run
                  </div>
                )}
              </>
            ) : (
              <div className="mono muted" style={{ fontSize: 9, marginTop: 5, opacity: 0.65 }}>—</div>
            )}
          </div>
        ))}
      </div>
    </CompactTile>
  );
}
