'use client';

import {
  DataProvider, TooltipProvider, LinkProvider, TweakProvider,
  useTweaks, useFilteredRuns, useData,
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
  const totalKm = runs.reduce((a, r) => a + r.distance, 0);

  return (
    <div className="header">
      <div>
        <div className="eyebrow">A Running Journal · v1</div>
        <div className="wordmark"><b>Stride</b><i>Atlas</i></div>
      </div>
      <div className="header-right">
        <b>{p.name}</b>{p.city ? ` · ${p.city}` : ''}<br />
        Goal · <b>{p.goalRace}</b><br />
        <span className="num">{totalKm.toFixed(0)} km</span> logged in view
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
  );
}
