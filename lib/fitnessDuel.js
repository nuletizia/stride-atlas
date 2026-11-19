// Fitness Duel: how fit was each period of your running, measured against
// every other period. Pure (no React, no fetch).
//
// Duels
//  - Every run duels every run from a *different* period, using Showdown's
//    metrics and rules: similar distance (±COHORT_TOL), and HR metrics need
//    valid HR on both runs.
//  - Pace compares times projected to the same distance (Riegel), so a
//    10.4 km run isn't penalized against a 9.9 km one.
//  - Distance: every run meets every run (similar distance would tie).
//  - Heart: also needs a similar pace (±HR_PACE_TOL), so a win means "the
//    same kind of run at a lower heart rate", not "a slower run".
//
// Score
//  - A period's score is the share of its duels it won (draw = half), so
//    50% is the athlete's own average. Periods with few duels are flagged
//    `thin` and left out of the peak/low and the line, as are periods
//    with a single run.

import { SHOWDOWN_METRICS, DEFAULT_RANK, COHORT_TOL, projectTime } from './showdown';

const HR_PACE_TOL = 0.05;
// Below this many duels, or runs, a period's score is too noisy to plot as
// solid: one lucky run can win every duel it fights.
export const MIN_DUELS = 8;
export const MIN_RUNS = 2;

const durationAt10k = (r) => projectTime(r, 10);

// How each metric names its best and worst period. `has` metrics describe
// what the period had ("Longest runs: Q2 2026"); the others describe the
// period itself ("Fastest quarter").
function words(best, worst, yet, has = false) {
  return has
    ? { best: () => best, worst: () => worst, yet: (noun) => `Your latest ${noun} has your ${yet} yet.` }
    : { best: (noun) => `${best} ${noun}`, worst: (noun) => `${worst} ${noun}`, yet: (noun) => `Your latest ${noun} is your ${yet} yet.` };
}

export const DUEL_METRICS = SHOWDOWN_METRICS.map((m) => {
  if (m.id === 'pace') return { ...m, value: (r) => durationAt10k(r), higherIsBetter: false, rel: 0.005, rule: 'Time projected to the same distance. Faster wins.', words: words('Fastest', 'Slowest', 'fastest') };
  if (m.id === 'distance') return { ...m, all: true, rel: 0.01, rule: 'Longer wins. Every run meets every run.', words: words('Longest runs', 'Shortest runs', 'longest runs', true) };
  if (m.id === 'hr') return { ...m, paceTol: HR_PACE_TOL, rel: 0.005, rule: 'Lower average heart rate wins, between runs of similar distance and pace.', words: words('Lowest heart rate', 'Highest heart rate', 'lowest heart rate', true) };
  if (m.id === 'efficiency') return { ...m, rel: 0.005, rule: 'Speed per heartbeat. Higher wins.', words: words('Most efficient', 'Least efficient', 'most efficient') };
  return { ...m, rel: 0.005, rule: 'Efficiency held over distance. Higher wins.', words: words('Fittest', 'Least fit', 'fittest') };
});
export const DEFAULT_DUEL_METRIC = DEFAULT_RANK;

export const GROUPINGS = [
  { id: 'month', label: 'Month', months: 1 },
  { id: 'quarter', label: 'Quarter', months: 3 },
  { id: 'half', label: 'Half year', months: 6 },
  { id: 'year', label: 'Year', months: 12 },
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthIndex = (iso) => +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1);

// Key of the period holding `iso` (matches `period.key`).
export const periodKeyOf = (iso, months) => Math.floor(monthIndex(iso) / months) * months;

// Grouping that fits the athlete's history: enough periods to read a trend,
// few enough that each one holds a decent number of runs.
export function autoGrouping(runs) {
  if (!runs.length) return 'month';
  let lo = runs[0].date, hi = runs[0].date;
  for (const r of runs) { if (r.date < lo) lo = r.date; if (r.date > hi) hi = r.date; }
  const span = monthIndex(hi) - monthIndex(lo) + 1;
  if (span <= 24) return 'month';
  if (span <= 60) return 'quarter';
  if (span <= 120) return 'half';
  return 'year';
}

