'use client';

import { createContext, useContext } from 'react';

// Set by Dashboard around each tile: `{ target, onExpand }`. `target` is the
// full-view section name the tile summarizes; `onExpand(target)` switches to
// full view and scrolls there. Kept as context so the nine compact
// components don't each need a prop threaded through.
export const CompactExpandContext = createContext(null);

// Shared chrome for every tile in the 3x3 compact view. Keeps a consistent
// visual grid: small mono label at top, one-line serif-italic headline below
// it, and a flex-grow content area for the tile's chart or stat block.
// Clicking anywhere on a tile (or its Expand button, for keyboard users)
// opens that panel in the full view.
export default function CompactTile({ label, headline, children, style }) {
  const expand = useContext(CompactExpandContext);
  const onExpand = expand ? () => expand.onExpand(expand.target) : undefined;

  return (
    <div
      className={'panel' + (expand ? ' compact-tile-link' : '')}
      onClick={onExpand}
      title={expand ? `Open ${expand.target} in full view` : undefined}
      style={{
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div className="stat-label" style={{ marginBottom: 0 }}>
          {label}
        </div>
        {expand && (
          <button
            type="button"
            className="compact-tile-expand"
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            aria-label={`Open ${expand.target} in full view`}
          >
            Expand ↗
          </button>
        )}
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
