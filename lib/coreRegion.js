// Core region for a scatter set: the soft shape enclosing the half of a
// set's points that sit closest to its center. Pure; works in screen
// coordinates so the shape matches the current zoom/pan exactly.
//
// points: [{ x, y }] in SVG units. (cx, cy): the set's center, also in SVG
// units (the panels pass the mean so the region and the arrow agree).
// Returns an SVG path `d` string, or null when there are too few points.
export function coreRegion(points, cx, cy) {
  if (!points || points.length < 4) return null;
  const keep = Math.max(3, Math.ceil(points.length / 2));
  const core = points
    .map((p) => ({ x: p.x, y: p.y, d: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, keep)
    .sort((a, b) => a.x - b.x || a.y - b.y);

  // Monotone-chain convex hull.
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of core) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = core.length - 1; i >= 0; i--) {
    const p = core[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return null;

  // Closed Catmull-Rom spline through the hull vertices, emitted as cubic
  // Béziers, so the region reads as a soft blob instead of a polygon.
  const n = hull.length;
  const f = (v) => v.toFixed(1);
  let d = `M${f(hull[0].x)} ${f(hull[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = hull[(i - 1 + n) % n];
    const p1 = hull[i];
    const p2 = hull[(i + 1) % n];
    const p3 = hull[(i + 2) % n];
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} `
      + `${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} `
      + `${f(p2.x)} ${f(p2.y)}`;
  }
  return d + 'Z';
}

// Frame for a compact tile that draws only regions (no dots): spans the
// 5th to 95th percentile of each axis plus padding, so one outlier run
// (a walk, a GPS blip) can't shrink the regions to a speck.
export function robustBounds(xs, ys, { padX = 0.15, padY = 0.15, minX = 0 } = {}) {
  const q = (arr, f) => {
    const s = [...arr].sort((a, b) => a - b);
    const i = (s.length - 1) * f;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const x0 = q(xs, 0.05), x1 = q(xs, 0.95), y0 = q(ys, 0.05), y1 = q(ys, 0.95);
  const dx = (x1 - x0) * padX || 1, dy = (y1 - y0) * padY || 0.2;
  return { xMin: Math.max(minX, x0 - dx), xMax: x1 + dx, yMin: y0 - dy, yMax: y1 + dy };
}
