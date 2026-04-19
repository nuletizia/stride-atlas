// Ingest Strava/Garmin activities into data/runs.json.
//
// Two modes (auto-detected):
//   1. Strava export: activities/strava/activities.csv + activities/strava/activities/*.{fit,tcx,gpx}.gz
//      The CSV is the spine — summary stats, workout-type flags, activity names.
//      Per-activity stream files are parsed for HR zones + lap-based interval detection.
//   2. Loose FITs: any *.fit file directly in activities/ (no CSV needed).
//      All fields derived from the FIT alone.
//
// Usage: npm run ingest
// Env vars: HR_MAX, PROFILE_NAME, PROFILE_CITY, PROFILE_SINCE, PROFILE_GOAL

import { Decoder, Stream as FitStream } from '@garmin/fitsdk';
import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  TYPE_META,
  SPLIT_TARGETS_KM,
  haversineKm,
  zonesFromStream,
  bestSplitsFromStream,
  inferType,
  clusterRoutes,
  isoWeek,
  estimateHrMax,
} from '../lib/ingest-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ACTIVITIES_DIR = path.join(ROOT, 'activities');
const STRAVA_DIR = path.join(ACTIVITIES_DIR, 'strava');
const STRAVA_CSV = path.join(STRAVA_DIR, 'activities.csv');
const DATA_DIR = path.join(ROOT, 'data');
const OUT = path.join(DATA_DIR, 'runs.json');

// HR_MAX: explicit env override takes precedence. Otherwise we auto-detect
// from the observed data (highest single-run max HR + 2% buffer) later,
// inside each ingest path.
const HR_MAX_ENV = Number(process.env.HR_MAX) || null;
const PROFILE = {
  name: process.env.PROFILE_NAME || 'Runner',
  city: process.env.PROFILE_CITY || '',
  since: Number(process.env.PROFILE_SINCE) || new Date().getFullYear(),
  goalRace: process.env.PROFILE_GOAL || 'Next race',
};

// ---------- helpers ----------

const semiToDeg = (s) => (s == null ? null : s * (180 / 2 ** 31));

// Gunzip if path ends .gz; return Buffer.
function readMaybeGz(p) {
  const buf = fs.readFileSync(p);
  return p.toLowerCase().endsWith('.gz') ? zlib.gunzipSync(buf) : buf;
}

// ---------- FIT parser ----------

function parseFit(buf) {
  const decoder = new Decoder(FitStream.fromByteArray(buf));
  if (!decoder.checkIntegrity()) return null;
  const { messages } = decoder.read({
    applyScaleAndOffset: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    includeUnknownFields: false,
    expandSubFields: true,
    mergeHeartRates: true,
  });
  const session = messages.sessionMesgs?.[0];
  if (!session) return null;
  const records = messages.recordMesgs || [];
  const laps = messages.lapMesgs || [];

  const samples = records
    .map((r) => ({
      t: +new Date(r.timestamp),
      hr: r.heartRate ?? null,
      d: r.distance != null ? Number(r.distance) : null, // cumulative meters
    }))
    .filter((s) => s.t);

  const startLat = semiToDeg(session.startPositionLat);
  const startLng = semiToDeg(session.startPositionLong);

  return {
    samples,
    laps: laps.map((l) => ({
      distanceM: l.totalDistance || 0,
      timeS: l.totalTimerTime || 0,
    })),
    startLat, startLng,
    sport: session.sport,
  };
}

// ---------- TCX parser ----------
// Schema: Activities → Activity → Lap → Track → Trackpoint{Time, HeartRateBpm/Value, Position}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

function parseTcx(buf) {
  const text = buf.toString('utf8');
  const doc = xml.parse(text);
  const activity = doc?.TrainingCenterDatabase?.Activities?.Activity;
  if (!activity) return null;
  const lapsX = arr(activity.Lap);

  const samples = [];
  const laps = [];
  let startLat = null, startLng = null;

  for (const l of lapsX) {
    laps.push({
      distanceM: Number(l.DistanceMeters) || 0,
      timeS: Number(l.TotalTimeSeconds) || 0,
    });
    const tracks = arr(l.Track);
    for (const tr of tracks) {
      const tps = arr(tr.Trackpoint);
      for (const tp of tps) {
        const t = tp.Time ? +new Date(tp.Time) : null;
        const hr = tp.HeartRateBpm?.Value ? Number(tp.HeartRateBpm.Value) : null;
        const d = tp.DistanceMeters != null ? Number(tp.DistanceMeters) : null;
        if (startLat == null && tp.Position) {
          const lat = Number(tp.Position.LatitudeDegrees);
          const lng = Number(tp.Position.LongitudeDegrees);
          if (isFinite(lat) && isFinite(lng)) { startLat = lat; startLng = lng; }
        }
        if (t) samples.push({ t, hr, d });
      }
    }
  }
  return { samples, laps, startLat, startLng, sport: 'running' };
}

