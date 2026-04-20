'use client';

import { useState } from 'react';
import {
  DataProvider, TooltipProvider, LinkProvider, TweakProvider,
  HrMaxProvider, useHrMax,
  useTweaks, useFilteredRuns, useData, useTooltip,
  fmtDistance, distUnit,
} from '@/lib/shared';
import RunAtlas from './RunAtlas';
import PaceRibbon from './PaceRibbon';
import AerobicEfficiency from './AerobicEfficiency';
import DistancePaceCurve from './DistancePaceCurve';
import RunCards from './RunCards';
import PersonalRecords from './PersonalRecords';
import SameRouteDuel from './SameRouteDuel';
import WeekComparator from './WeekComparator';
import SeasonArc from './SeasonArc';
import TweakPanel from './TweakPanel';
import ConnectBanner from './ConnectBanner';

function Header() {
  const data = useData();
  const p = data.profile;
  const runs = useFilteredRuns();
  const { units } = useTweaks();
  const totalKm = runs.reduce((a, r) => a + r.distance, 0);

  return (
    <div className="header">
      <div>
        <div className="eyebrow">A Running Journal · v1</div>
        <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
        <div className="header-right">
          <b>{p.name}</b>{p.city ? ` · ${p.city}` : ''}<br />
          Goal · <b>{p.goalRace}</b><br />
          <span className="num">{fmtDistance(totalKm, units, 0)} {distUnit(units)}</span> logged in view
        </div>
        <UnitsCard />
        <HrMaxCard />
      </div>
    </div>
  );
}

function UnitsCard() {
  const { units, setUnits } = useTweaks();
  const opt = (id, label) => (
    <button
      key={id}
      onClick={() => setUnits(id)}
      className={`chip ${units === id ? 'active' : ''}`}
      style={{ padding: '3px 10px', fontSize: 11 }}
    >{label}</button>
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
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 9.5 }}>Units</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {opt('km', 'KM')}
        {opt('mi', 'MI')}
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
        minWidth: 170,
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

function RangeTabs() {
  const { timeRange, setTimeRange } = useTweaks();
  const opts = [
    { id: '1m', label: '1 Month' },
    { id: '3m', label: '3 Months' },
    { id: '6m', label: '6 Months' },
    { id: '1y', label: '1 Year' },
    { id: 'all', label: 'All Time' },
  ];
  return (
    <div className="chip-row">
      {opts.map((o) => (
        <button
          key={o.id}
          className={`chip ${timeRange === o.id ? 'active' : ''}`}
          onClick={() => setTimeRange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ data, mode = 'demo', athleteName = null }) {
  return (
    <HrMaxProvider baseHrMax={data?.hrMax ?? 190}>
    <DataProvider data={data}>
      <TweakProvider>
        <TooltipProvider>
          <LinkProvider>
            <div className="app">
              <ConnectBanner mode={mode} athleteName={athleteName} />
              <Header />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 24, flexWrap: 'wrap' }}>
                <div>
                  <div className="section-title" style={{ fontSize: 22, marginBottom: 2 }}>
                    Progress, <i>in one page.</i>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--inkSoft)' }}>
                    Hover any run — its twins light up across every chart below.
                  </div>
                </div>
                <RangeTabs />
              </div>

              <div className="section"><RunAtlas /></div>
              <div className="section"><PersonalRecords /></div>
              <div className="section"><PaceRibbon /></div>
              <div className="section"><AerobicEfficiency /></div>
              <div className="section"><DistancePaceCurve /></div>
              <div className="section"><RunCards /></div>
              <div className="section"><SameRouteDuel /></div>
              <div className="section"><WeekComparator /></div>
              <div className="section"><SeasonArc /></div>

              <div style={{
                marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--rule)',
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--inkMuted)',
                letterSpacing: '.08em', textTransform: 'uppercase',
              }}>
                <span>Stride Atlas</span>
                <span>Your data</span>
              </div>
            </div>

            <TweakPanel />
          </LinkProvider>
        </TooltipProvider>
      </TweakProvider>
    </DataProvider>
    </HrMaxProvider>
  );
}
