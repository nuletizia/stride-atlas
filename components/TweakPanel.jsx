'use client';

import { useState } from 'react';
import { useTweaks } from '@/lib/shared';

export default function TweakPanel() {
  const { style, setStyle, timeRange, setTimeRange, metric, setMetric, units, setUnits } = useTweaks();
  const [open, setOpen] = useState(false);

  const styles = [
    { id: 'editorial', label: 'Editorial', sub: 'Warm paper · serif' },
    { id: 'editorial_dark', label: 'Editorial Dark', sub: 'Ink on charcoal' },
    { id: 'telemetry', label: 'Telemetry', sub: 'Neon cockpit' },
    { id: 'fieldbook', label: 'Field Notebook', sub: 'Cartographic pigment' },
    { id: 'dataart', label: 'Data-Art', sub: 'Generative, atmospheric' },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 1001,
          padding: '10px 16px',
          background: 'var(--ink)', color: 'var(--bg)',
          border: '1px solid var(--ink)', borderRadius: 999,
          fontFamily: 'var(--mono)', fontSize: 10.5,
          letterSpacing: '.14em', textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}
        aria-label="Open tweaks"
      >
        {open ? 'Close' : 'Tweaks ⌘·'}
      </button>

      {open && (
        <div className="tweaks" style={{ bottom: 72 }}>
          <div className="tweaks-head">
            <span className="tweaks-title">Tweaks</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--inkMuted)', cursor: 'pointer', fontSize: 14 }}
              aria-label="Close"
            >×</button>
          </div>

          <div className="tweaks-row">
            <label>Visual style</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  style={{
                    textAlign: 'left',
                    background: style === s.id ? 'var(--ink)' : 'transparent',
                    color: style === s.id ? 'var(--bg)' : 'var(--ink)',
                    border: '1px solid ' + (style === s.id ? 'var(--ink)' : 'var(--ruleSoft)'),
                    borderRadius: 3, padding: '7px 10px',
                    fontFamily: 'inherit', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.06em', opacity: style === s.id ? 0.7 : 0.55 }}>
                    {s.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="tweaks-row">
            <label>Time range</label>
            <div className="seg">
              {['1m', '3m', '6m', '1y', 'all'].map((r) => (
                <button key={r} className={timeRange === r ? 'on' : ''} onClick={() => setTimeRange(r)}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="tweaks-row">
            <label>Primary metric</label>
            <div className="seg">
              <button className={metric === 'pace' ? 'on' : ''} onClick={() => setMetric('pace')}>Pace</button>
              <button className={metric === 'distance' ? 'on' : ''} onClick={() => setMetric('distance')}>Dist</button>
              <button className={metric === 'hr' ? 'on' : ''} onClick={() => setMetric('hr')}>HR</button>
            </div>
          </div>

          <div className="tweaks-row">
            <label>Units</label>
            <div className="seg">
              <button className={units === 'km' ? 'on' : ''} onClick={() => setUnits('km')}>KM</button>
              <button className={units === 'mi' ? 'on' : ''} onClick={() => setUnits('mi')}>MI</button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--inkMuted)', lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--ruleSoft)' }}>
            Changes persist across reloads.
          </div>
        </div>
      )}
    </>
  );
}