// Calendar periods from the first to the last run, empty ones included so
// gaps in training stay visible.
function buildPeriods(runs, months) {
  let lo = Infinity, hi = -Infinity;
  for (const r of runs) { const m = monthIndex(r.date); if (m < lo) lo = m; if (m > hi) hi = m; }
  const first = Math.floor(lo / months) * months;
  const periods = [];
  for (let a = first; a <= hi; a += months) {
    const y = Math.floor(a / 12), m = a % 12, k = m / months + 1, yy = String(y).slice(2);
    const short = months === 1 ? MON[m] : months === 3 ? `Q${k}` : months === 6 ? `H${k}` : String(y);
    const long = months === 1 ? `${MON[m]} ${y}`
      : months === 3 ? `Q${k} ${y}`
      : months === 6 ? `${k === 1 ? 'Jan to Jun' : 'Jul to Dec'} ${y}`
      : String(y);
    periods.push({ key: a, short, year: months === 12 ? '' : `'${yy}`, yearStart: m === 0, long });
  }
  return { periods, of: (r) => Math.floor((monthIndex(r.date) - first) / months) };
}

// Full result. `runs` should be the athlete's whole history (minus
// exclusions); the time range does not apply, since a period is ranked
// against all the others.
export function buildFitnessDuel(runs, { metricId = DEFAULT_DUEL_METRIC, groupId = 'month' } = {}) {
  const metric = DUEL_METRICS.find((m) => m.id === metricId) || DUEL_METRICS[0];
  const grouping = GROUPINGS.find((g) => g.id === groupId) || GROUPINGS[0];
  if (!runs.length) return { metric, grouping, periods: [], totalDuels: 0 };

  const { periods, of } = buildPeriods(runs, grouping.months);
  const pool = [];
  for (const r of runs) {
    if (!r.distance || !r.pace) continue;
    const v = metric.value(r);
    if (v == null || !Number.isFinite(v)) continue;
    pool.push({ run: r, v, p: of(r), w: 0, n: 0 });
  }

  const P = periods.length;
  const won = new Float64Array(P), duels = new Float64Array(P);
  const near = (a, b) => Math.abs(a.distance - b.distance) / Math.min(a.distance, b.distance) <= COHORT_TOL;
  let total = 0;
  for (let i = 0; i < pool.length; i++) {
    const A = pool[i];
    for (let j = i + 1; j < pool.length; j++) {
      const B = pool[j];
      if (A.p === B.p) continue;
      const a = A.run, b = B.run;
      if (!metric.all && !near(a, b)) continue;
      if (metric.paceTol && Math.abs(a.pace - b.pace) / Math.min(a.pace, b.pace) > metric.paceTol) continue;
      const rel = (A.v - B.v) / Math.abs(B.v);
      let sa;
      if (Math.abs(rel) < metric.rel) sa = 0.5;
      else sa = (metric.higherIsBetter ? rel > 0 : rel < 0) ? 1 : 0;
      A.w += sa; A.n += 1; B.w += 1 - sa; B.n += 1;
      won[A.p] += sa; won[B.p] += 1 - sa; duels[A.p] += 1; duels[B.p] += 1;
      total += 1;
    }
  }

  const out = periods.map((per, i) => {
    const mine = pool.filter((x) => x.p === i);
    // The period's standout: the run with the best duel record (ties go
    // to the one that fought more duels).
    let best = null;
    for (const x of mine) {
      if (!x.n) continue;
      const s = x.w / x.n;
      if (!best || s > best.s || (s === best.s && x.n > best.n)) best = { run: x.run, s, n: x.n };
    }
    return {
      ...per,
      runs: mine.length,
      won: won[i],
      duels: duels[i],
      score: duels[i] ? won[i] / duels[i] : null,
      thin: duels[i] < MIN_DUELS || mine.length < MIN_RUNS,
      best: best?.run ?? null,
    };
  });

  const solid = out.filter((p) => p.score != null && !p.thin);
  const peak = solid.reduce((m, p) => (!m || p.score > m.score ? p : m), null);
  const low = solid.reduce((m, p) => (!m || p.score < m.score ? p : m), null);
  const latest = solid[solid.length - 1] ?? null;
  return { metric, grouping, periods: out, totalDuels: total, solid, peak, low, latest };
}
