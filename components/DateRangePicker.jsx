'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Compact month-grid range picker. Opens as a popover below the trigger
// button, closes on outside click. Themed with CSS vars so it matches
// whatever visual style is active. Two-click flow:
//   1st click  → sets the start of the range
//   2nd click  → sets the end (or swaps if earlier than start), closes
// A reset button restores the full [bounds.min, bounds.max] range.
export default function DateRangePicker({ bounds, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(value.from + 'T00:00:00'));
  const [pickingStart, setPickingStart] = useState(true);
  const wrapRef = useRef(null);

  // Keep the visible month aligned with the current 'from' when the trigger opens.
  useEffect(() => {
    if (open) setViewDate(new Date(value.from + 'T00:00:00'));
  }, [open, value.from]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const toIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fmtShort = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Calendar cells for the current viewDate's month (Mon-first week).
  const cells = useMemo(() => {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // 0 = Mon
    const dim = new Date(y, m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(new Date(y, m, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewDate]);

  const canGoPrev = useMemo(() => {
    const prev = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const lastOfPrev = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
    return toIso(lastOfPrev) >= bounds.min;
  }, [viewDate, bounds.min]);

  const canGoNext = useMemo(() => {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    return toIso(next) <= bounds.max;
  }, [viewDate, bounds.max]);

  const handlePick = (d) => {
    const iso = toIso(d);
    if (iso < bounds.min || iso > bounds.max) return;
    if (pickingStart) {
      onChange({ from: iso, to: iso > value.to ? iso : value.to });
      setPickingStart(false);
    } else {
      if (iso < value.from) {
        onChange({ from: iso, to: value.from });
      } else {
        onChange({ from: value.from, to: iso });
      }
      setPickingStart(true);
      setOpen(false);
    }
  };

  const resetFull = () => {
    onChange({ from: bounds.min, to: bounds.max });
    setPickingStart(true);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="chip"
        onClick={() => setOpen((o) => !o)}
        style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}
        aria-label="Select date range"
      >
        {fmtShort(value.from)} → {fmtShort(value.to)}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
            width: 280, padding: 12,
            background: 'var(--bgRaised)',
            border: '1px solid var(--rule)', borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            fontFamily: 'var(--sans)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => canGoPrev && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              disabled={!canGoPrev}
              style={navBtn(canGoPrev)}
              aria-label="Previous month"
            >‹</button>
            <div className="mono" style={{
              fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink)',
            }}>
              {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <button
              type="button"
              onClick={() => canGoNext && setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              disabled={!canGoNext}
              style={navBtn(canGoNext)}
              aria-label="Next month"
            >›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mo','Tu','We','Th','Fr','Sa','Su'].map((d) => (
              <div key={d} className="mono" style={{
                fontSize: 9, color: 'var(--inkMuted)', textAlign: 'center', letterSpacing: '.06em', padding: '4px 0',
              }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`x${i}`} />;
              const iso = toIso(d);
              const disabled = iso < bounds.min || iso > bounds.max;
              const isFrom = iso === value.from;
              const isTo = iso === value.to;
              const isBound = isFrom || isTo;
              const inRange = iso > value.from && iso < value.to;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handlePick(d)}
                  disabled={disabled}
                  style={{
                    aspectRatio: '1 / 1',
                    fontFamily: 'var(--sans)',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                    padding: 0,
                    border: '1px solid transparent',
                    borderRadius: 3,
                    background: isBound ? 'var(--ink)' : inRange ? 'var(--bgSunken)' : 'transparent',
                    color: isBound ? 'var(--bg)' : disabled ? 'var(--inkMuted)' : 'var(--ink)',
                    opacity: disabled ? 0.35 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: isBound ? 500 : 400,
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--ruleSoft)',
            fontSize: 10.5, color: 'var(--inkMuted)',
          }}>
            <span style={{ fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>
              {pickingStart ? 'Tap start date' : 'Tap end date'}
            </span>
            <button
              type="button"
              className="chip"
              onClick={resetFull}
              style={{ padding: '3px 8px', fontSize: 10 }}
            >Reset</button>
          </div>
        </div>
      )}
    </div>
  );
}

function navBtn(enabled) {
  return {
    width: 24, height: 24, padding: 0,
    border: '1px solid var(--rule)',
    background: 'transparent',
    color: enabled ? 'var(--ink)' : 'var(--inkMuted)',
    borderRadius: 3,
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4,
    fontFamily: 'var(--sans)',
    fontSize: 14,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  };
}
