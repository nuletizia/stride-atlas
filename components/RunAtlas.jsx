'use client';

import { useMemo } from 'react';
import {
  useData, useLink, useTooltip, useTweaks, useFilteredRuns,
  fmtDate, fmtPace, fmtDuration, fmtHr,
  fmtDistance, fmtPaceUnit, distUnit, paceUnit,
  Highlight, HlNum,
} from '@/lib/shared';

export default function RunAtlas() {
  const data = useData();
  const { hovered, setHovered, setFocusRequest } = useLink();
  const { show, hide } = useTooltip();
  const { timeRange, units } = useTweaks();
  const runs = useFilteredRuns();

  const { weeks } = useMemo(() => {
    if (!runs.length) return { weeks: [] };
    const dates = runs.map((r) => r.date).sort();
    const s = new Date(dates[0] + 'T00:00:00');
    const e = new Date(dates[dates.length - 1] + 'T00:00:00');
    const sMon = new Date(s);
    sMon.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    const eSun = new Date(e);
    eSun.setDate(e.getDate() + ((7 - ((e.getDay() + 6) % 7)) % 7));

    const idx = {};
    runs.forEach((r) => { idx[r.date] = r; });

    const weeks = [];
    const cur = new Date(sMon);
    while (cur <= eSun) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cur);
        d.setDate(cur.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        days.push({ iso, run: idx[iso], date: d });
      }
      weeks.push({ start: new Date(cur), days });
      cur.setDate(cur.getDate() + 7);
    }
    return { weeks };
  }, [runs]);

  const CELL = timeRange === '1y' || timeRange === 'all' ? 14 : 22;
  const GAP = timeRange === '1y' || timeRange === 'all' ? 2 : 3;
  const LEFT_GUTTER = 44;
  const TOP_GUTTER = 26;
  const gridW = weeks.length * (CELL + GAP) + LEFT_GUTTER + 10;
  const gridH = 7 * (CELL + GAP) + TOP_GUTTER + 26;

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const m = w.start.getMonth();
      if (m !== lastMonth) {
        labels.push({ i, label: w.start.toLocaleDateString('en-US', { month: 'short' }) });
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks]);

  const matchSet = useMemo(() => {
    if (!hovered?.runId) return null;
    const r = runs.find((x) => x.id === hovered.runId);
    if (!r) return null;
    const s = new Set();
    runs.forEach((other) => {
      if (other.routeId === r.routeId || other.type === r.type) s.add(other.id);
    });
    return s;
  }, [hovered, runs]);

  const maxDist = useMemo(
    () => Math.max(...runs.map((r) => r.distance), 1),
    [runs]
  );

  function sizeFor(r) {
    const minS = 5, maxS = CELL - 2;
    const t = Math.sqrt(r.distance / maxDist);
    return minS + t * (maxS - minS);
  }

  const typeMeta = data.typeMeta;

  const onEnter = (r, e) => {
    setHovered({ runId: r.id, routeId: r.routeId, type: r.type, date: r.date });
    const meta = typeMeta[r.type];
    show(
      <>
        <span className="t-title">{fmtDate(r.date, { year: true })}</span>
        <div style={{ opacity: .7, fontSize: 10.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
          {meta.label} · {r.routeName}
        </div>
        <div className="t-row"><span>Distance</span><span>{fmtDistance(r.distance, units, 2)} {distUnit(units)}</span></div>
        <div className="t-row"><span>Pace</span><span>{fmtPaceUnit(r.pace, units)} {paceUnit(units)}</span></div>
        <div className="t-row"><span>Duration</span><span>{fmtDuration(r.duration)}</span></div>
        <div className="t-row"><span>Avg HR</span><span>{fmtHr(r)}</span></div>
        {r.pr && <div className="t-pill" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Personal Record</div>}
        {r.note && <div className="t-note">&ldquo;{r.note}&rdquo;</div>}
      </>,
      e.clientX, e.clientY
    );
  };
  const onLeave = () => { setHovered(null); hide(); };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (!runs.length) return null;

  return (
    <div className="panel" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 4 }}>Run Atlas</div>
          <div style={{ fontSize: 13, color: 'var(--inkSoft)', maxWidth: 520 }}>
            Every run in the window. Size = distance, fill = workout type, ring = personal record.
            Hover a run to light up its twins.
          </div>
        </div>
        <Legend typeMeta={typeMeta} show={show} hide={hide} />
      </div>

      <div className="mobile-scroll-fade" style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <svg width={gridW} height={gridH} style={{ display: 'block' }}>
          {dayNames.map((d, i) => (
            <text
              key={d}
              x={LEFT_GUTTER - 8}
              y={TOP_GUTTER + i * (CELL + GAP) + CELL / 2 + 3}
              textAnchor="end"
              style={{ fontFamily: 'var(--mono)', fontSize: 9.5, fill: 'var(--inkMuted)', letterSpacing: '.08em', textTransform: 'uppercase' }}
            >
              {d.toUpperCase()}
            </text>
          ))}

          {monthLabels.map((m) => (
            <text
              key={m.i + m.label}
              x={LEFT_GUTTER + m.i * (CELL + GAP)}
              y={14}
              style={{ fontFamily: 'var(--mono)', fontSize: 10, fill: 'var(--inkSoft)', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500 }}
            >
              {m.label.toUpperCase()}
            </text>
          ))}

          {weeks.map((w, wi) => (
            <g key={wi} transform={`translate(${LEFT_GUTTER + wi * (CELL + GAP)}, ${TOP_GUTTER})`}>
              {w.days.map((d, di) => {
                const y = di * (CELL + GAP);
                const run = d.run;
                const isMatch = run && matchSet && matchSet.has(run.id);
                const isSelf = run && hovered?.runId === run.id;
                const dimmed = hovered && !isMatch && !isSelf;

                return (
                  <g key={di}>
                    <rect
                      x={0} y={y}
                      width={CELL} height={CELL}
                      rx={2}
                      fill="var(--bgSunken)"
                      opacity={run ? 0 : 0.55}
                    />
                    {run && (
                      <g
                        style={{ cursor: 'pointer', transition: 'opacity 140ms' }}
                        opacity={dimmed ? 0.15 : 1}
                        onMouseEnter={(e) => onEnter(run, e)}
                        onMouseMove={(e) => onEnter(run, e)}
                        onMouseLeave={onLeave}
                        onClick={() => { onLeave(); setFocusRequest(run.id); }}
                      >
                        <rect
                          x={0} y={y}
                          width={CELL} height={CELL}
                          rx={2}
                          fill="transparent"
                        />
                        <circle
                          cx={CELL / 2}
                          cy={y + CELL / 2}
                          r={sizeFor(run) / 2}
                          fill={`var(--type-${run.type})`}
                          style={{ transition: 'r 140ms' }}
                        />
                        {run.pr && (
                          <circle
                            cx={CELL / 2}
                            cy={y + CELL / 2}
                            r={sizeFor(run) / 2 + 2.5}
                            fill="none"
                            stroke="var(--ink)"
                            strokeWidth={1}
                          />
                        )}
                        {isSelf && (
                          <circle
                            cx={CELL / 2}
                            cy={y + CELL / 2}
                            r={sizeFor(run) / 2 + 5}
                            fill="none"
                            stroke="var(--ink)"
                            strokeWidth={1.2}
                            opacity={0.55}
                          />
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--ruleSoft)', paddingTop: 12, marginTop: 8, gap: 12, flexWrap: 'wrap' }}>
        <AtlasStat label="Runs in view" value={runs.length} />
        <AtlasStat label="Total distance" value={fmtDistance(runs.reduce((a, r) => a + r.distance, 0), units, 0)} unit={distUnit(units)} />
        <AtlasStat label="Total time" value={fmtDuration(runs.reduce((a, r) => a + r.duration, 0))} />
        <AtlasStat label="PRs" value={runs.filter((r) => r.pr).length} />
        <AtlasStat label="Longest run" value={fmtDistance(Math.max(...runs.map((r) => r.distance)), units, 1)} unit={distUnit(units)} />
      </div>

      {(() => {
        // Skip "current week" from the coverage denominator — it's often
        // partial (today is mid-week) so including it makes consistency look
        // artificially low for someone actively training.
        const weeksToCount = weeks.length > 1 ? weeks.slice(0, -1) : weeks;
        if (!weeksToCount.length) return null;
        const covered = weeksToCount.filter((w) => w.days.some((d) => d.run)).length;
        const total = weeksToCount.length;
        const pct = Math.round((covered / total) * 100);

        // Current streak: consecutive trailing weeks (from the most recent
        // complete week backwards) that each contain ≥1 run.
        let streak = 0;
        for (let i = weeksToCount.length - 1; i >= 0; i--) {
          if (weeksToCount[i].days.some((d) => d.run)) streak++;
          else break;
        }

        if (pct >= 80) {
          return (
            <Highlight>
              Steady habit: you&rsquo;ve shown up in <HlNum>{covered} of the last {total} weeks</HlNum>{' '}
              (<HlNum>{pct}%</HlNum> coverage){streak >= 3 ? <>, riding a <HlNum>{streak}-week streak</HlNum></> : null}. That&rsquo;s how fitness compounds.
            </Highlight>
          );
        }
        if (pct >= 50) {
          return (
            <Highlight>
              You ran in <HlNum>{covered} of the last {total} weeks</HlNum>{' '}
              (<HlNum>{pct}%</HlNum> coverage){streak >= 2 ? <>, <HlNum>{streak}</HlNum> weeks in a row</> : null}. Stack a couple more back-to-back and the rhythm locks in.
            </Highlight>
          );
        }
        return (
          <Highlight tone="muted">
            <HlNum>{covered} of {total}</HlNum> weeks active in this window — two back-to-back weeks is the easiest way to start a streak.
          </Highlight>
        );
      })()}
    </div>
  );
}

function AtlasStat({ label, value, unit }) {
  return (
    <div className="stat" style={{ alignItems: 'flex-start' }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 22 }}>
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

function Legend({ typeMeta, show, hide }) {
  const types = ['easy', 'tempo', 'intervals', 'recovery', 'long', 'race'];

  const explainer = (
    <>
      <span className="t-title">How workout types are assigned</span>
      <div style={{ fontSize: 11.5, color: 'var(--inkSoft)', lineHeight: 1.55, marginTop: 6, maxWidth: 340 }}>
        A run is classified by the first rule that matches, in this order:
        <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
          <li style={{ marginBottom: 4 }}>
            <b>Explicit flags &amp; keywords.</b> Strava&rsquo;s <i>race</i> / <i>long run</i> / <i>recovery</i> tags and title keywords (<span className="mono">tempo</span>, <span className="mono">intervals</span>, <span className="mono">repeats</span>, <span className="mono">5k</span>, …) win immediately.
          </li>
          <li style={{ marginBottom: 4 }}>
            <b>Structural rules.</b> Distance &gt; 15 km or duration &gt; 90 min → <i>Long</i>. Short run at low HR → <i>Recovery</i>.
          </li>
          <li style={{ marginBottom: 4 }}>
            <b>Intensity bands.</b> Combines avg &amp; max HR as % of your HR<sub>max</sub>:<br/>
            {'>'} 91% → <i>Hard</i> · {'>'} 80% → <i>Moderate</i> · otherwise <i>Easy</i>.
          </li>
        </ol>
        <div style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--inkMuted)' }}>
          Summary-mode data can&rsquo;t distinguish structured intervals from a sustained tempo effort, so labels describe <b>intensity</b> rather than structure.
        </div>
      </div>
    </>
  );

  const onEnter = (e) => show(explainer, e.clientX, e.clientY);
  const onMove  = (e) => show(explainer, e.clientX, e.clientY);
  const onLeave = () => hide();

  return (
    <div
      className="legend"
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ cursor: 'help' }}
    >
      {types.map((t) => (
        <div className="legend-item" key={t}>
          <span className="legend-dot" style={{ background: `var(--type-${t})` }} />
          <span>{typeMeta[t].label}</span>
        </div>
      ))}
      <div className="legend-item">
        <span className="legend-dot" style={{ background: 'transparent', border: '1.2px solid var(--ink)' }} />
        <span>PR</span>
      </div>
    </div>
  );
}
