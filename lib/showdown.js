// Showdown: head-to-head comparison of two runs. Pure (no React, no fetch).
//
// Winner
//  - Decided by one metric the reader picks, the same set as the Personal
//    Records board: Pace, Distance, Heart (lower wins), Efficiency,
//    Stamina. Stamina is the default. Level on that metric = draw.
//  - Heart, Efficiency and Stamina need valid HR on both runs; without it
//    the ranking falls back to Pace.
//  - Run type plays no part anywhere: "similar" means similar distance.
//
// Bars
//  - A bar's length is the run's percentile among the athlete's runs
//    within ±COHORT_TOL of *its own* distance (Distance: among all runs),
//    so a long bar means "good for you" even when the two runs differ in
//    length. Heart bars are longer for a lower HR, matching its ranking.

import { efOf, stamOf, hasValidHr } from './shared';

// Riegel endurance exponent, used to equalize times across distances.
const RIEGEL = 1.06;
// Below this relative distance gap the actual times are compared as-is.
const SAME_DIST_TOL = 0.01;
// Distance window for the cohort each run's bars are ranked against.
export const COHORT_TOL = 0.15;
// Distance window for suggested opponents. Wide enough that GPS drift on a
// 10K (9.9 vs 10.4 km) doesn't split "the same race distance".
const SUGGEST_TOL = 0.08;
const TIME_EPS = 1 / 60; // 1 s, in minutes

// Time (minutes) projected to `km` with Riegel's formula.
export function projectTime(run, km) {
  if (!run?.duration || !run.distance) return null;
  return run.duration * Math.pow(km / run.distance, RIEGEL);
}

// Ranking metrics, in the Personal Records board's order. `eps` is the gap
// below which two runs count as level (about what the card displays).
export const SHOWDOWN_METRICS = [
  { id: 'pace', label: 'Pace', rowLabel: 'Pace', win: 'Faster pace', higherIsBetter: false, needsHr: false, eps: 0.5 / 60, value: (r) => r.pace || null },
  { id: 'distance', label: 'Distance', rowLabel: 'Distance', win: 'Longer run', higherIsBetter: true, needsHr: false, eps: 0.01, cohortAll: true, value: (r) => r.distance || null },
  { id: 'hr', label: 'Heart', rowLabel: 'Avg HR', win: 'Lower heart rate', higherIsBetter: false, needsHr: true, eps: 0.5, value: (r) => (hasValidHr(r) ? r.hr : null) },
  { id: 'efficiency', label: 'Efficiency', rowLabel: 'Efficiency', win: 'More efficient', higherIsBetter: true, needsHr: true, compound: true, eps: 0.005, value: efOf, hint: 'Speed per heartbeat' },
  { id: 'stamina', label: 'Stamina', rowLabel: 'Stamina', win: 'Higher stamina', higherIsBetter: true, needsHr: true, compound: true, eps: 0.005, value: stamOf, hint: 'Efficiency held over distance' },
];
export const DEFAULT_RANK = 'stamina';

// Shown for context, never deciding anything.
export const CONTEXT_STATS = [
  { id: 'km1', rowLabel: 'Best km', higherIsBetter: false, needsStreams: true, value: (r) => r.bestSplits?.['1'] ?? null },
  { id: 'elev', rowLabel: 'Climb', higherIsBetter: true, value: (r) => (r.elev != null ? r.elev : null), hint: 'More climbing is tougher' },
  { id: 'temp', rowLabel: 'Heat', higherIsBetter: true, value: (r) => (r.temp != null ? r.temp : null), hint: 'Hotter is tougher' },
];

const near = (r, km, tol) => Math.abs(r.distance - km) / km <= tol;

// Runs within ±COHORT_TOL of `run`'s distance, `run` included.
export function cohortOf(run, runs) {
  const pool = runs.filter((r) => near(r, run.distance, COHORT_TOL));
  if (!pool.some((x) => x.id === run.id)) pool.push(run);
  return pool;
}

// { value, rank, total, pct } for `run` within `cohort` (pct 1 = best).
// Ties share the better rank. Value-only when there's nothing to rank.
function rankIn(stat, run, cohort) {
  const v = stat.value(run);
  if (v == null) return { value: null };
  const vals = cohort.map(stat.value).filter((x) => x != null);
  if (vals.length < 2) return { value: v, rank: 1, total: vals.length, pct: 1 };
  const beats = (x) => (stat.higherIsBetter ? x > v : x < v);
  const rank = vals.filter(beats).length + 1;
  return { value: v, rank, total: vals.length, pct: (vals.length - rank) / (vals.length - 1) };
}

// 'a' | 'b' | null for "which side is better", null when level.
function betterSide(va, vb, higherIsBetter, eps) {
  if (va == null || vb == null || Math.abs(va - vb) < eps) return null;
  return (higherIsBetter ? va > vb : va < vb) ? 'a' : 'b';
}

