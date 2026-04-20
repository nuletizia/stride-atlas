'use client';

import { useState } from 'react';
import { useTweaks } from '@/lib/shared';
import { palettes } from '@/lib/theme';
import TimeRangeControl from './TimeRangeControl';

const STYLES = [
  { id: 'editorial', label: 'Editorial',      sub: 'Warm paper · serif',      serif: "'Instrument Serif', serif",  hasDark: true },
  { id: 'telemetry', label: 'Telemetry',      sub: 'Neon cockpit',            serif: "'Space Grotesk', sans-serif", hasDark: false },
  { id: 'fieldbook', label: 'Field Notebook', sub: 'Cartographic pigment',    serif: "'EB Garamond', serif",       hasDark: false },
  { id: 'dataart',   label: 'Data-Art',       sub: 'Generative, atmospheric', serif: "'EB Garamond', serif",       hasDark: false },
];

const familyOf = (s) => (s === 'editorial_dark' ? 'editorial' : s);
const isEditorialDark = (s) => s === 'editorial_dark';

export default function TweakPanel() {
  const { style, setStyle, units, setUnits } = useTweaks();
  const [open, setOpen] = useState(false);

  const activeFamily = familyOf(style);

  const selectFamily = (s) => {
    if (activeFamily === s.id) return;
    setStyle(s.id);
  };

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
        aria-label="Open view"
      >
        {open ? 'Close' : 'View ⌘·'}
      </button>

      {open && (
        <div className="tweaks" style={{ bottom: 72 }}>
          <div className="tweaks-head">
            <span className="tweaks-title">View</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--inkMuted)', cursor: 'pointer', fontSize: 14 }}
              aria-label="Close"
            >×</button>
          </div>

          <div className="tweaks-row">
            <label>Visual style</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STYLES.map((s) => {
                const active = activeFamily === s.id;
                // Editorial tile mirrors the current light/dark mode so the
                // preview tracks reality; other families have a single palette.
                const previewId = s.id === 'editorial' && isEditorialDark(style) ? 'editorial_dark' : s.id;
                const p = palettes[previewId] || palettes.editorial;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectFamily(s)}
                    title={s.sub}
                    aria-label={`${s.label} — ${s.sub}`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: 0, background: 'transparent', border: 'none',
                      cursor: 'pointer', width: 54,
                    }}
                  >
                    <div
                      style={{
                        width: 48, height: 48, borderRadius: 5, overflow: 'hidden',
                        background: p.bg,
                        outline: active ? '2px solid var(--accent)' : '1px solid var(--rule)',
                        outlineOffset: active ? 1 : 0,
                        position: 'relative',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'outline-color 120ms ease',
                      }}
                    >
                      <span style={{
                        fontFamily: s.serif, color: p.ink, fontSize: 19,
                        fontStyle: s.id === 'telemetry' ? 'normal' : 'italic',
                        lineHeight: 1, marginTop: -4,
                      }}>Aa</span>
                      <div style={{
                        position: 'absolute', left: 0, right: 0, bottom: 0,
                        height: 10, background: p.accent,
                      }} />
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase',
                        color: active ? 'var(--ink)' : 'var(--inkMuted)',
                        fontWeight: active ? 500 : 400,
                        lineHeight: 1.2, textAlign: 'center', maxWidth: 60,
                      }}
                    >
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeFamily === 'editorial' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mono" style={{
                  fontSize: 9.5, color: 'var(--inkMuted)',
                  textTransform: 'uppercase', letterSpacing: '.1em',
                }}>Mode</span>
                <div className="seg" style={{ flex: 1 }}>
                  <button
                    className={!isEditorialDark(style) ? 'on' : ''}
                    onClick={() => setStyle('editorial')}
                  >Light</button>
                  <button
                    className={isEditorialDark(style) ? 'on' : ''}
                    onClick={() => setStyle('editorial_dark')}
                  >Dark</button>
                </div>
              </div>
            )}
          </div>

          <div className="tweaks-row">
            <label>Time range</label>
            <TimeRangeControl />
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
