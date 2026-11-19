'use client';

import { useFitnessDuel, groupNoun } from '../FitnessDuel';
import CompactTile from '../CompactTile';

// Simplified Fitness Duel: the latest period's score as a big number, with
// the score line underneath. Uses the full panel's last picks.
export default function FitnessDuelCompact() {
  const { result, groupId } = useFitnessDuel();
  const { solid, peak, latest, metric } = result;
  const noun = groupNoun(groupId);

  if (solid.length < 2) {
    return (
      <CompactTile label="Fitness Duel" headline="Needs more runs to duel.">
        <div />
      </CompactTile>
    );
  }

  const headline = latest.key === peak.key
    ? metric.words.yet(noun)
    : `${metric.words.best(noun)}: ${peak.long}.`;

  const W = 320, H = 90, P = 4;
  const n = solid.length;
  const x = (i) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v) => P + (1 - v) * (H - 2 * P);
  const path = solid.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join('');

  return (
    <CompactTile label="Fitness Duel" headline={headline}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em',
              color: latest.score >= 0.5 ? 'var(--positive)' : 'var(--inkSoft)',
            }}
          >
            {Math.round(latest.score * 100)}%
          </span>
          <span className="mono muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {latest.long} · {metric.label}
          </span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <line x1={P} x2={W - P} y1={y(0.5)} y2={y(0.5)} stroke="var(--ruleSoft)" strokeDasharray="2 3" />
          <path d={path} fill="none" stroke="var(--inkSoft)" strokeWidth={1.5} />
          {solid.map((p, i) => (
            <circle
              key={p.key}
              cx={x(i)} cy={y(p.score)} r={p.key === peak.key ? 4 : 2.5}
              fill={p.key === peak.key ? 'var(--accent)' : 'var(--ink)'}
            />
          ))}
        </svg>
      </div>
    </CompactTile>
  );
}
