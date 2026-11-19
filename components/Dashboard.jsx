'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  DataProvider, TooltipProvider, LinkProvider, TweakProvider,
  HrMaxProvider, useHrMax, ExclusionProvider, useExclusions,
  useTweaks, useAnalysisRuns, useComparisonWindow, pickComparison,
  keepForDurability, keepForEfficiency, TREND_HR_BPM, TREND_PACE_SEC_KM, TREND_DIST_PCT, useData, useTooltip, useLink,
  fmtDistance, distUnit, kmToDisplay, paceUnit, hasValidHr, isInterrupted, MI_PER_KM, mean,
} from '@/lib/shared';
import TimeRangeControl from './TimeRangeControl';
import RunAtlas from './RunAtlas';
import PaceRibbon from './PaceRibbon';
import AerobicEfficiency from './AerobicEfficiency';
import DistancePaceCurve from './DistancePaceCurve';
import RunCards from './RunCards';
import PersonalRecords from './PersonalRecords';
import FitnessDuel from './FitnessDuel';
import WeekComparator from './WeekComparator';
import SeasonArc from './SeasonArc';
import TweakPanel, { COMPACT_MIN_WIDTH } from './TweakPanel';
import ConnectBanner from './ConnectBanner';
import TouchDismissHandler from './TouchDismissHandler';
import Showdown from './Showdown';
import { REPO_URL } from '@/lib/site';
import PanelErrorBoundary from './PanelErrorBoundary';
import CompactGrid from './CompactGrid';
import CollapsibleSection, { sectionId } from './CollapsibleSection';
import { CompactExpandContext } from './CompactTile';
import RunAtlasCompact from './compact/RunAtlasCompact';
import PersonalRecordsCompact from './compact/PersonalRecordsCompact';
import PaceRibbonCompact from './compact/PaceRibbonCompact';
import AerobicEfficiencyCompact from './compact/AerobicEfficiencyCompact';
import DistancePaceCurveCompact from './compact/DistancePaceCurveCompact';
import WindowStatsCompact from './compact/WindowStatsCompact';
import FitnessDuelCompact from './compact/FitnessDuelCompact';
import WeekComparatorCompact from './compact/WeekComparatorCompact';
import SeasonArcCompact from './compact/SeasonArcCompact';

