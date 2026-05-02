// Shared zoom helper for compact scatter tiles (Aerobic Efficiency + Aerobic
// Endurance). Returns a { xMin, xMax, yMin, yMax } box centered on the two
// centroids, sized to `mult * span` so the arrow stays a consistent fraction
// of the plot regardless of how big or small the centroid-to-centroid jump
// actually is. The min* floors only kick in when the span itself is so close
// to zero that mult*span would degenerate — they protect against single-pixel
// frames, NOT against small-but-real arrows.
//
// Always clamps to the outer (full-data) bounds so we never zoom *beyond*
// the data — keeps the visible frame honest.
export function zoomAround({ cx, cy, spanX, spanY, minSpanX, minSpanY, mult, outer }) {
  const halfX = Math.max(spanX * mult, minSpanX) / 2;
  const halfY = Math.max(spanY * mult, minSpanY) / 2;
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
