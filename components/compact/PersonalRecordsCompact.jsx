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

// Simplified Personal Records: 5 small stat tiles, all-time. Shows a
// placeholder when streams haven't been synced (the common Strava summary
// case).
export default function PersonalRecordsCompact() {
  const data = useData();
  const { units } = useTweaks();
  const runs = data.runs;

  const prs = useMemo(() => {
    if (data.streamsSynced === false) return null;
    return DISTANCES.map((d) => {
      const candidates = runs
        .filter((r) => r.bestSplits && r.bestSplits[d.key] != null)
        .map((r) => ({ run: r, time: r.bestSplits[d.key] }))
        .sort((a, b) => a.time - b.time);
      return { ...d, best: candidates[0] || null };
    });
  }, [runs, data.streamsSynced]);

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
  const headline = covered === 0
    ? 'No standard-distance PRs yet.'
    : `${covered} of ${DISTANCES.length} distances covered.`;

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
            }}
          >
            <div className="mono muted" style={{ fontSize: 9.5, letterSpacing: '.08em' }}>
              {d.label}
            </div>
            {d.best ? (
              <>
                <div className="num" style={{ fontSize: 14, fontWeight: 500, marginTop: 3, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDuration(d.best.time)}
                </div>
                <div className="mono muted" style={{ fontSize: 8.5, marginTop: 2 }}>
                  {fmtPaceUnit(d.best.time / d.dist, units)}{paceUnit(units)}
                </div>
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