// Which metrics can rank this pair (HR ones need HR on both runs).
export function availableMetrics(a, b) {
  const hr = hasValidHr(a) && hasValidHr(b);
  return SHOWDOWN_METRICS.filter((m) => !m.needsHr || hr).map((m) => m.id);
}

// Full comparison. Returns null until both runs are present.
export function buildShowdown(a, b, runs, { rankBy = DEFAULT_RANK, streamsSynced = true } = {}) {
  if (!a || !b) return null;
  const cohortA = cohortOf(a, runs);
  const cohortB = cohortOf(b, runs);
  const available = availableMetrics(a, b);
  const metricId = available.includes(rankBy) ? rankBy : 'pace';
  const metric = SHOWDOWN_METRICS.find((m) => m.id === metricId);

  const row = (stat, isMetric) => {
    const ra = rankIn(stat, a, stat.cohortAll ? runs : cohortA);
    const rb = rankIn(stat, b, stat.cohortAll ? runs : cohortB);
    if (ra.value == null && rb.value == null) return null;
    const better = isMetric ? betterSide(ra.value, rb.value, stat.higherIsBetter, stat.eps) : null;
    return { ...stat, isMetric, selected: stat.id === metricId, a: ra, b: rb, better };
  };
  const metrics = SHOWDOWN_METRICS.map((m) => row(m, true)).filter(Boolean);
  const context = CONTEXT_STATS
    .filter((s) => !s.needsStreams || streamsSynced)
    .map((s) => row(s, false)).filter(Boolean);

  const winner = metrics.find((m) => m.selected)?.better ?? null;

  // Time, for the hero gap: projected to the opened run's distance when
  // the two lengths differ.
  const sameDist = Math.abs(a.distance - b.distance) / a.distance <= SAME_DIST_TOL;
  const km = a.distance;
  const timeA = sameDist ? a.duration : projectTime(a, km);
  const timeB = sameDist ? b.duration : projectTime(b, km);
  const diff = timeA != null && timeB != null ? timeB - timeA : 0;

  return {
    metric, available, metrics, context, winner, sameDist, km,
    cohorts: { a: cohortA, b: cohortB },
    time: { a: timeA, b: timeB, diff: Math.abs(diff), level: Math.abs(diff) < TIME_EPS },
  };
}

// Suggested opponents for `a`, by distance only (no run-type filter).
// Returns [{ run, labels: [..] }], deduped so a run carrying several
// reasons shows once with every label.
export function suggestOpponents(a, runs) {
  if (!a) return [];
  const pool = runs.filter((r) => r.id !== a.id && near(r, a.distance, SUGGEST_TOL));
  if (!pool.length) return [];

  const t = (iso) => new Date(iso + 'T00:00:00').getTime();
  const DAY = 86400000;
  // Rank by time projected to this run's distance, so a 10.4 km effort
  // isn't penalized against a 9.9 km one.
  const fastest = (list) => list
    .map((r) => ({ r, tm: projectTime(r, a.distance) }))
    .sort((x, y) => x.tm - y.tm)[0]?.r;
  const out = [];
  const add = (run, label) => {
    if (!run) return;
    const hit = out.find((o) => o.run.id === run.id);
    if (hit) { if (!hit.labels.includes(label)) hit.labels.push(label); return; }
    out.push({ run, labels: [label] });
  };

  // Best a year ago: fastest within ±3 months of the anniversary. "How much
  // have I improved in a year" wants last year's best effort, not whatever
  // run happens to sit closest to the date.
  const anniversary = t(a.date) - 365 * DAY;
  add(fastest(pool.filter((r) => Math.abs(t(r.date) - anniversary) <= 91 * DAY)), 'Best a year ago');

  // Previous best: fastest before this run. If this is the oldest, the
  // fastest after it ("Best since").
  const before = pool.filter((r) => r.date < a.date);
  if (before.length) add(fastest(before), 'Previous best');
  else add(fastest(pool.filter((r) => r.date > a.date)), 'Best since');

  // Last time: most recent before this one.
  add([...before].sort((x, y) => y.date.localeCompare(x.date))[0], 'Last time');

  return out;
}

// Runs offered in the "pick any" list: similar distance first (by date
// desc), then everything else.
export function opponentChoices(a, runs) {
  if (!a) return { similar: [], rest: [] };
  const byDate = (x, y) => y.date.localeCompare(x.date);
  const others = runs.filter((r) => r.id !== a.id);
  const isSim = (r) => near(r, a.distance, COHORT_TOL);
  return {
    similar: others.filter(isSim).sort(byDate),
    rest: others.filter((r) => !isSim(r)).sort(byDate),
  };
}
