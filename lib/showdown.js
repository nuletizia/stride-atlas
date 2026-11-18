// Showdown: head-to-head comparison of two runs. Pure (no React, no fetch).
//
// Two rules drive everything here:
//  1. A stat bar's length is the run's percentile among the athlete's own
//     similar runs (the cohort), not a ratio between the two contenders. So
//     a long bar means "good for you at this distance" on its own, and a
//     2-second gap doesn't render as a total wipeout.
//  2. Every stat has a direction where longer = better. Conditions (climb,
//     heat) count as "tougher", so the run that fought harder gets credit.

import { efOf, stamOf } from './shared';

// Riegel endurance exponent, used to equalize times when the two runs
// aren't the same distance.
const RIEGEL = 1.06;
// Below this relative distance gap the actual times are compared as-is.
const SAME_DIST_TOL = 0.01;
// Distance window for the cohort the percentile bars are ranked against.
export const COHORT_TOL = 0.15;
// Distance window for suggested opponents (tighter: "the same kind of run").
const SUGGEST_TOL = 0.05;

// Time (minutes) projected to `km` with Riegel's formula.
export function projectTime(run, km) {
  if (!run?.duration || !run.distance) return null;
  return run.duration * Math.pow(km / run.distance, RIEGEL);
}

// Each stat: `get` returns a raw value (null = not available) and
// `better` says which direction wins. `group` separates performance from
// conditions in the UI.
export const SHOWDOWN_STATS = [
  { key: 'pace', label: 'Pace', group: 'perf', better: 'low', get: (r) => r.pace || null },
  { key: 'ef', label: 'Efficiency', group: 'perf', better: 'high', get: (r) => efOf(r), hint: 'Speed per heartbeat' },
  { key: 'stam', label: 'Stamina', group: 'perf', better: 'high', get: (r) => stamOf(r), hint: 'Efficiency held over distance' },
  { key: 'km1', label: 'Best km', group: 'perf', better: 'low', get: (r) => r.bestSplits?.['1'] ?? null, needsStreams: true },
  { key: 'elev', label: 'Climb', group: 'cond', better: 'high', get: (r) => (r.elev != null ? r.elev : null), hint: 'More climbing is tougher' },
  { key: 'temp', label: 'Heat', group: 'cond', better: 'high', get: (r) => (r.temp != null ? r.temp : null), hint: 'Hotter is tougher' },
];

// Runs similar to the anchor: within ±COHORT_TOL of its distance and of one
// of the contenders' types. Both contenders are always included.
export function showdownCohort(a, b, runs) {
  const types = new Set([a.type, b?.type].filter(Boolean));
  const pool = runs.filter((r) =>
    types.has(r.type) && Math.abs(r.distance - a.distance) / a.distance <= COHORT_TOL
  );
  for (const r of [a, b]) if (r && !pool.some((x) => x.id === r.id)) pool.push(r);
  return pool;
}

// Percentile (0..1, 1 = best in cohort) and rank (1 = best) for `run` on
// `stat`. Ties share the better rank. Null when the run has no value or
// fewer than two cohort runs do.
function rankIn(stat, run, cohort) {
  const v = stat.get(run);
  if (v == null) return null;
  const vals = cohort.map(stat.get).filter((x) => x != null);
  if (vals.length < 2) return null;
  const beats = (x) => (stat.better === 'low' ? x < v : x > v);
  const rank = vals.filter(beats).length + 1;
  return { value: v, rank, total: vals.length, pct: (vals.length - rank) / (vals.length - 1) };
}

// Full comparison. Returns null until both runs are present.
export function buildShowdown(a, b, runs, { streamsSynced = true } = {}) {
  if (!a || !b) return null;
  const cohort = showdownCohort(a, b, runs);
  const sameDist = Math.abs(a.distance - b.distance) / a.distance <= SAME_DIST_TOL;
  // Equalize to the opened run's distance.
  const km = a.distance;
  const timeA = sameDist ? a.duration : projectTime(a, km);
  const timeB = sameDist ? b.duration : projectTime(b, km);

  const stats = [];
  for (const s of SHOWDOWN_STATS) {
    if (s.needsStreams && !streamsSynced) continue;
    const ra = rankIn(s, a, cohort);
    const rb = rankIn(s, b, cohort);
    if (!ra || !rb) continue;
    let winner = null;
    if (ra.value !== rb.value) {
      const aBetter = s.better === 'low' ? ra.value < rb.value : ra.value > rb.value;
      winner = aBetter ? 'a' : 'b';
    }
    stats.push({ ...s, a: ra, b: rb, winner });
  }

  const tally = {
    a: stats.filter((s) => s.winner === 'a').length,
    b: stats.filter((s) => s.winner === 'b').length,
  };
  // The hero time decides. Within one second it's a draw.
  const diff = timeA != null && timeB != null ? timeB - timeA : 0;
  const winner = Math.abs(diff) < 1 / 60 ? null : diff > 0 ? 'a' : 'b';

  return {
    cohort, stats, tally, winner, sameDist, km,
    time: { a: timeA, b: timeB, diff: Math.abs(diff) },
  };
}

// Suggested opponents for `a`. Returns [{ run, labels: [..] }], deduped so
// one run carrying several reasons shows once with every label.
export function suggestOpponents(a, runs) {
  if (!a) return [];
  const near = (tol) => runs.filter((r) =>
    r.id !== a.id && Math.abs(r.distance - a.distance) / a.distance <= tol
  );
  let pool = near(SUGGEST_TOL);
  if (pool.length < 2) pool = near(COHORT_TOL);
  if (!pool.length) return [];

  const sameType = pool.filter((r) => r.type === a.type);
  const pref = sameType.length ? sameType : pool;
  const t = (iso) => new Date(iso + 'T00:00:00').getTime();
  const DAY = 86400000;
  const out = [];
  const add = (run, label) => {
    if (!run) return;
    const hit = out.find((o) => o.run.id === run.id);
    if (hit) { if (!hit.labels.includes(label)) hit.labels.push(label); return; }
    out.push({ run, labels: [label] });
  };

  // A year ago: closest to the anniversary, within ±75 days.
  const target = t(a.date) - 365 * DAY;
  const yearAgo = pool
    .map((r) => ({ r, d: Math.abs(t(r.date) - target) }))
    .filter((x) => x.d <= 75 * DAY)
    .sort((x, y) => x.d - y.d)[0]?.r;
  add(yearAgo, 'A year ago');

  // Previous best: fastest before this run. If this is the oldest, the
  // fastest after it ("Best since").
  const before = pref.filter((r) => r.date < a.date);
  const fastest = (list) => [...list].sort((x, y) => x.pace - y.pace)[0];
  if (before.length) add(fastest(before), 'Previous best');
  else add(fastest(pref.filter((r) => r.date > a.date)), 'Best since');

  // Last time: most recent similar run before this one.
  add([...pref].filter((r) => r.date < a.date).sort((x, y) => y.date.localeCompare(x.date))[0], 'Last time');

  return out;
}

// Runs offered in the "pick any" list: similar distance first (by date
// desc), then everything else.
export function opponentChoices(a, runs) {
  if (!a) return { similar: [], rest: [] };
  const byDate = (x, y) => y.date.localeCompare(x.date);
  const others = runs.filter((r) => r.id !== a.id);
  const isSim = (r) => Math.abs(r.distance - a.distance) / a.distance <= COHORT_TOL;
  return {
    similar: others.filter(isSim).sort(byDate),
    rest: others.filter((r) => !isSim(r)).sort(byDate),
  };
}