// ---------- GPX parser ----------
// Schema: gpx → trk → trkseg → trkpt{@lat, @lon, time, extensions/*hr}

function parseGpx(buf) {
  const text = buf.toString('utf8');
  const doc = xml.parse(text);
  const trks = arr(doc?.gpx?.trk);
  // Raw points with GPS. Cumulative distance computed after collection.
  const raw = [];
  let startLat = null, startLng = null;
  for (const trk of trks) {
    const segs = arr(trk.trkseg);
    for (const seg of segs) {
      const pts = arr(seg.trkpt);
      for (const p of pts) {
        const lat = Number(p['@_lat']);
        const lng = Number(p['@_lon']);
        const t = p.time ? +new Date(p.time) : null;
        let hr = null;
        const ext = p.extensions;
        if (ext && typeof ext === 'object') {
          const findHr = (o) => {
            for (const [k, v] of Object.entries(o)) {
              if (/(^|:)hr$/i.test(k) || /TrackPointExtension/i.test(k)) {
                if (typeof v === 'object' && v != null) {
                  const nested = findHr(v); if (nested != null) return nested;
                }
                if (typeof v === 'number' || (typeof v === 'string' && v.trim())) {
                  const n = Number(v);
                  if (isFinite(n) && n > 30 && n < 240) return n;
                }
              }
              if (typeof v === 'object' && v != null) {
                const nested = findHr(v); if (nested != null) return nested;
              }
            }
            return null;
          };
          hr = findHr(ext);
        }
        if (startLat == null && isFinite(lat) && isFinite(lng)) { startLat = lat; startLng = lng; }
        if (t && isFinite(lat) && isFinite(lng)) raw.push({ t, hr, lat, lng });
      }
    }
  }
  // Cumulative distance from haversine between consecutive points.
  const samples = [];
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) {
      acc += haversineKm(
        { lat: raw[i - 1].lat, lng: raw[i - 1].lng },
        { lat: raw[i].lat, lng: raw[i].lng }
      ) * 1000;
    }
    samples.push({ t: raw[i].t, hr: raw[i].hr, d: acc });
  }
  return { samples, laps: [], startLat, startLng, sport: 'running' };
}

// ---------- dispatch ----------

function parseStream(absPath) {
  let buf;
  try { buf = readMaybeGz(absPath); }
  catch (e) { console.warn('  ! failed to decompress', path.basename(absPath)); return null; }
  const lower = absPath.toLowerCase().replace(/\.gz$/, '');
  try {
    if (lower.endsWith('.fit')) return parseFit(buf);
    if (lower.endsWith('.tcx')) return parseTcx(buf);
    if (lower.endsWith('.gpx')) return parseGpx(buf);
  } catch (e) { console.warn('  ! parse error', path.basename(absPath), e.message); }
  return null;
}

// ---------- reverse geocoding (opt-in via GEOCODE=1) ----------

const CACHE_PATH = path.join(DATA_DIR, 'routes.cache.json');
const LOCAL_PATH = path.join(DATA_DIR, 'routes.local.json');

function loadJsonIfExists(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; }
  catch { return {}; }
}

function cacheKey(lat, lng) {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

async function reverseGeocode(lat, lng) {
  // Nominatim policy: custom User-Agent, ≤1 req/sec.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': `StrideAtlas/0.1 (${process.env.PROFILE_EMAIL || 'stride-atlas@example.com'})`,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address || {};
    const place =
      a.suburb || a.neighbourhood || a.quarter || a.village ||
      a.road || a.city_district || a.town || a.city || null;
    return place ? `Runs near ${place}` : null;
  } catch {
    return null;
  }
}

