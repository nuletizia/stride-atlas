// Pure transform functions shared by the offline ingest script and the
// Strava API route. No filesystem, no fetch, no process.env reads — the
// caller passes everything (HR max, activity list, athlete profile).

export const TYPE_META = {
  easy:      { label: 'Easy',      targetPace: 5.45, drift: 0.35, hrAvg: 142 },
  tempo:     { label: 'Tempo',     targetPace: 4.35, drift: 0.15, hrAvg: 168 },
  long:      { label: 'Long',      targetPace: 5.15, drift: 0.20, hrAvg: 150 },
  intervals: { label: 'Intervals', targetPace: 3.55, drift: 0.25, hrAvg: 176 },
  race:      { label: 'Race',      targetPace: 4.05, drift: 0.10, hrAvg: 181 },
  recovery:  { label: 'Recovery',  targetPace: 6.20, drift: 0.40, hrAvg: 128 },
};

export const SPLIT_TARGETS_KM = [1, 5, 10, 21.0975, 42.195];

const ZONE_PCT = [0.50, 0.60, 0.70, 0.80, 0.90, 1.10];

export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function zoneForHr(hr, hrMax) {
  const pct = hr / hrMax;
  for (let i = 0; i < 5; i++) if (pct < ZONE_PCT[i + 1]) return i;
  return 4;
}

// Walk timestamped HR samples → % time in each zone. Returns null if no HR.
export function zonesFromStream(samples, hrMax = 190) {
  const z = [0, 0, 0, 0, 0];
  if (!samples || samples.length < 2) return null;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1], cur = samples[i];
    if (prev.hr == null) continue;
    const dt = (cur.t - prev.t) / 1000;
    if (!isFinite(dt) || dt <= 0 || dt > 30) continue;
    z[zoneForHr(prev.hr, hrMax)] += dt;
  }
  const total = z.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return z.map((s) => +((s / total) * 100).toFixed(1));
}

// Rolling best split: fastest time covering `targetKm` meters contiguously.
// Two-pointer scan over (t, cumulative-d) samples; interpolates the terminal
// sample so the window is exactly `targetKm` long. Returns an object keyed by
// target km (string), values in minutes or null.
export function bestSplitsFromStream(samples, targetsKm = SPLIT_TARGETS_KM) {
  const result = Object.fromEntries(targetsKm.map((k) => [String(k), null]));
  if (!samples || samples.length < 2) return result;
  const pts = samples
    .filter((s) => s.t != null && s.d != null && isFinite(s.d))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return result;

  for (const km of targetsKm) {
    const tgtM = km * 1000;
    let bestMs = Infinity;
    let j = 0;
    for (let i = 0; i < pts.length; i++) {
      if (j < i + 1) j = i + 1;
      while (j < pts.length && pts[j].d - pts[i].d < tgtM) j++;
      if (j >= pts.length) break;
      const dPrev = pts[j - 1].d - pts[i].d;
      const dCur  = pts[j].d - pts[i].d;
      const frac = dCur === dPrev ? 0 : (tgtM - dPrev) / (dCur - dPrev);
      const tEnd = pts[j - 1].t + frac * (pts[j].t - pts[j - 1].t);
      const elapsed = tEnd - pts[i].t;
      if (elapsed > 0 && elapsed < bestMs) bestMs = elapsed;
    }
    result[String(km)] = bestMs === Infinity ? null : +(bestMs / 60000).toFixed(3);
  }
  return result;
}

// Unified workout-type inference. Caller normalises flags (from CSV columns,
// Strava API's workout_type enum, etc.) into the boolean inputs here.
export function inferType({
  name = '', description = '',
  isRace = false, isLong = false, isRecovery = false,
  distKm, durMin, avgHr, laps = null, hrMax = 190,
}) {
  // Direct flag signals (guarded for the noisy Recovery flag).
  if (isRace) return 'race';
  if (isRecovery && distKm <= 10 && (!avgHr || avgHr < 155)) return 'recovery';
  if (isLong && distKm >= 10) return 'long';

  const both = `${name} ${description}`.toLowerCase();
  if (/\b(repeat|repeats|intervals?|fartlek|vo2|pyramid|ladder|strides?|400s?|800s?|1k repeats?)\b/.test(both)) return 'intervals';
  if (/\b(race|marathon|half[- ]?mar|10 ?k|5 ?k|hm race|parkrun|competition|deejay ten|podium)\b/.test(both)) return 'race';
  if (/\b(tempo|threshold|progression|cruise|lactate)\b/.test(both)) return 'tempo';
  if (/\b(long ?run|long)\b/.test(both) && distKm >= 10) return 'long';
  if (/\brecovery\b/.test(both)) return 'recovery';
  if (/\b(easy|shake|shakeout|chill)\b/.test(both)) return 'easy';

  return typeFromPhysiology(distKm, durMin, avgHr, laps, hrMax);
}

