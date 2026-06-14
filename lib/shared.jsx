'use client';

import {
  useState, useEffect, useMemo, useCallback,
  createContext, useContext,
} from 'react';
import { applyTheme } from './theme';
import { inferType } from './ingest-runtime';

// ---------- formatters ----------
export function pad(n) { return String(n).padStart(2, '0'); }

export function fmtPace(p) {
  if (!p || !isFinite(p)) return '—';
  const mins = Math.floor(p);
  const secs = Math.round((p - mins) * 60);
  return `${mins}:${pad(secs)}`;
}
export function fmtDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const s = Math.round((min - Math.floor(min)) * 60);
  if (h) return `${h}h ${pad(m)}m`;
  return `${m}:${pad(s)}`;
}
export function fmtDate(iso, opts = {}) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: opts.year ? 'numeric' : undefined,
  });
}
export function hasValidHr(r) {
  return r && r.hr != null && r.hr >= 60 && r.hr <= 230;
}

// Efficiency Factor: speed (m/min) ÷ avg HR. A compound "how much speed am I
// producing per bpm" metric — higher = more efficient. Null without valid HR.
export const efOf = (r) => (hasValidHr(r) && r.pace ? (1000 / r.pace) / r.hr : null);

// Stamina: EF weighted by distance — rewards holding efficiency over longer
// runs so a 1 km and a half-M at equal EF aren't read as equal. Uses raw km
// (unit-independent index). Higher = better.
export const STAMINA_EXP = 0.1;
export const stamOf = (r) => {
  const ef = efOf(r);
  return ef != null && r.distance ? ef * Math.pow(r.distance, STAMINA_EXP) : null;
};

// Fraction of wall-clock (elapsed) time a run spent stopped: 1 - moving/elapsed.
// Strava auto-pauses, so a run broken up by red lights or photo stops reports a
// fast *moving* pace (stops excluded) while average HR sags during the stops.
// We surface this number as neutral info in tooltips and run cards once it
// passes the threshold below; we don't exclude or re-rank runs on it — the
// reader weighs it themselves.
export const STOPPED_RATIO_WARN = 0.05; // default: surface the stopped % at >=5%
// Guardrails for the user-tunable threshold (View panel). 1%–30% of elapsed.
export const STOPPED_RATIO_MIN = 0.01;
export const STOPPED_RATIO_MAX = 0.30;
export function isInterrupted(r, threshold = STOPPED_RATIO_WARN) {
  return r != null && (r.stoppedRatio ?? 0) >= threshold;
}

// Arithmetic mean. Used for scatter-panel centroids ("+" markers) so the
// marker is the cloud's center of mass and every new run shifts it
// proportionally — important at small N (4–20 runs per half) where median
// would snap discretely between specific runs.
export function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
export function fmtHr(r) {
  return hasValidHr(r) ? `${r.hr} bpm` : '—';
}
export function fmtElev(r) {
  return r && r.elev != null ? `${r.elev}` : '—';
}

// ---------- unit conversion ----------
// Data layer stays in km, min/km, and meters. All conversion happens at
// display time. Pace math: 1 mi takes 1/MI_PER_KM as many minutes as 1 km.
export const MI_PER_KM = 0.621371;
export const FT_PER_M = 3.28084;

export function kmToDisplay(km, units) {
  if (km == null) return null;
  return units === 'mi' ? km * MI_PER_KM : km;
}
export function paceToDisplay(pacePerKm, units) {
  if (pacePerKm == null) return null;
  return units === 'mi' ? pacePerKm / MI_PER_KM : pacePerKm;
}
export function elevToDisplay(m, units) {
  if (m == null) return null;
  return units === 'mi' ? m * FT_PER_M : m;
}
export function distUnit(units) { return units === 'mi' ? 'mi' : 'km'; }
export function paceUnit(units) { return units === 'mi' ? '/mi' : '/km'; }
export function paceUnitLong(units) { return units === 'mi' ? 'min/mi' : 'min/km'; }
export function elevUnit(units) { return units === 'mi' ? 'ft' : 'm'; }
export function fmtDistance(km, units, decimals = 1) {
  if (km == null || !isFinite(km)) return '—';
  return kmToDisplay(km, units).toFixed(decimals);
}
export function fmtPaceUnit(pacePerKm, units) {
  return fmtPace(paceToDisplay(pacePerKm, units));
}

