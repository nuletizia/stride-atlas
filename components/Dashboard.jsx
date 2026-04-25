'use client';

import { Fragment, useEffect, useState } from 'react';
import {
  DataProvider, TooltipProvider, LinkProvider, TweakProvider,
  HrMaxProvider, useHrMax,
  useTweaks, useFilteredRuns, useData, useTooltip,
  fmtDistance, distUnit, kmToDisplay, paceUnit, hasValidHr, MI_PER_KM,
} from '@/lib/shared';
import TimeRangeControl from './TimeRangeControl';
import RunAtlas from './RunAtlas';
import PaceRibbon from './PaceRibbon';
import AerobicEfficiency from './AerobicEfficiency';
import DistancePaceCurve from './DistancePaceCurve';
import RunCards from './RunCards';
import PersonalRecords from './PersonalRecords';
import SameRouteDuel from './SameRouteDuel';
import WeekComparator from './WeekComparator';
import SeasonArc from './SeasonArc';
import TweakPanel, { COMPACT_MIN_WIDTH } from './TweakPanel';
import ConnectBanner from './ConnectBanner';
import TouchDismissHandler from './TouchDismissHandler';
import PanelErrorBoundary from './PanelErrorBoundary';
import CompactGrid from './CompactGrid';
import RunAtlasCompact from './compact/RunAtlasCompact';
import PersonalRecordsCompact from './compact/PersonalRecordsCompact';
import PaceRibbonCompact from './compact/PaceRibbonCompact';
import AerobicEfficiencyCompact from './compact/AerobicEfficiencyCompact';
import DistancePaceCurveCompact from './compact/DistancePaceCurveCompact';
import WindowStatsCompact from './compact/WindowStatsCompact';
import SameRouteDuelCompact from './compact/SameRouteDuelCompact';
import WeekComparatorCompact from './compact/WeekComparatorCompact';
import SeasonArcCompact from './compact/SeasonArcCompact';

function Header() {
  const data = useData();
  const p = data.profile;
  const runs = useFilteredRuns();
  const { units } = useTweaks();
  const totalKm = runs.reduce((a, r) => a + r.distance, 0);

  return (
    <div className="header">
      <div>
        <div className="eyebrow">Your running progress · v1</div>
        <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="header-right">
          <b>{p.name}</b>{p.city ? ` · ${p.city}` : ''}<br />
          Goal · <b>{p.goalRace}</b><br />
          <span className="num">{fmtDistance(totalKm, units, 0)} {distUnit(units)}</span> logged in view
        </div>
        <HrMaxCard />
      </div>
    </div>
  );
}

function HrMaxCard() {
  const data = useData();
  const { show, hide } = useTooltip();
  const { override, effective, setOverride } = useHrMax();
  const observed = data.hrMaxObserved || null;
  const zonePct = data.zonePct || [0.50, 0.60, 0.70, 0.80, 0.90, 1.10];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const n = Number(draft);
    if (isFinite(n) && n >= 140 && n <= 230) setOverride(n);
    setEditing(false);
  };
  const reset = () => {
    setOverride(null);
    setEditing(false);
  };

  // Z5's upper bound is HR max itself — the 1.10 value in ZONE_PCT is an
  // internal classification cap (so brief HR spikes above estimated max still
  // count as Z5) and isn't meaningful to display.
  const zones = [
    { label: 'Z1 Recovery',  lo: Math.round(effective * zonePct[0]), hi: Math.round(effective * zonePct[1]) - 1, color: 'var(--type-recovery)' },
    { label: 'Z2 Easy',      lo: Math.round(effective * zonePct[1]), hi: Math.round(effective * zonePct[2]) - 1, color: 'var(--type-easy)' },
    { label: 'Z3 Moderate',  lo: Math.round(effective * zonePct[2]), hi: Math.round(effective * zonePct[3]) - 1, color: 'var(--type-tempo)' },
    { label: 'Z4 Threshold', lo: Math.round(effective * zonePct[3]), hi: Math.round(effective * zonePct[4]) - 1, color: 'var(--type-long)' },
    { label: 'Z5 Hard',      lo: Math.round(effective * zonePct[4]), hi: effective, color: 'var(--type-intervals)' },
  ];

  const tooltip = (
    <>
      <span className="t-title">HR zones at {effective} bpm</span>
      <div style={{ fontSize: 11.5, color: 'var(--inkSoft)', marginTop: 6, maxWidth: 280 }}>
        {zones.map((z) => (
          <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{z.label}</span>
            <span className="mono" style={{ color: 'var(--ink)' }}>{z.lo}–{z.hi}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 10.5, fontStyle: 'italic', color: 'var(--inkMuted)', lineHeight: 1.4 }}>
          Bands are 50/60/70/80/90% of HR max. Changing HR max reshuffles Easy / Moderate / Hard labels live across every panel.
        </div>
      </div>
    </>
  );

  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--inkMuted)',
        border: '1px solid var(--rule)',
        borderRadius: 4,
        padding: '8px 12px',
        background: 'var(--bg)',
        lineHeight: 1.5,
        cursor: 'help',
      }}
      onMouseEnter={(e) => !editing && show(tooltip, e.clientX, e.clientY)}
      onMouseMove={(e) => !editing && show(tooltip, e.clientX, e.clientY)}
      onMouseLeave={hide}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 9.5 }}>HR max</span>
        {override != null && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', fontStyle: 'italic' }}>override</span>
        )}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
          <input
            type="number"
            min={140}
            max={230}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            style={{
              width: 60, padding: '2px 6px', fontFamily: 'var(--mono)',
              fontSize: 15, fontWeight: 500, color: 'var(--ink)',
              border: '1px solid var(--rule)', borderRadius: 2, background: 'var(--bg)',
            }}
          />
          <button className="chip" onClick={commit} style={{ padding: '2px 6px' }}>✓</button>
          <button className="chip" onClick={() => setEditing(false)} style={{ padding: '2px 6px' }}>×</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
          <span className="num" style={{ fontSize: 19, color: 'var(--ink)', fontWeight: 500 }}>{effective}</span>
          <span style={{ fontSize: 10 }}>bpm</span>
          <span style={{ flex: 1 }} />
          <button
            className="chip"
            onClick={(e) => { e.stopPropagation(); setDraft(String(effective)); setEditing(true); hide(); }}
            style={{ padding: '1px 6px', fontSize: 10 }}
            title="Override HR max"
          >✎</button>
          {override != null && (
            <button
              className="chip"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{ padding: '1px 6px', fontSize: 10 }}
              title="Reset to estimated"
            >↺</button>
          )}
        </div>
      )}
      <div style={{ fontSize: 9.5, color: 'var(--inkMuted)', marginTop: 2 }}>
        {observed ? <>peak recorded · <b style={{ color: 'var(--ink)' }}>{observed}</b></> : <i>no HR data yet</i>}
      </div>
    </div>
  );
}

