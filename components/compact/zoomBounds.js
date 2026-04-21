// Shared zoom helper for compact scatter tiles (Aerobic Efficiency + Aerobic
// Endurance). Returns a { xMin, xMax, yMin, yMax } box centered on the two
// centroids, sized to `mult * span` with a floor to avoid degenerate zooms.
// Always clamps to the outer (full-data) bounds so we never zoom *beyond*
// the data — keeps the visible frame honest.
export function zoomAround({ cx, cy, spanX, spanY, minSpanX, minSpanY, mult, outer }) {
  const halfX = Math.max(spanX, minSpanX) * mult / 2;
  const halfY = Math.max(spanY, minSpanY) * mult / 2;
  let xMin = cx - halfX;
  let xMax = cx + halfX;
  let yMin = cy - halfY;
  let yMax = cy + halfY;
  if (outer) {
    // Don't pull the zoom tighter than outer, but cap at outer bounds so the
    // tile never implies data exists outside where it actually does.
    xMin = Math.max(xMin, outer.xMin);
    xMax = Math.min(xMax, outer.xMax);
    yMin = Math.max(yMin, outer.yMin);
    yMax = Math.min(yMax, outer.yMax);
  }
  return { xMin, xMax, yMin, yMax };
}