// ---------- "Biggest improvement" callout primitives ----------
// Single-sentence takeaway block rendered at the bottom of progress panels.
// Accent left border makes it easy to spot; muted tone is used for
// "keep logging" fallbacks or honest regressions.
export function Highlight({ children, tone = 'accent' }) {
  const borderColor = tone === 'muted' ? 'var(--ruleSoft)' : 'var(--accent)';
  return (
    <div style={{
      marginTop: 14,
      padding: '11px 14px 11px 18px',
      background: 'var(--bgSunken)',
      borderLeft: `3px solid ${borderColor}`,
      borderTop: '1px solid var(--ruleSoft)',
      borderRight: '1px solid var(--ruleSoft)',
      borderBottom: '1px solid var(--ruleSoft)',
      fontSize: 13.5,
      color: 'var(--ink)',
      lineHeight: 1.5,
      fontStyle: 'italic',
      fontFamily: 'var(--serif)',
      fontWeight: 500,
    }}>
      {children}
    </div>
  );
}
export function HlNum({ children }) {
  return <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>{children}</b>;
}

export function fmtDelta(delta, unit = '', inverse = false) {
  if (!isFinite(delta) || Math.abs(delta) < 0.005) return { text: '±0', cls: '' };
  const sign = delta > 0 ? '+' : '−';
  const mag = Math.abs(delta);
  const isUp = delta > 0;
  const good = inverse ? !isUp : isUp;
  return {
    text: `${sign}${mag.toFixed(mag < 1 ? 2 : 1)}${unit}`,
    cls: good ? 'up' : 'down',
  };
}

// ---------- HRmax context: user can override, everything downstream reacts ----------
const HrMaxContext = createContext(null);
const HR_OVERRIDE_KEY = 'stride.hrMaxOverride';

export function HrMaxProvider({ baseHrMax = 190, children }) {
  const [override, setOverride] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(HR_OVERRIDE_KEY);
    const n = Number(raw);
    if (isFinite(n) && n >= 140 && n <= 230) setOverride(n);
  }, []);

  const persistOverride = useCallback((n) => {
    if (n == null) {
      if (typeof window !== 'undefined') window.localStorage.removeItem(HR_OVERRIDE_KEY);
      setOverride(null);
    } else if (isFinite(n) && n >= 140 && n <= 230) {
      if (typeof window !== 'undefined') window.localStorage.setItem(HR_OVERRIDE_KEY, String(n));
      setOverride(n);
    }
  }, []);

  const effective = override ?? baseHrMax;

  return (
    <HrMaxContext.Provider value={{
      baseHrMax, override, effective, setOverride: persistOverride,
    }}>
      {children}
    </HrMaxContext.Provider>
  );
}
export function useHrMax() { return useContext(HrMaxContext); }

// ---------- Data context: provides STRIDE_DATA to tree ----------
const DataContext = createContext(null);

// DataProvider recomputes run.type client-side whenever the effective HRmax
// changes — so the user moving the "HR max" knob in the header reshuffles
// Easy / Moderate / Hard labels live, without a re-sync. Inputs for inferType
// are attached to each run by buildStrideData (maxHr, isRace/Long/Recovery,
// sufferScore, note). `laps` isn't persisted; offline-mode runs classified
// via lap analysis get re-routed through the intensity-band layer instead —
// acceptable since real intervals usually clear that threshold anyway.
export function DataProvider({ data, children }) {
  const hr = useHrMax();
  const effective = hr?.effective ?? data?.hrMax ?? 190;

  const derived = useMemo(() => {
    if (!data || !data.runs?.length) return data;
    const runs = data.runs.map((r) => {
      const type = inferType({
        name: r.note || '',
        description: '',
        isRace: !!r.isRace,
        isLong: !!r.isLong,
        isRecovery: !!r.isRecovery,
        distKm: r.distance,
        durMin: r.duration,
        avgHr: r.hr,
        maxHr: r.maxHr,
        sufferScore: r.sufferScore,
        laps: null,
        hrMax: effective,
      });
      return type === r.type ? r : { ...r, type };
    });
    return { ...data, runs, hrMax: effective };
  }, [data, effective]);

  return <DataContext.Provider value={derived}>{children}</DataContext.Provider>;
}
export function useData() { return useContext(DataContext); }

// ---------- Tooltip ----------
const TooltipContext = createContext(null);

export function TooltipProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((content, x, y) => setT({ content, x, y }), []);
  const hide = useCallback(() => setT(null), []);
  return (
    <TooltipContext.Provider value={{ show, hide }}>
      {children}
      {t && (
        <div
          className="tooltip"
          style={{
            left: Math.min(t.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280),
            top: Math.min(t.y + 14, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 160),
          }}
        >
          {t.content}
        </div>
      )}
    </TooltipContext.Provider>
  );
}
export function useTooltip() { return useContext(TooltipContext); }