export function typeFromPhysiology(distKm, durMin, avgHr, laps, hrMax = 190) {
  const pace = durMin > 0 && distKm > 0 ? durMin / distKm : 0;
  const hrPct = (avgHr || 0) / hrMax;

  if (laps?.length >= 5) {
    const lapDists = laps.map((l) => l.distanceM / 1000);
    const lapPaces = laps
      .map((l) => (l.distanceM > 0 ? (l.timeS / 60) / (l.distanceM / 1000) : 0))
      .filter((p) => p > 0 && p < 15);
    if (lapPaces.length >= 5) {
      const distAvg = lapDists.reduce((a, b) => a + b, 0) / lapDists.length;
      const distStd = Math.sqrt(
        lapDists.reduce((a, d) => a + (d - distAvg) ** 2, 0) / lapDists.length
      );
      const paceAvg = lapPaces.reduce((a, b) => a + b, 0) / lapPaces.length;
      const paceStd = Math.sqrt(
        lapPaces.reduce((a, p) => a + (p - paceAvg) ** 2, 0) / lapPaces.length
      );
      const reallyShort = laps.filter((l) => l.distanceM < 700).length;
      const looksLikeAutoLap = distStd < 0.15 && distAvg > 0.8 && distAvg < 1.2;
      if (!looksLikeAutoLap && (reallyShort >= 3 || paceStd > 0.8)) return 'intervals';
    }
  }

  if (distKm > 15 || durMin > 90) return 'long';
  if (distKm < 5.5 && hrPct > 0 && hrPct < 0.65) return 'recovery';
  if (hrPct > 0.88 && pace < 4.5 && distKm >= 3) return 'race';
  if (hrPct > 0.78 && pace < 5.3) return 'tempo';
  return 'easy';
}

// Cluster activities that start within ~300m of each other (or within 500m
// with similar distance) into shared routes. Mutates activities with
// `routeId` / `routeName`. Returns the route catalog.
export function clusterRoutes(activities) {
  const routes = [];
  for (const a of activities) {
    if (a.startLat == null) {
      a.routeId = 'indoor';
      a.routeName = 'Indoor / Treadmill';
      continue;
    }
    const start = { lat: a.startLat, lng: a.startLng };
    const match = routes.find((r) => {
      const d = haversineKm(start, r.start);
      if (d < 0.3) return true;
      if (d < 0.5 && Math.abs(a.distance - r.distance) / r.distance < 0.15) return true;
      return false;
    });
    if (match) {
      a.routeId = match.id;
      a.routeName = match.name;
      match.count += 1;
      match.distance =
        (match.distance * (match.count - 1) + a.distance) / match.count;
    } else {
      const id = `route-${routes.length + 1}`;
      const name = `Route ${routes.length + 1}`;
      routes.push({
        id, name, start,
        distance: a.distance, elev: a.elev, count: 1,
      });
      a.routeId = id;
      a.routeName = name;
    }
  }
  const indoorCount = activities.filter((a) => a.routeId === 'indoor').length;
  const out = routes.map((r) => ({
    id: r.id, name: r.name,
    start: r.start,
    distance: +r.distance.toFixed(2),
    elev: r.elev != null ? Math.round(r.elev) : null,
  }));
  if (indoorCount > 0) {
    const any = activities.find((a) => a.routeId === 'indoor');
    out.push({
      id: 'indoor', name: 'Indoor / Treadmill',
      start: null,
      distance: +any.distance.toFixed(2), elev: 0,
    });
  }
  return out;
}

