'use client';

import { useEffect, useState } from 'react';

// Per-panel collapse for the full (vertical) view. Wraps a single panel in
// its `.section` and adds a small toggle pill on the panel's top border —
// the inter-panel gap, clear of every header's top-right legend/toggle.
//
// Collapse is a full-view-only convenience (the compact 3x3 grid has no
// notion of it). State persists per panel under its own localStorage key so
// nine independent sections never race on a shared blob. Init is `false` and
// the stored value is read in an effect to avoid an SSR hydration mismatch.
function storageKey(name) {
  return 'stride.panel.collapsed.' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export default function CollapsibleSection({ name, children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey(name)) === '1');
    } catch {
      // private mode / disabled storage — stay expanded
    }
  }, [name]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(storageKey(name), next ? '1' : '0');
      } catch {
        // ignore persistence failures
      }
      return next;
    });
  };

  return (
    <div className="section" style={{ position: 'relative' }}>
      <button
        className="chip"
        onClick={toggle}
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        title={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        style={{
          position: 'absolute',
          top: -11,
          right: 18,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 8px',
          lineHeight: 1,
        }}
      >
        <svg
          width={11}
          height={11}
          viewBox="0 0 12 12"
          style={{
            display: 'block',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 140ms ease',
          }}
        >
          <path
            d="M2.5 4.5 L6 8 L9.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {collapsed ? 'Show' : 'Hide'}
      </button>

      {collapsed ? (
        <div className="panel" style={{ padding: '14px 22px' }}>
          <div className="stat-label">{name}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