// ---------- Cross-panel hover linking ----------
// `focusRequest` is a transient signal: a panel writes a runId here to ask
// RunCards to scroll to + expand that card, then RunCards clears it back to
// null. Use it for "click a dot in AE/DPC → jump to run card" flows.
//
// `requestFocus(id)` wraps setFocusRequest with a two-tap gate on touch
// devices. First tap on a dot just marks it pending (and returns false) so
// the tooltip has time to be read; second tap on the same dot commits the
// jump (returns true). On non-touch (hover-capable) devices it commits
// immediately. Callers use the return value to decide whether to dismiss
// the tooltip.
const LinkContext = createContext(null);
export function LinkProvider({ children }) {
  const [hovered, setHovered] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [pendingFocusId, setPendingFocusId] = useState(null);
  // `userSelectedRunId` is the run the user explicitly opened (RunCards
  // expand). `latestRunId` is the most recent run in the filtered window,
  // set by Dashboard and used as the default ring target so compact view
  // (where RunCards isn't mounted) still shows "your latest run" pre-
  // highlighted across the chart panels.
  // Consumers read `selectedRunId` (derived) and don't need to know which
  // source it came from.
  const [userSelectedRunId, setUserSelectedRunId] = useState(null);
  const [latestRunId, setLatestRunId] = useState(null);
  const selectedRunId = userSelectedRunId ?? latestRunId;
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setIsTouch(window.matchMedia('(hover: none)').matches);
  }, []);

  const requestFocus = useCallback((id) => {
    if (!isTouch) {
      setFocusRequest(id);
      return true;
    }
    if (pendingFocusId === id) {
      setPendingFocusId(null);
      setFocusRequest(id);
      return true;
    }
    setPendingFocusId(id);
    return false;
  }, [isTouch, pendingFocusId]);

  return (
    <LinkContext.Provider value={{
      hovered, setHovered,
      focusRequest, setFocusRequest,
      selectedRunId,
      setUserSelectedRunId, setLatestRunId,
      isTouch, pendingFocusId, setPendingFocusId, requestFocus,
    }}>
      {children}
    </LinkContext.Provider>
  );
}
export function useLink() { return useContext(LinkContext); }

// ---------- Tweaks (style / timeRange / metric) ----------
const TweakContext = createContext(null);

const STORAGE_KEY = 'stride-atlas-tweaks-v1';
const UNITS_KEY = 'stride.units';

function readStored() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeStored(v) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
}

export function TweakProvider({ children }) {
  const [style, setStyle] = useState('editorial');
  const [timeRange, setTimeRange] = useState('all');
  const [metric, setMetric] = useState('pace');
  const [units, setUnits] = useState('km');
  // customRange: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } | null. Only used
  // when timeRange === 'custom'. Null = consumer falls back to [first, last]
  // activity dates from the data.
  const [customRange, setCustomRange] = useState(null);
  // 'compact' (default): single-screen 3x3 glance grid — the strongest
  // first impression of the dashboard's "dense, not noisy" thesis. 'full':
  // vertical scroll of nine panels for drill-down. Mobile viewports get
  // forced back to 'full' by the consumer (Dashboard); the preference still
  // sticks for when the user comes back on desktop.
  const [viewMode, setViewMode] = useState('compact');
  // Stored as a fraction of elapsed time (0.05 = 5%). A run counts as
  // "stopped" once its stoppedRatio reaches this. Drives both the bulk
  // "exclude stopped runs" action and the stopped-% rows in tooltips.
  const [stoppedThreshold, setStoppedThreshold] = useState(STOPPED_RATIO_WARN);
  const [open, setOpen] = useState(false);

  // Load from localStorage after mount to avoid SSR hydration mismatch
  useEffect(() => {
    const s = readStored();
    if (s) {
      if (s.style) setStyle(s.style);
      if (s.timeRange) setTimeRange(s.timeRange);
      if (s.metric) setMetric(s.metric);
      if (s.units === 'mi' || s.units === 'km') setUnits(s.units);
      if (s.customRange && typeof s.customRange === 'object' && s.customRange.from && s.customRange.to) {
        setCustomRange({ from: s.customRange.from, to: s.customRange.to });
      }
      if (s.viewMode === 'compact' || s.viewMode === 'full') setViewMode(s.viewMode);
      if (typeof s.stoppedThreshold === 'number'
        && s.stoppedThreshold >= STOPPED_RATIO_MIN && s.stoppedThreshold <= STOPPED_RATIO_MAX) {
        setStoppedThreshold(s.stoppedThreshold);
      }
    }
  }, []);

  useEffect(() => { applyTheme(style); }, [style]);

  const persist = useCallback((edits) => {
    const cur = readStored() || {};
    writeStored({ ...cur, ...edits });
  }, []);

  const setStyleP = (v) => { setStyle(v); persist({ style: v }); };
  const setRangeP = (v) => { setTimeRange(v); persist({ timeRange: v }); };
  const setMetricP = (v) => { setMetric(v); persist({ metric: v }); };
  const setUnitsP = (v) => {
    const u = v === 'mi' ? 'mi' : 'km';
    setUnits(u); persist({ units: u });
  };
  const setCustomRangeP = (v) => { setCustomRange(v); persist({ customRange: v }); };
  const setViewModeP = (v) => {
    const m = v === 'compact' ? 'compact' : 'full';
    setViewMode(m); persist({ viewMode: m });
  };
  const setStoppedThresholdP = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return;
    const c = Math.min(STOPPED_RATIO_MAX, Math.max(STOPPED_RATIO_MIN, n));
    setStoppedThreshold(c); persist({ stoppedThreshold: c });
  };

  return (
    <TweakContext.Provider value={{
      style, theme: style, timeRange, metric, units, customRange, viewMode, stoppedThreshold,
      open, setOpen,
      setStyle: setStyleP, setTheme: setStyleP,
      setTimeRange: setRangeP, setMetric: setMetricP, setUnits: setUnitsP,
      setCustomRange: setCustomRangeP,
      setViewMode: setViewModeP,
      setStoppedThreshold: setStoppedThresholdP,
    }}>
      {children}
    </TweakContext.Provider>
  );
}
export function useTweaks() { return useContext(TweakContext); }