function Header() {
  const data = useData();
  const p = data.profile;
  const runs = useAnalysisRuns();
  const { units, stoppedThreshold } = useTweaks();
  const { count: excludedCount, clear: clearExclusions, isExcluded, addMany } = useExclusions();
  const totalKm = runs.reduce((a, r) => a + r.distance, 0);
  const stoppedPct = Math.round(stoppedThreshold * 100);

  // Stopped runs (paused for >= the tunable threshold of elapsed time) that
  // aren't already excluded — candidates for the one-shot bulk action.
  const stoppedToExclude = useMemo(
    () => (data.runs || []).filter((r) => isInterrupted(r, stoppedThreshold) && !isExcluded(r.id)),
    [data.runs, isExcluded, stoppedThreshold],
  );

  const linkBtn = {
    font: 'inherit', color: 'var(--accent)', background: 'none',
    border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
  };

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
          {stoppedToExclude.length > 0 && (
            <>
              <br />
              <button
                onClick={() => addMany(stoppedToExclude.map((r) => r.id))}
                title={`Exclude every run that spent ${stoppedPct}% or more of its elapsed time stopped (red lights, pauses) from your stats. Adjust the threshold in View.`}
                style={linkBtn}
              >
                Exclude {stoppedToExclude.length} stopped {stoppedToExclude.length === 1 ? 'run' : 'runs'} (≥{stoppedPct}%)
              </button>
            </>
          )}
          {excludedCount > 0 && (
            <>
              <br />
              <span style={{ color: 'var(--inkMuted)' }}>
                {excludedCount} {excludedCount === 1 ? 'run' : 'runs'} excluded from stats ·{' '}
                <button onClick={clearExclusions} style={linkBtn}>clear</button>
              </span>
            </>
          )}
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

// Bold non-italic sans for the metric phrase, matching the existing
// convention in body explainers (the italic-serif container would
// otherwise render the bold as italic-bold-serif which reads as
// decoration rather than data).
function Strong({ children }) {
  return (
    <b style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>{children}</b>
  );
}

// Pure-numeric signals shared by the summary sentence and the training-
// pattern classifier. Uses the exact comparison the Aerobic Efficiency and
// Aerobic Durability tiles use (selected window vs the one before it, same
// filters, same thresholds) so the sentence never contradicts them.
// Returns null when neither comparison has enough runs.
function computeStrideSignals(current, prior) {
  const dist = pickComparison(current.filter(keepForDurability), prior.filter(keepForDurability));
  const hr = pickComparison(current.filter(keepForEfficiency), prior.filter(keepForEfficiency));
  if (!dist.enough && !hr.enough) return null;

  let paceSecKm = 0, distDeltaKm = 0, distPct = 0;
  if (dist.enough) {
    const earlyDist = mean(dist.earlier.map((r) => r.distance));
    const lateDist = mean(dist.recent.map((r) => r.distance));
    // + = faster
    paceSecKm = (mean(dist.earlier.map((r) => r.pace)) - mean(dist.recent.map((r) => r.pace))) * 60;
    distDeltaKm = lateDist - earlyDist;
    distPct = earlyDist > 0 ? Math.abs(distDeltaKm / earlyDist) : 0;
  }
  const hrPresent = hr.enough;
  // + = lower HR now
  const hrDelta = hrPresent
    ? mean(hr.earlier.map((r) => r.hr)) - mean(hr.recent.map((r) => r.hr))
    : 0;

  return {
    paceSecKm, distDeltaKm, hrDelta, hrPresent,
    // Which sets were compared, for the lead clause. When the two sets
    // disagree (one fell back to halves) the lead stays generic.
    mode: !hrPresent || !dist.enough || hr.mode === dist.mode ? (dist.enough ? dist.mode : hr.mode) : 'mixed',
    paceMeaningful: dist.enough && Math.abs(paceSecKm) >= TREND_PACE_SEC_KM,
    hrMeaningful: hrPresent && Math.abs(hrDelta) > TREND_HR_BPM,
    distMeaningful: dist.enough && distPct >= TREND_DIST_PCT,
  };
}

function comparisonLead(s, rangeName) {
  if (s.mode === 'prior' && rangeName) return `Compared to the previous ${rangeName}, `;
  if (s.mode === 'halves') return 'Compared to the first half of this window, ';
  return 'Compared to your earlier runs, ';
}

// One-sentence top-line summary: pace trend + HR efficiency + distance
// growth, drawing on the same early/recent split logic the scatter
// panels use. Returns JSX so the deltas can carry bold formatting.
function buildStrideSummary(s, units, lead) {
  if (!s) return null;

  const segments = [];

  // Each segment is phrased so it slots after "Compared to your earlier
  // runs, " — the lead clause sets the reference frame so each segment
  // doesn't have to re-explain "than what."
  if (s.paceMeaningful) {
    const better = s.paceSecKm > 0;
    const paceSec = s.paceSecKm * (units === 'mi' ? 1 / MI_PER_KM : 1);
    segments.push(
      <span key="pace">you&rsquo;re now <Strong>{Math.abs(paceSec).toFixed(0)}s{paceUnit(units)} {better ? 'faster' : 'slower'}</Strong></span>
    );
  }
  if (s.hrMeaningful) {
    const better = s.hrDelta > 0;
    segments.push(
      <span key="hr">your heart rate is <Strong>{Math.abs(s.hrDelta).toFixed(1)} bpm {better ? 'lower' : 'higher'}</Strong></span>
    );
  }
  if (s.distMeaningful) {
    const better = s.distDeltaKm > 0;
    segments.push(
      <span key="dist">your typical run is <Strong>{Math.abs(kmToDisplay(s.distDeltaKm, units)).toFixed(1)} {distUnit(units)} {better ? 'longer' : 'shorter'}</Strong></span>
    );
  }

  if (segments.length === 0) return null;

  // Join segments as natural prose: "A and B" for two, "A, B, and C"
  // for three or more, comma-separated otherwise.
  const joined = segments.map((seg, i) => {
    const isFirst = i === 0;
    const isLast = i === segments.length - 1;
    let sep = '';
    if (!isFirst) {
      if (segments.length === 2) sep = ' and ';
      else if (isLast) sep = ', and ';
      else sep = ', ';
    }
    return <Fragment key={`s-${i}`}>{sep}{seg}</Fragment>;
  });

  return (
    <>{lead}{joined}.</>
  );
}

// Map signed signals to a tri-state per metric, then pattern-match
// against a small set of training-block archetypes. Returns null when
// no archetype is a clean match — better to stay silent than to label
// a mixed window incorrectly.
function classifyTraining(s) {
  if (!s) return null;
  const pace = s.paceMeaningful ? (s.paceSecKm > 0 ? 'faster' : 'slower') : 'flat';
  const hr = !s.hrPresent ? 'missing' : s.hrMeaningful ? (s.hrDelta > 0 ? 'lower' : 'higher') : 'flat';
  const dist = s.distMeaningful ? (s.distDeltaKm > 0 ? 'longer' : 'shorter') : 'flat';

  // Priority order: HR-rich archetypes first (more informative), then
  // HR-optional fallbacks. First match wins.
  if (hr === 'lower' && pace === 'slower' && (dist === 'longer' || dist === 'flat')) {
    return { name: 'aerobic base building', gloss: 'easier and longer at lower effort' };
  }
  if (hr === 'lower' && pace === 'faster') {
    return { name: 'fitness gains', gloss: 'faster at lower effort, pure fitness' };
  }
  // Pace and distance both up, no HR signal to confirm fitness. Still
  // unambiguous progress on both axes — worth labelling.
  if (pace === 'faster' && dist === 'longer' && (hr === 'flat' || hr === 'missing')) {
    return { name: 'all-around progress', gloss: 'faster pace and longer runs' };
  }
  if (hr === 'higher' && pace === 'faster') {
    return { name: 'speed focus', gloss: 'pushing pace at higher effort' };
  }
  if (hr === 'higher' && (pace === 'slower' || pace === 'flat')) {
    return { name: 'showing strain', gloss: 'working harder for the same or slower pace, fatigue, heat, or under-recovered' };
  }
  if (hr === 'lower' && dist === 'shorter') {
    return { name: 'easing back', gloss: 'lighter volume at lower effort, taper or recovery' };
  }
  if (dist === 'longer' && (pace === 'slower' || pace === 'flat') && (hr === 'flat' || hr === 'missing')) {
    return { name: 'building distance', gloss: 'stretching distance at familiar effort' };
  }
  if (pace === 'faster' && (dist === 'flat' || dist === 'shorter') && (hr === 'flat' || hr === 'missing')) {
    return { name: 'picking up pace', gloss: 'faster at familiar volume' };
  }
  return null;
}

// Two summary lines (14.5px × 1.5 + 6px gap) plus one pattern line
// (13px × 1.5 + 6px gap).
const SUMMARY_SLOT_MIN_HEIGHT = 76;

// Body content is split out so it can read `viewMode` from TweakContext.
// That context isn't available at the root Dashboard level because the
// provider wraps this body.
function DashboardBody({ effectiveMode, athleteName, athleteId, runCount }) {
  const { viewMode, setViewMode, units } = useTweaks();
  const { hide: hideTooltip } = useTooltip();
  const filteredRuns = useAnalysisRuns();
  const { prior: priorRuns, rangeName } = useComparisonWindow();
  const { setLatestRunId } = useLink();
  const signals = computeStrideSignals(filteredRuns, priorRuns);
  const lead = signals ? comparisonLead(signals, rangeName) : '';
  const summary = buildStrideSummary(signals, units, lead);
  const pattern = classifyTraining(signals);
  const [canCompact, setCanCompact] = useState(true);

  // Default ring target for cross-panel highlighting: the most recent
  // run in the filtered window. RunCards (when mounted in full view)
  // overrides this with the user's expanded card; in compact view, this
  // is the only writer so the latest run is always pre-highlighted.
  const latestRunId = useMemo(() => {
    if (!filteredRuns.length) return null;
    let best = filteredRuns[0];
    for (const r of filteredRuns) if (r.date.localeCompare(best.date) > 0) best = r;
    return best.id;
  }, [filteredRuns]);
  useEffect(() => {
    setLatestRunId(latestRunId);
  }, [latestRunId, setLatestRunId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${COMPACT_MIN_WIDTH}px)`);
    const update = () => setCanCompact(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const isCompact = viewMode === 'compact' && canCompact;

  // Compact tile → full view. Remember which section was asked for, switch
  // modes, then scroll once the full view has rendered.
  const [expandTarget, setExpandTarget] = useState(null);
  const openInFull = (target) => {
    hideTooltip?.();
    setExpandTarget(target);
    setViewMode('full');
  };
  useEffect(() => {
    if (isCompact || !expandTarget) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById(sectionId(expandTarget))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setExpandTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [isCompact, expandTarget]);
  const sec = (name) => ({ name, reveal: expandTarget === name });
  const tile = (target, name, el) => (
    <CompactExpandContext.Provider value={{ target, onExpand: openInFull }}>
      <PanelErrorBoundary name={name}>{el}</PanelErrorBoundary>
    </CompactExpandContext.Provider>
  );

  return (
    <div className="app">
      <ConnectBanner mode={effectiveMode} athleteName={athleteName} athleteId={athleteId} runCount={runCount} />
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title" style={{ fontSize: 22, marginBottom: 2 }}>
            Progress, <i>in one page.</i>
          </div>
          {/* Fixed-height slot for the summary + pattern lines so the grid
              below doesn't jump when a range has no trend to report. Sized
              for a two-line summary plus a one-line pattern. */}
          <div style={{ minHeight: SUMMARY_SLOT_MIN_HEIGHT }}>
            <div style={{
              fontSize: 14.5, fontFamily: 'var(--serif)', fontStyle: 'italic',
              color: summary ? 'var(--ink)' : 'var(--inkSoft)', maxWidth: 720, lineHeight: 1.5, marginBottom: 6,
            }}>
              {summary ?? (signals
                ? <>{lead}{signals.hrPresent ? 'pace, heart rate, and distance are' : 'pace and distance are'} holding steady.</>
                : <>Not enough runs in this window to read a trend yet. Try a longer range.</>)}
            </div>
            {signals && (
              <div style={{
                fontSize: 13, fontFamily: 'var(--serif)', fontStyle: 'italic',
                color: 'var(--inkSoft)', maxWidth: 720, lineHeight: 1.5, marginBottom: 6,
              }}>
                {pattern
                  ? <>Looks like <Strong>{pattern.name}</Strong>: {pattern.gloss}.</>
                  : <>No single training pattern stands out in this window.</>}
              </div>
            )}
          </div>
          {isCompact && (
            <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 620, lineHeight: 1.5 }}>
              Every panel at a glance. Click any tile, or switch to <b>Full</b>, to drill in.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <TimeRangeControl />
          {canCompact && (
            <div className="seg" role="group" aria-label="Layout">
              <button
                className={viewMode === 'compact' ? 'on' : ''}
                onClick={() => setViewMode('compact')}
                aria-pressed={viewMode === 'compact'}
                style={{ padding: '6px 12px' }}
              >Compact</button>
              <button
                className={viewMode === 'full' ? 'on' : ''}
                onClick={() => setViewMode('full')}
                aria-pressed={viewMode === 'full'}
                style={{ padding: '6px 12px' }}
              >Full</button>
            </div>
          )}
        </div>
      </div>

      {isCompact ? (
        <CompactGrid>
          {tile('Run Atlas', 'Run Atlas', <RunAtlasCompact />)}
          {tile('Run Cards', 'In View', <WindowStatsCompact />)}
          {tile('Personal Records', 'Personal Records', <PersonalRecordsCompact />)}
          {tile('Trend Ribbons', 'Trend Ribbons', <PaceRibbonCompact />)}
          {tile('Aerobic Efficiency', 'Aerobic Efficiency', <AerobicEfficiencyCompact />)}
          {tile('Aerobic Durability', 'Distance × Pace', <DistancePaceCurveCompact />)}
          {tile('Fitness Duel', 'Fitness Duel', <FitnessDuelCompact />)}
          {tile('Week Comparator', 'Week Comparator', <WeekComparatorCompact />)}
          {tile('Season Arc', 'Season Arc', <SeasonArcCompact />)}
        </CompactGrid>
      ) : (
        <>
          <CollapsibleSection {...sec('Run Atlas')}><PanelErrorBoundary name="Run Atlas"><RunAtlas /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Run Cards')}><PanelErrorBoundary name="Run Cards"><RunCards /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Personal Records')}><PanelErrorBoundary name="Personal Records"><PersonalRecords /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Trend Ribbons')}><PanelErrorBoundary name="Trend Ribbons"><PaceRibbon /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Aerobic Efficiency')}><PanelErrorBoundary name="Aerobic Efficiency"><AerobicEfficiency /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Aerobic Durability')}><PanelErrorBoundary name="Aerobic Durability"><DistancePaceCurve /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Fitness Duel')}><PanelErrorBoundary name="Fitness Duel"><FitnessDuel /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Week Comparator')}><PanelErrorBoundary name="Week Comparator"><WeekComparator /></PanelErrorBoundary></CollapsibleSection>
          <CollapsibleSection {...sec('Season Arc')}><PanelErrorBoundary name="Season Arc"><SeasonArc /></PanelErrorBoundary></CollapsibleSection>
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
          {['support', 'privacy', 'terms'].map((p) => (
            <a key={p} href={`/${p}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p}</a>
          ))}
          <a href={REPO_URL} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>github</a>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ data, mode = 'demo', athleteName = null, athleteId = null }) {
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
        <ExclusionProvider>
          <TooltipProvider>
            <LinkProvider>
              <TouchDismissHandler />
              <DashboardBody
                effectiveMode={effectiveMode}
                athleteName={athleteName}
                athleteId={athleteId}
                runCount={runCount}
              />
              <TweakPanel />
              <PanelErrorBoundary name="Showdown"><Showdown /></PanelErrorBoundary>
            </LinkProvider>
          </TooltipProvider>
        </ExclusionProvider>
      </TweakProvider>
    </DataProvider>
    </HrMaxProvider>
  );
}
