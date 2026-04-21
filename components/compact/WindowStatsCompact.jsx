'use client';

import { useMemo } from 'react';
import {
  useData, useFilteredRuns, useTweaks,
  kmToDisplay, distUnit, fmtDuration,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Replaces RunCards in compact mode — RunCards is an interactive detail view
// that doesn't meaningfully compress to a tile. This tile shows aggregate
// stats for whatever time window the user has selected (1m / 3m / 6m / 1y /
// all / custom) so it stays in sync with the rest of the dashboard.

const RANGE_LABEL = {
  '1m': 'Last Month',
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  '1y': 'Last Year',
  'all': 'All Time',
  'custom': 'Custom Range',
};

export default function WindowStatsCompact() {
  const runs = useFilteredRuns();
  const data = useData();
  const { units, timeRange } = useTweaks();

  const view = useMemo(() => {
    if (!runs.length) return null;
    const totalKm = runs.reduce((a, r) => a + r.distance, 0);
    const totalMin = runs.reduce((a, r) => a + r.duration, 0);
    const prCount = runs.filter((r) => r.pr).length;

    // Per-week cadence from the actual window span, anchored at first → last
    // run in view. Floor the divisor at 1 so short windows don't blow up.
    const dates = runs.map((r) => new Date(r.date + 'T00:00:00').getTime());
    const span = Math.max(...dates) - Math.min(...dates);
    const weeks = Math.max(1, span / (7 * 86400000));
    const perWeek = runs.length / weeks;

    const byType = {};
    runs.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + r.distance;
    });
    const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    return {
      runCount: runs.length,
      totalKm, totalMin, prCount, perWeek, types,
    };
  }, [runs]);

  const label = RANGE_LABEL[timeRange] || 'In View';

  if (!view) {
    return (
      <CompactTile label={label} headline="No runs in this window.">
        <div />
      </CompactTile>
    );
  }

  const meta = data.typeMeta;
  const headline = view.prCount > 0
    ? `${view.runCount} runs · ${view.prCount} PR${view.prCount > 1 ? 's' : ''}.`
    : `${view.runCount} runs logged.`;

  return (
    <CompactTile label={label} headline={headline}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <Stat label="Distance" value={`${kmToDisplay(view.totalKm, units).toFixed(1)} ${distUnit(units)}`} />
          <Stat label="Time" value={fmtDuration(view.totalMin)} />
          <Stat label="Per week" value={view.perWeek.toFixed(1)} />
        </div>
        {view.types.length > 0 && (
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            {view.types.map(([t, km]) => (
              <div
                key={t}
                title={`${meta[t]?.label ?? t}: ${kmToDisplay(km, units).toFixed(1)} ${distUnit(units)}`}
                style={{
                  flex: km,
                  background: `var(--type-${t})`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </CompactTile>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="mono muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </span>
      <span className="num" style={{ fontSize: 18, fontWeight: 500, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}
