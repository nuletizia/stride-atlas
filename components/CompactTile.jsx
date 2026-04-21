'use client';

// Shared chrome for every tile in the 3x3 compact view. Keeps a consistent
// visual grid: small mono label at top, one-line serif-italic headline below
// it, and a flex-grow content area for the tile's chart or stat block.
// Tiles are non-interactive by design — the compact view is a glance, not a
// deep-dive.
export default function CompactTile({ label, headline, children, style }) {
  return (
    <div
      className="panel"
      style={{
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        ...style,
      }}
    >
      <div
        className="stat-label"
        style={{ marginBottom: 4 }}
      >
        {label}
      </div>
      {headline && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.25,
            color: 'var(--inkSoft)',
            marginBottom: 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {headline}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
