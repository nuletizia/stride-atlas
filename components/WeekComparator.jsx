'use client';

import { useMemo } from 'react';
import {
  useFilteredRuns, useTweaks, fmtDuration,
  kmToDisplay, elevToDisplay, distUnit, elevUnit,
} from '@/lib/shared';

export default function WeekComparator() {
  const runs = useFilteredRuns();
  const { units } = useTweaks();

  const { thisWeek, bestWeek, thisLabel, bestLabel } = useMemo(() => {
    function isoWeekKey(d) {
      const date = new Date(d + 'T00:00:00');
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
      const w1 = new Date(date.getFullYear(), 0, 4);
      const n = 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
      return `${date.getFullYear()}-W${String(n).padStart(2, '0')}`;
    }
    const weeks = {};
    runs.forEach((r) => {
      const k = isoWeekKey(r.date);
      if (!weeks[k]) weeks[k] = { key: k, distance: 0, duration: 0, runs: 0, prs: 0, elev: 0, dates: [] };
      weeks[k].distance += r.distance;
      weeks[k].duration += r.duration;
      weeks[k].runs += 1;
      weeks[k].prs += r.pr ? 1 : 0;
      weeks[k].elev += r.elev;
      weeks[k].dates.push(r.date);
    });
    const arr = Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key));
    const this_ = arr[arr.length - 1] || null;
    const best = arr.reduce((a, w) => (!a || w.distance > a.distance ? w : a), null);
    function label(w) {
      if (!w) return '—';
      const first = w.dates.sort()[0];
      return new Date(first + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return { thisWeek: this_, bestWeek: best, thisLabel: label(this_), bestLabel: label(best) };
  }, [runs]);

  if (!thisWeek) return null;

  const metrics = [
    { key: 'distance', label: 'Distance', unit: distUnit(units), fmt: (v) => kmToDisplay(v, units).toFixed(1) },
    { key: 'runs', label: 'Runs', unit: '', fmt: (v) => v },
    { key: 'duration', label: 'Time', unit: '', fmt: (v) => fmtDuration(v) },
    { key: 'elev', label: 'Elev', unit: elevUnit(units), fmt: (v) => Math.round(elevToDisplay(v, units)) },
  ];

  return (
    <div className="panel" style={{ padding: '20px 22px', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <div className="stat-label" style={{ marginBottom: 4 }}>This Week vs. Best Week</div>
        <div style={{ fontSize: 13, color: 'var(--inkSoft)' }}>
          Your ceiling, and how close you are right now.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <WeekCol title="This week" label={thisLabel} week={thisWeek} metrics={metrics} accent={false} />
        <WeekCol title="Best week" label={bestLabel} week={bestWeek} metrics={metrics} accent={true} />
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--ruleSoft)' }}>
        {metrics.slice(0, 3).map((m) => {
          const ratio = bestWeek[m.key] ? thisWeek[m.key] / bestWeek[m.key] : 0;
          return (
            <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span className="mono muted" style={{ fontSize: 10, width: 64, textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.label}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--bgSunken)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: '100%', background: 'var(--ink)' }} />
              </div>
              <span className="mono num" style={{ fontSize: 11, width: 40, textAlign: 'right' }}>
                {Math.round(ratio * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekCol({ title, label, week, metrics, accent }) {
  return (
    <div style={{ padding: 14, background: accent ? 'var(--bgSunken)' : 'transparent', border: '1px solid var(--ruleSoft)', borderRadius: 4 }}>
      <div className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{title}</div>
      <div style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 18 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        {metrics.map((m) => (
          <div key={m.key}>
            <div className="mono muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em' }}>{m.label}</div>
            <div className="num" style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {m.fmt(week[m.key])}{m.unit && <span className="mono muted" style={{ fontSize: 10, marginLeft: 2 }}>{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
