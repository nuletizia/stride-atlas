'use client';

import { useMemo } from 'react';
import {
  useData, useFilteredRuns, useTweaks,
} from '@/lib/shared';
import CompactTile from '../CompactTile';

const RANGE_HEADLINE = {
  '1m':  'in the last month',
  '3m':  'in the last 3 months',
  '6m':  'in the last 6 months',
  '1y':  'in the last year',
  'all': 'all-time',
  'custom': 'in this range',
};

// Target number of columns in the calendar. We keep 7 rows always (one per
// weekday) and bucket whole weeks into each column so longer windows get
// more weeks-per-column instead of more columns. 14 is a sweet spot:
//   1m / 3m → 1 week per column (daily-ish)
//   6m     → 2 weeks per column
//   1y     → 4 weeks per column (roughly monthly)
//   all    → however many weeks it takes
const TARGET_COLS = 14;

// Run Atlas compact. Fixed 7-row × ~14-col grid. Each cell aggregates runs
// from the covered (weeks × weekday) slice of the window — fill = dominant
// workout type, size = total km in that slice, ink ring if any PR lands in
// the slice. Uniform rendering means the legend doesn't change across
// ranges and the pattern reads the same whether you're looking at 1 month
// or 5 years.
export default function RunAtlasCompact() {
  const data = useData();
  const runs = useFilteredRuns();
  const { timeRange } = useTweaks();

  const computed = useMemo(() => {
    if (!runs.length) return null;
    const dates = runs.map((r) => r.date).sort();
    const start = new Date(dates[0] + 'T00:00:00');
    const end = new Date(dates[dates.length - 1] + 'T00:00:00');

    // Anchor to Monday of the first week and Sunday of the last week so
    // every rendered span covers whole weeks.
    const startMon = new Date(start);
    startMon.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const endSun = new Date(end);
    endSun.setDate(end.getDate() + ((7 - ((end.getDay() + 6) % 7)) % 7));

    const totalWeeks = Math.round((endSun - startMon) / (7 * 86400000)) + 1;
    const weeksPerBucket = Math.max(1, Math.ceil(totalWeeks / TARGET_COLS));
    const bucketCount = Math.ceil(totalWeeks / weeksPerBucket);

    // cells[bucketIdx][dow] = { totalKm, byType, pr }. dow is Monday=0.
    const cells = Array.from({ length: bucketCount }, () =>
      Array.from({ length: 7 }, () => ({ totalKm: 0, byType: {}, pr: false }))
    );
    let maxKm = 0;
    runs.forEach((r) => {
      const rd = new Date(r.date + 'T00:00:00');
      const weekIdx = Math.floor((rd - startMon) / (7 * 86400000));
      const bucketIdx = Math.floor(weekIdx / weeksPerBucket);
      if (bucketIdx < 0 || bucketIdx >= bucketCount) return;
      const dow = (rd.getDay() + 6) % 7;  // Mon=0 .. Sun=6
      const c = cells[bucketIdx][dow];
      c.totalKm += r.distance;
      c.byType[r.type] = (c.byType[r.type] || 0) + r.distance;
      if (r.pr) c.pr = true;
      if (c.totalKm > maxKm) maxKm = c.totalKm;
    });

    // Bake dominant type per cell so render is pure lookup.
    const baked = cells.map((col) => col.map((c) => {
      const dominant = Object.entries(c.byType).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      return { totalKm: c.totalKm, dominant, pr: c.pr };
    }));

    return {
      cells: baked,
      bucketCount,
      weeksPerBucket,
      maxKm: maxKm || 1,
      totalCount: runs.length,
    };
  }, [runs]);

  if (!computed) {
    return (
      <CompactTile label="Run Atlas" headline="No runs in this window.">
        <div />
      </CompactTile>
    );
  }

  const headline = `${computed.totalCount} runs ${RANGE_HEADLINE[timeRange] || 'in view'}`;

  const typeMeta = data.typeMeta;
  const legendTypes = ['easy', 'tempo', 'intervals', 'long', 'race', 'recovery'];

  // Per-weekday granularity label — distinguishes "Monday (this week)" from
  // "any Monday in the last four weeks" so readers know each cell's scope.
  const granularityLabel = computed.weeksPerBucket === 1
    ? null
    : `Each column = ${computed.weeksPerBucket} weeks`;

  return (
    <CompactTile label="Run Atlas" headline={headline}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: 1 }}>
        <CalendarGrid cells={computed.cells} maxKm={computed.maxKm} />

        {granularityLabel && (
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 8.5,
              color: 'var(--inkMuted)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              textAlign: 'center',
              marginTop: -4,
            }}
          >
            {granularityLabel}
          </div>
        )}

        {/* Color legend: every workout type + PR + empty. Shared across
             every window length so the symbol table is stable. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            rowGap: 3,
            columnGap: 8,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            color: 'var(--inkMuted)',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}
        >
          {legendTypes.map((t) => (
            <LegendItem key={t} label={typeMeta[t]?.label ?? t}>
              <span
                style={{
                  display: 'inline-block',
                  width: 7, height: 7, borderRadius: '50%',
                  background: `var(--type-${t})`,
                }}
              />
            </LegendItem>
          ))}
          <LegendItem label="PR">
            <span
              style={{
                display: 'inline-block',
                width: 7, height: 7, borderRadius: '50%',
                background: 'transparent',
                border: '1.2px solid var(--ink)',
              }}
            />
          </LegendItem>
          <LegendItem label="Empty">
            <span
              style={{
                display: 'inline-block',
                width: 7, height: 7, borderRadius: 1.5,
                background: 'var(--bgSunken)',
                opacity: 0.6,
                border: '1px solid var(--ruleSoft)',
              }}
            />
          </LegendItem>
        </div>
      </div>
    </CompactTile>
  );
}

function CalendarGrid({ cells, maxKm }) {
  const rows = 7;
  const cols = cells.length;
  const GAP = 2;
  const LABEL_W = 10;  // reserve a thin gutter for day-of-week letters
  const AVAIL_W = 300 - LABEL_W;
  const AVAIL_H = 110;
  const byWidth = (AVAIL_W - (cols - 1) * GAP) / cols;
  const byHeight = (AVAIL_H - (rows - 1) * GAP) / rows;
  const CELL = Math.max(6, Math.min(18, Math.min(byWidth, byHeight)));
  const gridW = LABEL_W + cols * CELL + (cols - 1) * GAP;
  const gridH = rows * CELL + (rows - 1) * GAP;

  const sizeFor = (km) => {
    if (km <= 0) return 0;
    const minR = 2;
    const maxR = CELL / 2 - 1.5;
    return minR + Math.sqrt(km / maxKm) * (maxR - minR);
  };

  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <svg
      viewBox={`0 0 ${gridW} ${gridH}`}
      style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 130 }}
      preserveAspectRatio="xMidYMid meet"
    >
      {dayLetters.map((letter, di) => (
        <text
          key={di}
          x={LABEL_W - 3}
          y={di * (CELL + GAP) + CELL / 2 + 2.5}
          textAnchor="end"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: Math.max(6, CELL * 0.45),
            fill: 'var(--inkMuted)',
            letterSpacing: '.02em',
            textTransform: 'uppercase',
          }}
        >
          {letter}
        </text>
      ))}
      {cells.map((col, ci) => (
        <g key={ci} transform={`translate(${LABEL_W + ci * (CELL + GAP)}, 0)`}>
          {col.map((cell, di) => {
            const y = di * (CELL + GAP);
            const r = sizeFor(cell.totalKm);
            const empty = cell.totalKm <= 0;
            return (
              <g key={di}>
                <rect x={0} y={y} width={CELL} height={CELL} rx={1.5} fill="var(--bgSunken)" opacity={empty ? 0.5 : 0} />
                {!empty && (
                  <>
                    <circle cx={CELL / 2} cy={y + CELL / 2} r={r} fill={cell.dominant ? `var(--type-${cell.dominant})` : 'var(--inkMuted)'} />
                    {cell.pr && (
                      <circle cx={CELL / 2} cy={y + CELL / 2} r={r + 1.2} fill="none" stroke="var(--ink)" strokeWidth={0.8} />
                    )}
                  </>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function LegendItem({ children, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      {children}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  );
}