async function applyGeocoding(routes) {
  if (!process.env.GEOCODE || process.env.GEOCODE === '0') return routes;
  console.log('\nReverse-geocoding routes (GEOCODE=1)…');
  const cache = loadJsonIfExists(CACHE_PATH);
  for (const r of routes) {
    if (!r.start) continue; // indoor
    const key = cacheKey(r.start.lat, r.start.lng);
    if (cache[key]) {
      r.name = cache[key];
      continue;
    }
    // Rate limit: 1 req/sec
    await new Promise((res) => setTimeout(res, 1100));
    const name = await reverseGeocode(r.start.lat, r.start.lng);
    if (name) {
      cache[key] = name;
      r.name = name;
      console.log(`  ${r.id} → ${name}`);
    } else {
      console.log(`  ${r.id} → (geocode failed, keeping ${r.name})`);
    }
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  return routes;
}

function applyManualOverrides(routes, activities) {
  const local = loadJsonIfExists(LOCAL_PATH);
  if (!Object.keys(local).length) return;
  for (const r of routes) {
    if (local[r.id]) r.name = local[r.id];
  }
  // Propagate names to activity records so the UI shows the override.
  const byId = Object.fromEntries(routes.map((r) => [r.id, r.name]));
  for (const a of activities) {
    if (byId[a.routeId]) a.routeName = byId[a.routeId];
  }
}

// ---------- main ingest (Strava CSV path) ----------

function ingestStrava() {
  console.log('Strava mode: reading', path.relative(ROOT, STRAVA_CSV));
  const csv = fs.readFileSync(STRAVA_CSV, 'utf8');
  const { data: rows } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const runs = rows.filter((r) => r['Activity Type'] === 'Run');
  console.log(`Found ${rows.length} activities → ${runs.length} runs`);

  const HR_MAX = HR_MAX_ENV || estimateHrMax(runs.map((r) => r['Max Heart Rate']));
  console.log(`HR_MAX = ${HR_MAX} ${HR_MAX_ENV ? '(env)' : '(auto-detected)'}`);

  const activities = [];
  let parsed = 0, skippedNoFile = 0;

  for (const r of runs) {
    const id = r['Activity ID'];
    const distKm = Number(r.Distance);
    const durSec = Number(r['Moving Time']) || Number(r['Elapsed Time']);
    const durMin = durSec / 60;
    if (!isFinite(distKm) || distKm < 0.5 || !isFinite(durMin) || durMin < 3) continue;

    const pace = distKm > 0 ? durMin / distKm : 0;
    const avgHrRaw = Number(r['Average Heart Rate']);
    const avgHr = isFinite(avgHrRaw) && avgHrRaw >= 40 ? Math.round(avgHrRaw) : null;
    const maxHrRaw = Number(r['Max Heart Rate']);
    const maxHr = isFinite(maxHrRaw) && maxHrRaw >= 40 ? Math.round(maxHrRaw) : null;
    const elevRaw = Number(r['Elevation Gain']);
    const elev = isFinite(elevRaw) && r['Elevation Gain'] !== '' ? Math.round(elevRaw) : null;
    // Strava CSV exposes suffer_score as "Relative Effort".
    const sufferRaw = Number(r['Relative Effort']);
    const sufferScore = isFinite(sufferRaw) && sufferRaw > 0 ? sufferRaw : null;

    // Parse date as UTC to match ISO
    const dt = new Date(r['Activity Date']);
    if (isNaN(+dt)) continue;
    const iso = dt.toISOString().slice(0, 10);

    // Attempt to load stream file for HR zones + GPS start + laps + splits
    let zones = null;
    let startLat = null, startLng = null;
    let streamLaps = null;
    let bestSplits = null;

    const fnRel = r.Filename || '';
    if (fnRel) {
      const absPath = path.join(STRAVA_DIR, fnRel);
      if (fs.existsSync(absPath)) {
        const stream = parseStream(absPath);
        if (stream) {
          zones = zonesFromStream(stream.samples, HR_MAX);
          startLat = stream.startLat;
          startLng = stream.startLng;
          streamLaps = stream.laps;
          bestSplits = bestSplitsFromStream(stream.samples, SPLIT_TARGETS_KM);
          parsed++;
        }
      } else {
        skippedNoFile++;
      }
    }

    // Type: Strava CSV flags + name regex + laps + intensity bands.
    const type = inferType({
      name: r['Activity Name'] || '',
      description: r['Activity Description'] || '',
      isRace: !!r.Competition,
      isLong: !!r['Long Run'],
      isRecovery: !!r.Recovery,
      distKm, durMin, avgHr, maxHr, sufferScore,
      laps: streamLaps,
      hrMax: HR_MAX,
    });

    activities.push({
      stravaId: id,
      date: iso,
      dow: dt.getDay(),
      type,
      distance: +distKm.toFixed(2),
      pace: +pace.toFixed(2),
      duration: +durMin.toFixed(1),
      hr: avgHr,
      elev,
      zones,
      bestSplits,
      startLat, startLng,
      note: r['Activity Name'] || '',
    });
  }

  console.log(`Parsed stream files: ${parsed} / ${activities.length} (missing: ${skippedNoFile})`);
  return activities;
}

// ---------- main ingest (loose FITs path) ----------

function ingestLooseFits() {
  console.log('Loose FIT mode: reading', path.relative(ROOT, ACTIVITIES_DIR));
  const files = fs
    .readdirSync(ACTIVITIES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.fit'))
    .map((f) => path.join(ACTIVITIES_DIR, f));
  console.log(`Found ${files.length} .fit file(s)`);

  // Two-pass: decode sessions once to collect max HRs, then re-use.
  // Cheap relative to stream decoding.
  const sessionPeek = files.map((f) => {
    try {
      const buf = readMaybeGz(f);
      const dec = new Decoder(FitStream.fromByteArray(buf));
      const { messages } = dec.read({
        applyScaleAndOffset: true,
        convertTypesToStrings: true,
        convertDateTimesToDates: true,
      });
      return messages.sessionMesgs?.[0]?.maxHeartRate;
    } catch { return null; }
  });
  const HR_MAX = HR_MAX_ENV || estimateHrMax(sessionPeek);
  console.log(`HR_MAX = ${HR_MAX} ${HR_MAX_ENV ? '(env)' : '(auto-detected)'}`);

  const activities = [];
  for (const f of files) {
    const stream = parseStream(f);
    if (!stream || stream.sport !== 'running') {
      console.log(`  skip (non-running or parse fail): ${path.basename(f)}`);
      continue;
    }
    // Need session-level summary for these. Re-parse directly since parseFit
    // discards it. Simplest: re-open and pull.
    const buf = readMaybeGz(f);
    const decoder = new Decoder(FitStream.fromByteArray(buf));
    const { messages } = decoder.read({
      applyScaleAndOffset: true,
      convertTypesToStrings: true,
      convertDateTimesToDates: true,
    });
    const session = messages.sessionMesgs?.[0];
    if (!session || session.sport !== 'running') continue;

    const distKm = (session.totalDistance || 0) / 1000;
    const durMin = (session.totalTimerTime || 0) / 60;
    const pace = durMin > 0 && distKm > 0 ? durMin / distKm : 0;
    const dt = new Date(session.startTime);
    const iso = dt.toISOString().slice(0, 10);

    const hrRaw = Number(session.avgHeartRate);
    const maxHrRaw = Number(session.maxHeartRate);
    const elevRaw = Number(session.totalAscent);
    activities.push({
      stravaId: null,
      date: iso,
      dow: dt.getDay(),
      type: inferType({
        name: '', description: '',
        isRace: false, isLong: false, isRecovery: false,
        distKm, durMin,
        avgHr: session.avgHeartRate,
        maxHr: isFinite(maxHrRaw) ? maxHrRaw : null,
        sufferScore: null, // FIT files don't carry Strava's suffer score
        laps: stream.laps,
        hrMax: HR_MAX,
      }),
      distance: +distKm.toFixed(2),
      pace: +pace.toFixed(2),
      duration: +durMin.toFixed(1),
      hr: isFinite(hrRaw) && hrRaw >= 40 ? Math.round(hrRaw) : null,
      elev: isFinite(elevRaw) ? Math.round(elevRaw) : null,
      zones: zonesFromStream(stream.samples, HR_MAX),
      bestSplits: bestSplitsFromStream(stream.samples, SPLIT_TARGETS_KM),
      startLat: stream.startLat,
      startLng: stream.startLng,
      note: '',
    });
  }
  return activities;
}

// ---------- finalize ----------

async function finalize(activities) {
  if (!activities.length) {
    console.error('No runs parsed — nothing to write.');
    process.exit(1);
  }

  activities.sort((a, b) => a.date.localeCompare(b.date));
  const routes = clusterRoutes(activities);
  activities.forEach((a, i) => (a.id = i + 1));

  await applyGeocoding(routes);
  applyManualOverrides(routes, activities);

  // Propagate final route names (post-override) into activities.
  const nameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));
  for (const a of activities) {
    if (nameById[a.routeId]) a.routeName = nameById[a.routeId];
  }

  // PR flag per (routeId, type) — two-pass so the *best* run gets the flag,
  // not the first-seen run. Ties go to the earliest (sort is already ascending).
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

  // Strip internal `start` field from routes before writing JSON.
  const routesOut = routes.map(({ start, ...rest }) => rest);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { runs, routes: routesOut, typeMeta: TYPE_META,
        weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
        prChain, profile: PROFILE, streamsSynced: true },
      null, 2
    )
  );

  console.log(`\nWrote ${runs.length} runs → ${path.relative(ROOT, OUT)}`);
  console.log(`Routes: ${routes.length}`);
  const byType = {};
  for (const r of runs) byType[r.type] = (byType[r.type] || 0) + 1;
  console.log('By type:', byType);
  console.log(`Date range: ${runs[0].date} → ${runs[runs.length - 1].date}`);
}

// ---------- entrypoint ----------

async function main() {
  if (fs.existsSync(STRAVA_CSV)) {
    await finalize(ingestStrava());
  } else if (fs.existsSync(ACTIVITIES_DIR)) {
    await finalize(ingestLooseFits());
  } else {
    console.error('No activities found. Put FIT files in', ACTIVITIES_DIR);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
