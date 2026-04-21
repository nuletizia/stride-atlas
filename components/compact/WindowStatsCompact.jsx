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

    // Latest three runs sorted descending — enough rhythm to read without
    // crowding the tile once the type-mix stripe and HR column are stacked
    // above/beside them.
    const latest = [...runs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);

    // Distance per workout type across the whole window — drives the
    // full-width color stripe that sits between the stats row and the
    // latest-runs list. Sort descending so dominant types anchor the left.
    const byType = {};
    runs.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + r.distance;
    });
    const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);

    // 80/20 intensity split. Easy = aerobic-base work (easy + long +
    // recovery); hard = threshold-and-above (tempo + intervals + race).
    // Expressed as percentages of total km so a glance says whether the
    // runner is respecting the classic 80/20 polarised distribution.
    const easyKm = (byType.easy || 0) + (byType.long || 0) + (byType.recovery || 0);
    const hardKm = (byType.tempo || 0) + (byType.intervals || 0) + (byType.race || 0);
    const catTotal = easyKm + hardKm;
    const easyPct = catTotal > 0 ? Math.round((easyKm / catTotal) * 100) : 0;
    const hardPct = catTotal > 0 ? 100 - easyPct : 0;

    return {
      runCount: runs.length,
      totalKm, totalMin, prCount, perWeek, latest, types,
      easyPct, hardPct,
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

        {view.types.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              title="Distance share by workout type"
              style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}
            >
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
            <div
              title="Easy = easy + long + recovery · Hard = tempo + intervals + race"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'var(--inkMuted)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--type-easy)' }} />
                <span>
                  Easy{' '}
                  <b style={{ color: 'var(--ink)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {view.easyPct}%
                  </b>
                </span>
              </span>
              <span style={{ opacity: 0.7, fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>
                target 80/20
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>
                  Hard{' '}
                  <b style={{ color: 'var(--ink)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {view.hardPct}%
                  </b>
                </span>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--type-intervals)' }} />
              </span>
            </div>
          </div>
        )}

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