// Colored delta chip for the top-line summary. `ok` reflects whether the
// shift is an improvement (green) or a regression (soft ink) — the
// caller decides which direction maps to "ok" per metric.
function DeltaChip({ ok, children }) {
  return (
    <span style={{
      color: ok ? 'var(--positive)' : 'var(--inkSoft)',
      fontWeight: 600,
      fontStyle: 'normal',
      fontFamily: 'var(--mono)',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// One-sentence top-line summary: consistency + pace trend + HR efficiency
// + distance growth, drawing on the same early/recent split logic the
// scatter panels use. Returns null when nothing is meaningful enough.
// Returns JSX so the deltas can carry color + arrows (matching the cards
// inside the scatter panels).
function buildStrideSummary(runs, units) {
  if (runs.length < 4) return null;

  const sorted = [...runs].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(sorted[0].date + 'T00:00:00').getTime();
  const last = new Date(sorted[sorted.length - 1].date + 'T00:00:00').getTime();
  const spanDays = Math.max(1, Math.round((last - first) / 86_400_000) + 1);
  const totalWeeks = Math.max(1, Math.ceil(spanDays / 7));
  // Below 3 weeks the signal is too noisy to make a meaningful headline.
  if (totalWeeks < 3) return null;

  const weekKey = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const activeWeeks = new Set(runs.map((r) => weekKey(r.date))).size;

  // Split-by-count for trend signals — same convention the scatter panels
  // use, so the summary agrees with the per-panel arrows.
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);
  const medianOf = (arr) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const segments = [];

  // Pace: lower min/km value = faster = improvement.
  const earlyPace = medianOf(early.map((r) => r.pace));
  const latePace = medianOf(late.map((r) => r.pace));
  if (earlyPace != null && latePace != null) {
    const sec = (earlyPace - latePace) * 60 * (units === 'mi' ? 1 / MI_PER_KM : 1);
    if (Math.abs(sec) >= 3) {
      const ok = sec > 0;
      segments.push(
        <span key="pace">pace <DeltaChip ok={ok}>{ok ? '↓' : '↑'} {Math.abs(sec).toFixed(0)}s{paceUnit(units)} {ok ? 'faster' : 'slower'}</DeltaChip></span>
      );
    }
  }

  // HR (mean): lower bpm = improvement (read in conjunction with pace).
  const earlyHr = early.filter(hasValidHr).map((r) => r.hr);
  const lateHr = late.filter(hasValidHr).map((r) => r.hr);
  if (earlyHr.length >= 3 && lateHr.length >= 3) {
    const earlyAvg = earlyHr.reduce((a, b) => a + b, 0) / earlyHr.length;
    const lateAvg = lateHr.reduce((a, b) => a + b, 0) / lateHr.length;
    const hrDelta = earlyAvg - lateAvg;  // positive = HR fell
    if (Math.abs(hrDelta) >= 1.5) {
      const ok = hrDelta > 0;
      segments.push(
        <span key="hr">HR <DeltaChip ok={ok}>{ok ? '↓' : '↑'} {Math.abs(hrDelta).toFixed(0)} bpm {ok ? 'lower' : 'higher'}</DeltaChip></span>
      );
    }
  }

  // Distance (median run length): longer = improvement.
  const earlyDist = medianOf(early.map((r) => r.distance));
  const lateDist = medianOf(late.map((r) => r.distance));
  if (earlyDist != null && lateDist != null) {
    const delta = kmToDisplay(lateDist - earlyDist, units);
    if (Math.abs(delta) >= 0.5) {
      const ok = delta > 0;
      segments.push(
        <span key="dist">median run <DeltaChip ok={ok}>{ok ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} {distUnit(units)} {ok ? 'longer' : 'shorter'}</DeltaChip></span>
      );
    }
  }

  return (
    <>
      Active in <b style={{ fontStyle: 'normal' }}>{activeWeeks}</b> of {totalWeeks} weeks
      {segments.length > 0 ? ': ' : ''}
      {segments.map((s, i) => (
        <Fragment key={`s-${i}`}>
          {i > 0 && ', '}
          {s}
        </Fragment>
      ))}
      {'.'}
    </>
  );
}

// Body content is split out so it can read `viewMode` from TweakContext.
// That context isn't available at the root Dashboard level because the
// provider wraps this body.
function DashboardBody({ effectiveMode, athleteName, runCount }) {
  const { viewMode, units } = useTweaks();
  const filteredRuns = useFilteredRuns();
  const summary = buildStrideSummary(filteredRuns, units);
  const [canCompact, setCanCompact] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${COMPACT_MIN_WIDTH}px)`);
    const update = () => setCanCompact(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const isCompact = viewMode === 'compact' && canCompact;

  return (
    <div className="app">
      <ConnectBanner mode={effectiveMode} athleteName={athleteName} runCount={runCount} />
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ fontSize: 22, marginBottom: 2 }}>
            Progress, <i>in one page.</i>
          </div>
          {summary && (
            <div style={{
              fontSize: 14.5, fontFamily: 'var(--serif)', fontStyle: 'italic',
              color: 'var(--ink)', maxWidth: 720, lineHeight: 1.5, marginBottom: 6,
            }}>
              {summary}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 620, lineHeight: 1.5 }}>
            {isCompact ? (
              <>Every panel at a glance. Switch to <b>Full</b> in View to drill in.</>
            ) : (
              <>Each panel below shows one slice of your training. Click any
              dot, bar, or calendar cell to open that run&rsquo;s card.</>
            )}
          </div>
        </div>
        <TimeRangeControl />
      </div>

      {isCompact ? (
        <CompactGrid>
          <PanelErrorBoundary name="Run Atlas"><RunAtlasCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="In View"><WindowStatsCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Personal Records"><PersonalRecordsCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Trend Ribbons"><PaceRibbonCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Aerobic Efficiency"><AerobicEfficiencyCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Distance × Pace"><DistancePaceCurveCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Same-Route Duel"><SameRouteDuelCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Week Comparator"><WeekComparatorCompact /></PanelErrorBoundary>
          <PanelErrorBoundary name="Season Arc"><SeasonArcCompact /></PanelErrorBoundary>
        </CompactGrid>
      ) : (
        <>
          <div className="section"><PanelErrorBoundary name="Run Atlas"><RunAtlas /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Run Cards"><RunCards /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Personal Records"><PersonalRecords /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Trend Ribbons"><PaceRibbon /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Aerobic Efficiency"><AerobicEfficiency /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Aerobic Durability"><DistancePaceCurve /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Same-Route Duel"><SameRouteDuel /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Week Comparator"><WeekComparator /></PanelErrorBoundary></div>
          <div className="section"><PanelErrorBoundary name="Season Arc"><SeasonArc /></PanelErrorBoundary></div>
        </>
      )}

      <div style={{
        marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--rule)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--inkMuted)',
        letterSpacing: '.08em', textTransform: 'uppercase',
        gap: 16, flexWrap: 'wrap',
      }}>
        <span>Stride Atlas</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img
            src="/strava-logos/powered-by-strava-horiz-orange.svg"
            alt="Powered by Strava"
            style={{ height: 18, width: 'auto' }}
          />
          <a
            href="/privacy"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >Privacy</a>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ data, mode = 'demo', athleteName = null }) {
  // In user mode, if they have <THIN_THRESHOLD runs, swap the "signed in"
  // banner for an honest "your history is thin" message. Demo mode stays
  // as-is because the bundled dataset is curated to be rich.
  const THIN_THRESHOLD = 10;
  const runCount = data?.runs?.length ?? 0;
  const effectiveMode = mode === 'user' && runCount < THIN_THRESHOLD ? 'thin' : mode;
  return (
    <HrMaxProvider baseHrMax={data?.hrMax ?? 190}>
    <DataProvider data={data}>
      <TweakProvider>
        <TooltipProvider>
          <LinkProvider>
            <TouchDismissHandler />
            <DashboardBody
              effectiveMode={effectiveMode}
              athleteName={athleteName}
              runCount={runCount}
            />
            <TweakPanel />
          </LinkProvider>
        </TooltipProvider>
      </TweakProvider>
    </DataProvider>
    </HrMaxProvider>
  );
}