export function isoWeek(dateStr) {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  const n = 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(n).padStart(2, '0')}`;
}

// ---------- Strava API summary → our run shape ----------

// Strava API summary activity (partial, relevant fields):
//   id, name, distance (m), moving_time (s), total_elevation_gain (m),
//   type: 'Run', workout_type: null|0|1|2|3 (1=race, 2=long run, 3=workout),
//   start_date: ISO, start_latlng: [lat, lng] | null,
//   average_heartrate: number | undefined, has_heartrate: boolean
//
// `bestSplits` and `zones` stay null here because computing them requires
// the streams endpoint (one API call per activity). That's Phase 2.
export function summaryToRun(activity, { hrMax = 190 } = {}) {
  const distKm = (activity.distance || 0) / 1000;
  const durMin = (activity.moving_time || 0) / 60;
  const pace = distKm > 0 ? durMin / distKm : 0;

  const dt = new Date(activity.start_date);
  if (isNaN(+dt)) return null;
  const iso = dt.toISOString().slice(0, 10);

  const avgHrRaw = Number(activity.average_heartrate);
  const avgHr = isFinite(avgHrRaw) && avgHrRaw >= 40 ? Math.round(avgHrRaw) : null;
  const elevRaw = Number(activity.total_elevation_gain);
  const elev = isFinite(elevRaw) ? Math.round(elevRaw) : null;

  const startLat = activity.start_latlng?.[0] ?? null;
  const startLng = activity.start_latlng?.[1] ?? null;

  const type = inferType({
    name: activity.name || '',
    description: '', // Strava summary doesn't include description
    isRace: activity.workout_type === 1,
    isLong: activity.workout_type === 2,
    isRecovery: false,
    distKm, durMin, avgHr,
    laps: null,
    hrMax,
  });

  return {
    stravaId: activity.id,
    date: iso,
    dow: dt.getDay(),
    type,
    distance: +distKm.toFixed(2),
    pace: +pace.toFixed(2),
    duration: +durMin.toFixed(1),
    hr: avgHr,
    elev,
    zones: null,
    bestSplits: null,
    startLat, startLng,
    note: activity.name || '',
  };
}

// ---------- buildStrideData ----------

// Takes a set of internal activity records (either from scripts/ingest.mjs's
// file parsers or from summaryToRun) and produces the STRIDE_DATA shape that
// the dashboard components consume. Mutates `activities` for id/routeId/pr.
export function buildStrideData(activities, athlete = null, { hrMax = 190 } = {}) {
  if (!activities.length) {
    return {
      runs: [], routes: [], typeMeta: TYPE_META,
      weeks: [], prChain: {},
      profile: defaultProfile(athlete),
      streamsSynced: false,
    };
  }

  activities.sort((a, b) => a.date.localeCompare(b.date));
  const routes = clusterRoutes(activities);
  activities.forEach((a, i) => (a.id = i + 1));

  // PR flags — two-pass so the actual best gets the flag, not first-seen.
  const bestByKey = {}, bestByRoute = {};
  for (const a of activities) {
    const k = `${a.routeId}|${a.type}`;
    if (a.duration < (bestByKey[k] ?? Infinity)) bestByKey[k] = a.duration;
    if (a.duration < (bestByRoute[a.routeId] ?? Infinity)) bestByRoute[a.routeId] = a.duration;
  }
  const seenKey = new Set(), seenRoute = new Set();
  for (const a of activities) {
    const k = `${a.routeId}|${a.type}`;
    a.pr = a.duration === bestByKey[k] && !seenKey.has(k);
    a.routePR = a.duration === bestByRoute[a.routeId] && !seenRoute.has(a.routeId);
    if (a.pr) seenKey.add(k);
    if (a.routePR) seenRoute.add(a.routeId);
  }

  const weeks = {};
  for (const a of activities) {
    const w = isoWeek(a.date);
    if (!weeks[w]) weeks[w] = { week: w, distance: 0, duration: 0, runs: 0, prs: 0, byType: {} };
    weeks[w].distance += a.distance;
    weeks[w].duration += a.duration;
    weeks[w].runs += 1;
    weeks[w].prs += a.pr ? 1 : 0;
    weeks[w].byType[a.type] = (weeks[w].byType[a.type] || 0) + a.distance;
  }

  const prChain = {};
  for (const a of activities) {
    if (!prChain[a.routeId]) prChain[a.routeId] = { best: Infinity, entries: [] };
    if (a.duration < prChain[a.routeId].best) {
      prChain[a.routeId].best = a.duration;
      prChain[a.routeId].entries.push({
        id: a.id, date: a.date, duration: a.duration, pace: a.pace,
      });
    }
  }

  const runs = activities.map((a) => ({
    id: a.id, date: a.date, dow: a.dow, type: a.type,
    routeId: a.routeId, routeName: a.routeName,
    distance: a.distance, pace: a.pace, duration: a.duration,
    hr: a.hr, elev: a.elev, zones: a.zones,
    bestSplits: a.bestSplits || null,
    pr: a.pr, routePR: a.routePR, note: a.note,
  }));

  const routesOut = routes.map(({ start, ...rest }) => rest);
  const streamsSynced = activities.some((a) => a.bestSplits);

  return {
    runs,
    routes: routesOut,
    typeMeta: TYPE_META,
    weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
    prChain,
    profile: defaultProfile(athlete),
    streamsSynced,
  };
}

function defaultProfile(athlete) {
  if (!athlete) {
    return {
      name: 'Runner',
      city: '',
      since: new Date().getFullYear(),
      goalRace: 'Next race',
    };
  }
  const first = athlete.firstname || '';
  const last = athlete.lastname || '';
  const name = [first, last].filter(Boolean).join(' ') || athlete.username || 'Runner';
  const since = athlete.created_at ? new Date(athlete.created_at).getFullYear() : new Date().getFullYear();
  return {
    name,
    city: athlete.city || '',
    since,
    goalRace: 'Next race',
  };
}
