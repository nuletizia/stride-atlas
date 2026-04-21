'use client';

import { useMemo } from 'react';
import {
  useFilteredRuns, useTweaks, fmtDuration,
  kmToDisplay, distUnit,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

function isoWeekKey(iso) {
  const date = new Date(iso + 'T00:00:00');
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  const n = 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(n).padStart(2, '0')}`;
}

// Simplified Week Comparator: per metric, a split bar showing the current
// week filled solid and the best week shown as an outlined ceiling. Both
// numbers appear at the right so the gap is legible at a glance.
export default function WeekComparatorCompact() {
  const runs = useFilteredRuns();
  const { units } = useTweaks();

  const { thisWeek, bestWeek, sameWeek, headline } = useMemo(() => {
    if (!runs.length) return { thisWeek: null, bestWeek: null, sameWeek: false, headline: 'No runs this week.' };
    const weeks = {};
    runs.forEach((r) => {
      const k = isoWeekKey(r.date);
      if (!weeks[k]) weeks[k] = { key: k, distance: 0, duration: 0, runs: 0 };
      weeks[k].distance += r.distance;
      weeks[k].duration += r.duration;
      weeks[k].runs += 1;
    });
    const arr = Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key));
    const tw = arr[arr.length - 1];
    const bw = arr.reduce((a, w) => (!a || w.distance > a.distance ? w : a), null);
    const same = arr.length < 2 || tw.key === bw.key;
    const year = tw.key.slice(0, 4);
    let h;
    if (same) {
      h = `Biggest week of ${year} so far.`;
    } else {
      const ratio = tw.distance / bw.distance;
      if (ratio > 0.9) h = `Close to your ${year} ceiling.`;
      else if (ratio < 0.3) h = `A lighter week than your best.`;
      else h = `Current week vs ${year} best.`;
    }
    return { thisWeek: tw, bestWeek: bw, sameWeek: same, headline: h };
  }, [runs]);

  if (!thisWeek) {
    return (
      <CompactTile label="This Week · Best Week" headline={headline}>
        <div />
      </CompactTile>
    );
  }

  const metrics = [
    { key: 'distance', label: 'Dist', fmt: (v) => `${kmToDisplay(v, units).toFixed(1)}${distUnit(units)}` },
    { key: 'runs', label: 'Runs', fmt: (v) => String(v) },
    { key: 'duration', label: 'Time', fmt: (v) => fmtDuration(v) },
  ];

  return (
    <CompactTile label="This Week · Best Week" headline={headline}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {metrics.map((m) => {
          const tv = thisWeek[m.key];
          const bv = bestWeek?.[m.key] ?? tv;
          const ratio = bv ? Math.min(1, tv / bv) : 1;
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono muted" style={{ fontSize: 9.5, width: 36, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {m.label}
              </span>
              {/* Track = best-week ceiling (outlined). Fill = current week
                   (solid). Best-week cap-tick sits at 100% to make the
                   reference line explicit even when current == best. */}
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  height: 8,
                  border: '1px solid var(--rule)',
                  borderRadius: 3,
                  background: 'var(--bgSunken)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${ratio * 100}%`,
                    background: sameWeek ? 'var(--accent)' : 'var(--ink)',
                  }}
                />
                {!sameWeek && (
                  <div
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      width: 2,
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </div>
              <div
                className="num"
                style={{
                  fontSize: 11,
                  minWidth: 92,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{m.fmt(tv)}</span>
                {!sameWeek && (
                  <>
                    <span style={{ color: 'var(--inkMuted)', margin: '0 4px' }}>/</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{m.fmt(bv)}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div
          className="mono muted"
          style={{
            fontSize: 9.5,
            letterSpacing: '.06em',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            marginTop: -2,
          }}
        >
          <span><span style={{ color: 'var(--ink)' }}>■</span> this</span>
          {!sameWeek && <span><span style={{ color: 'var(--accent)' }}>■</span> best</span>}
        </div>
      </div>
    </CompactTile>
  );
}
