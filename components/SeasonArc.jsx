'use client';

import { useMemo } from 'react';
import { useData } from '@/lib/shared';

export default function SeasonArc() {
  const data = useData();
  const all = data.runs;

  const years = useMemo(() => {
    const o = {};
    all.forEach((r) => {
      const date = new Date(r.date + 'T00:00:00');
      const y = date.getFullYear();
      const start = new Date(y, 0, 1);
      const woy = Math.floor(((date - start) / 86400000 + start.getDay()) / 7);
      if (!o[y]) o[y] = {};
      if (!o[y][woy]) o[y][woy] = { distance: 0, runs: 0 };
      o[y][woy].distance += r.distance;
      o[y][woy].runs += 1;
    });
    return o;
  }, [all]);

  const yearList = Object.keys(years).sort();
  const W = 620;
  const H = 140;
  const LEFT = 30;
  const RIGHT = 20;
  const PLOT_W = W - LEFT - RIGHT;
  const PLOT_H = H - 30;

  const maxDist = useMemo(() => {
    let m = 0;
    Object.values(years).forEach((y) => {
      Object.values(y).forEach((w) => { if (w.distance > m) m = w.distance; });
    });
    return m || 1;
  }, [years]);

  function makePath(y) {
    const dataY = years[y];
    const pts = [];
    for (let w = 0; w < 53; w++) {
      const x = LEFT + (w / 52) * PLOT_W;
      const d = dataY[w]?.distance || 0;
      const yv = PLOT_H - (d / maxDist) * PLOT_H + 10;
      pts.push({ x, y: yv });
    }
    const path = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    const area = path + ` L ${pts[pts.length - 1].x} ${PLOT_H + 10} L ${pts[0].x} ${PLOT_H + 10} Z`;
    return { path, area };
  }

  const colors = { [yearList[0]]: 'var(--inkMuted)' };
  colors[yearList[yearList.length - 1]] = 'var(--accent)';

  const totals = yearList.map((y) => ({
    year: y,
    distance: Object.values(years[y]).reduce((a, w) => a + w.distance, 0),
    runs: Object.values(years[y]).reduce((a, w) => a + w.runs, 0),
  }));

  if (!yearList.length) return null;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Season Arc · Year over Year</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 420 }}>
            Weekly distance, each season stacked. Your future self is the one climbing higher.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          {totals.map((t) => (
            <div key={t.year} className="stat" style={{ alignItems: 'flex-start' }}>
              <div className="stat-label" style={{ color: colors[t.year] }}>{t.year}</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{t.distance.toFixed(0)}<span className="unit">km</span></div>
              <div className="mono muted" style={{ fontSize: 10.5 }}>{t.runs} runs</div>
            </div>
          ))}
        </div>
      </div>

      <svg width={W} height={H + 20}>
        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
          const x = LEFT + (i / 12) * PLOT_W;
          return (
            <g key={m}>
              <line x1={x} x2={x} y1={10} y2={PLOT_H + 10} stroke="var(--ruleSoft)" />
              <text x={x + 3} y={H + 12} style={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'var(--inkMuted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {m.toUpperCase()}
              </text>
            </g>
          );
        })}

        {yearList.map((y) => {
          const { path, area } = makePath(y);
          const col = colors[y] || 'var(--inkSoft)';
          const isLatest = y === yearList[yearList.length - 1];
          return (
            <g key={y}>
              <path d={area} fill={col} opacity={isLatest ? 0.18 : 0.08} />
              <path d={path} fill="none" stroke={col} strokeWidth={isLatest ? 1.8 : 1.2} opacity={isLatest ? 1 : 0.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