// ---------- Filter runs by current time range ----------
export function useFilteredRuns() {
  const { timeRange, customRange } = useTweaks();
  const data = useData();
  const all = data.runs;
  return useMemo(() => {
    if (!all.length) return [];
    // Custom: caller-specified from/to. If customRange is null (no explicit
    // bounds yet), fall through to "all" semantics below.
    if (timeRange === 'custom' && customRange && customRange.from && customRange.to) {
      const from = customRange.from, to = customRange.to;
      return all.filter((r) => r.date >= from && r.date <= to);
    }
    // Anchor "now" at the most recent activity date (not wall clock) so
    // imported data always produces a populated window.
    const maxIso = all.reduce((a, r) => (r.date > a ? r.date : a), all[0].date);
    const end = new Date(maxIso + 'T00:00:00');
    const days = { '1m': 30, '3m': 92, '6m': 183, '1y': 365, 'all': 99999 }[timeRange] || 9999;
    const start = new Date(end.getTime() - days * 86400000);
    return all.filter((r) => new Date(r.date + 'T00:00:00') >= start);
  }, [all, timeRange, customRange]);
}

// ---------- Run exclusion (omit runs from computed stats) ----------
// A user-curated set of run IDs that should NOT influence any aggregate or
// trend stat — Personal Records, trend ribbons, the scatters, Same-Route
// Duel, week/season totals, the headline summary. Excluded runs still show
// in the Run Atlas and Run Cards: they stay in your log, they just stop
// poisoning your analytics (bad GPS, a treadmill blip, a race you walked).
// Toggled from RunCards (full view only); persisted per-browser. IDs are
// normalized to strings because the two ingest paths emit number vs string.
const ExclusionContext = createContext(null);
const EXCLUDED_KEY = 'stride.excludedRuns';

export function ExclusionProvider({ children }) {
  const [excluded, setExcluded] = useState(() => new Set());

  // Load after mount to avoid an SSR hydration mismatch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(EXCLUDED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr) && arr.length) setExcluded(new Set(arr.map(String)));
    } catch {}
  }, []);

  const persist = useCallback((set) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...set])); } catch {}
  }, []);

  const toggle = useCallback((id) => {
    const key = String(id);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      persist(next);
      return next;
    });
  }, [persist]);

  // Add several IDs at once (e.g. "exclude all stopped runs"). No-op — and no
  // re-render — when every id is already excluded.
  const addMany = useCallback((ids) => {
    setExcluded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        const k = String(id);
        if (!next.has(k)) { next.add(k); changed = true; }
      }
      if (!changed) return prev;
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setExcluded((prev) => {
      if (!prev.size) return prev;
      const next = new Set();
      persist(next);
      return next;
    });
  }, [persist]);

  const isExcluded = useCallback((id) => excluded.has(String(id)), [excluded]);

  const value = useMemo(
    () => ({ excluded, count: excluded.size, isExcluded, toggle, addMany, clear }),
    [excluded, isExcluded, toggle, addMany, clear],
  );

  return <ExclusionContext.Provider value={value}>{children}</ExclusionContext.Provider>;
}
export function useExclusions() { return useContext(ExclusionContext); }

// Time-filtered runs MINUS user-excluded runs. The source every analytical
// panel reads. Log views (Run Atlas, Run Cards) keep using useFilteredRuns()
// so excluded runs remain visible there.
export function useAnalysisRuns() {
  const filtered = useFilteredRuns();
  const { excluded } = useExclusions();
  return useMemo(() => {
    if (!excluded.size) return filtered;
    return filtered.filter((r) => !excluded.has(String(r.id)));
  }, [filtered, excluded]);
}
