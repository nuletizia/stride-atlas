'use client';

// Legend under the two comparison scatters (Aerobic Efficiency, Aerobic
// Durability). Swatches match the core regions drawn in the plot; the
// caption line says which two sets are compared (previous window or the
// halves fallback, with the reason).
export default function ComparisonLegend({ trend, caption, indent = 0 }) {
  const row = {
    display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)',
    textTransform: 'uppercase', letterSpacing: '.08em',
  };
  const detail = { textTransform: 'none', letterSpacing: 0 };
  return (
    <div style={{ marginTop: 8, paddingLeft: indent, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={row}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={12} style={{ display: 'block' }}>
            <rect x={1} y={1} width={16} height={10} rx={5} fill="var(--inkMuted)" fillOpacity={0.2} stroke="var(--inkSoft)" strokeDasharray="3 2" />
          </svg>
          earlier {trend && (
            <span style={{ ...detail, color: 'var(--inkSoft)' }}>
              · {trend.earlyLabel} · {trend.earlyN} runs
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={18} height={12} style={{ display: 'block' }}>
            <rect x={1} y={1} width={16} height={10} rx={5} fill="var(--accent)" fillOpacity={0.18} stroke="var(--accent)" strokeWidth={1.4} />
          </svg>
          recent {trend && (
            <span style={{ ...detail, color: 'var(--ink)' }}>
              · {trend.lateLabel} · {trend.lateN} runs
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={14} height={14} style={{ display: 'block' }}>
            <circle cx={7} cy={7} r={2.4} fill="var(--ink)" />
            <circle cx={7} cy={7} r={5.5} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
          </svg>
          ringed = open card
        </span>
      </div>
      {caption && (
        <div style={{ ...detail, fontSize: 10.5, color: 'var(--inkMuted)', fontFamily: 'var(--mono)' }}>
          Shaded = middle half of each set. {caption}.
        </div>
      )}
    </div>
  );
}
