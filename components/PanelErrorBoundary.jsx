'use client';

import React from 'react';

// Class component because error boundaries only exist in the class API.
// Wraps a single panel section so one bad panel doesn't crash the whole
// dashboard. Shows a compact, themed fallback with the panel's name and
// an option to surface the stack (dev-only) or just acknowledge the
// error (prod) — the user keeps reading the rest of the dashboard.
export default class PanelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log only in the browser — on the server this could spam Vercel logs.
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error(`[Panel error: ${this.props.name || 'unknown'}]`, error, info);
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
    return (
      <div
        className="panel"
        style={{
          padding: '20px 22px',
          background: 'var(--bgSunken)',
          border: '1px dashed var(--rule)',
        }}
      >
        <div className="stat-label" style={{ marginBottom: 6 }}>
          {this.props.name || 'Panel'} unavailable
        </div>
        <div style={{ fontSize: 13, color: 'var(--inkSoft)', lineHeight: 1.5, maxWidth: 560 }}>
          This panel hit an error and couldn&rsquo;t render. The rest of the dashboard is unaffected.
          Try reloading the page; if it keeps happening, let me know.
        </div>
        {isDev && (
          <pre
            style={{
              marginTop: 12, padding: 10,
              background: 'var(--bg)', border: '1px solid var(--ruleSoft)', borderRadius: 4,
              fontSize: 11, lineHeight: 1.4, overflowX: 'auto', color: 'var(--inkSoft)',
            }}
          >
            {String(this.state.error?.stack || this.state.error || 'unknown error')}
          </pre>
        )}
      </div>
    );
  }
}
