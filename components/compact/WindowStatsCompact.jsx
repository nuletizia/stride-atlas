'use client';

import { useMemo } from 'react';
import {
  useData, useFilteredRuns, useTweaks,
  fmtDate, fmtDistance, fmtDuration, fmtPaceUnit,
  kmToDisplay, distUnit, paceUnit,
  hasValidHr,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Replaces RunCards in compact mode. RunCards in the full view is all about
// per-run cohort detail — so the compact keeps that flavor by surfacing the
// three most recent runs as tiny inline rows. Aggregate totals on top
// provide the window summary; the run list below is the one piece of
// information no other compact tile carries.

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

    // Latest five runs sorted descending — enough context to read training
    // rhythm over a week or two without overwhelming the tile.
    const latest = [...runs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    return {
      runCount: runs.length,
      totalKm, totalMin, prCount, perWeek, latest,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <Stat label="Distance" value={`${kmToDisplay(view.totalKm, units).toFixed(1)} ${distUnit(units)}`} />
          <Stat label="Time" value={fmtDuration(view.totalMin)} />
          <Stat label="Per week" value={view.perWeek.toFixed(1)} />
        </div>

        <div style={{ borderTop: '1px solid var(--ruleSoft)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            className="mono muted"
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            Latest runs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {view.latest.map((r) => (
              <RunRow key={r.id} run={r} units={units} typeLabel={meta[r.type]?.label ?? r.type} />
            ))}
          </div>
        </div>
      </div>
    </CompactTile>
  );
}

function RunRow({ run, units, typeLabel }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 11,
        color: 'var(--inkSoft)',
        lineHeight: 1.3,
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: `var(--type-${run.type})`,
          flexShrink: 0,
        }}
      />
      <span
        className="mono"
        style={{
          fontSize: 9.5,
          width: 38,
          color: 'var(--inkMuted)',
          letterSpacing: '.04em',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {fmtDate(run.date)}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--ink)',
        }}
      >
        {typeLabel}
      </span>
      <span
        className="num"
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--ink)',
          fontWeight: 500,
          minWidth: 46,
          textAlign: 'right',
        }}
      >
        {fmtDistance(run.distance, units, 1)}
        <span className="mono muted" style={{ fontSize: 9, marginLeft: 2 }}>
          {distUnit(units)}
        </span>
      </span>
      <span
        className="mono"
        style={{
          fontSize: 9.5,
          minWidth: 44,
          textAlign: 'right',
          color: 'var(--inkMuted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtPaceUnit(run.pace, units)}
        <span style={{ marginLeft: 1 }}>{paceUnit(units)}</span>
      </span>
      <span
        className="mono"
        style={{
          fontSize: 9.5,
          minWidth: 32,
          textAlign: 'right',
          color: 'var(--inkMuted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hasValidHr(run) ? (
          <>
            {run.hr}
            <span className="muted" style={{ fontSize: 8.5, marginLeft: 1 }}>bpm</span>
          </>
        ) : '—'}
      </span>
      {run.pr && (
        <span
          className="mono"
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '.08em',
            marginLeft: -2,
            flexShrink: 0,
          }}
        >
          PR
        </span>
      )}
    </div>
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
