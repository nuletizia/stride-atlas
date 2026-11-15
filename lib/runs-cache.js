// Per-athlete in-memory cache of the built STRIDE_DATA payload. Server only.
// Lives in its own module so /api/runs (writer) and /api/auth/logout
// (eviction on disconnect) share the same Map on a warm instance.
// Cold starts throw it away; that's fine.

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, well under Strava's 7-day cap
const cache = new Map(); // athleteId -> { data, fetchedAt }

export function getCachedRuns(athleteId) {
  const hit = cache.get(athleteId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    cache.delete(athleteId);
    return null;
  }
  return hit.data;
}

export function setCachedRuns(athleteId, data) {
  cache.set(athleteId, { data, fetchedAt: Date.now() });
}

export function evictCachedRuns(athleteId) {
  cache.delete(athleteId);
}
