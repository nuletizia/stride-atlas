'use client';

import { useMemo } from 'react';
import {
  useData, useFilteredRuns,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

// Simplified Run Atlas: 7-row x N-week mini calendar, showing the last ~12
// weeks of activity. Size = distance, fill = workout type. No tooltips, no
// PR rings — just density at a glance.
const WEEKS_SHOWN = 12;

export default function RunAtlasCompact() {
  const data = useData();
  const runs = useFilteredRuns();

  const { weeks, maxDist, totalCount } = useMemo(() => {
    if (!runs.length) return { weeks: [], maxDist: 1, totalCount: 0 };
    const maxIso = runs.reduce((a, r) => (r.date > a ? r.date : a), runs[0].date);
    const end = new Date(maxIso + 'T00:00:00');
    // Anchor on the Sunday of the most-recent week.
    const endSun = new Date(end);
    endSun.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7)) % 7));
    const startMon = new Date(endSun);
    startMon.setDate(endSun.getDate() - WEEKS_SHOWN * 7 + 1);

    const idx = {};
    let total = 0;
    let maxD = 0;
    runs.forEach((r) => {
      const t = new Date(r.date + 'T00:00:00').getTime();
      if (t >= startMon.getTime() && t <= endSun.getTime()) {
        idx[r.date] = r;
        total += 1;
        if (r.distance > maxD) maxD = r.distance;
      }
    });

    const ws = [];
    const cur = new Date(startMon);
    while (cur <= endSun) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cur);
        d.setDate(cur.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        days.push({ iso, run: idx[iso] });
      }
      ws.push({ days });
      cur.setDate(cur.getDate() + 7);
    }
    return { weeks: ws, maxDist: maxD || 1, totalCount: total };
  }, [runs]);

  if (!weeks.length) {
    return (
      <CompactTile label="Run Atlas" headline="No runs in this window.">
        <div />
      </CompactTile>
    );
  }

  const CELL = 14;
  const GAP = 3;
  const gridW = weeks.length * (CELL + GAP);
  const gridH = 7 * (CELL + GAP);

  const sizeFor = (r) => {
    const t = Math.sqrt(r.distance / maxDist);
    return 4 + t * (CELL - 4);
  };

  return (
    <CompactTile label="Run Atlas" headline={`${totalCount} runs in the last ${WEEKS_SHOWN} weeks`}>
      <svg
        viewBox={`0 0 ${gridW} ${gridH}`}
        style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 140 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {weeks.map((w, wi) => (
          <g key={wi} transform={`translate(${wi * (CELL + GAP)}, 0)`}>
            {w.days.map((d, di) => {
              const y = di * (CELL + GAP);
              return (
                <g key={di}>
                  <rect x={0} y={y} width={CELL} height={CELL} rx={2} fill="var(--bgSunken)" opacity={d.run ? 0 : 0.5} />
                  {d.run && (
                    <circle cx={CELL / 2} cy={y + CELL / 2} r={sizeFor(d.run) / 2} fill={`var(--type-${d.run.type})`} />
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </CompactTile>
  );
}
