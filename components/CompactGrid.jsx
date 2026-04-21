'use client';

// 3x3 CSS Grid for the compact dashboard view. Tiles are equal-sized cells;
// each tile clips its own overflow — if content doesn't fit, that's a signal
// to tighten the compact variant, not to add scroll.
//
// Sized to fit within a reasonable desktop viewport without scrolling: on a
// 1440x900 screen, the header eats ~140px and body padding eats the rest,
// leaving ~640px of grid height, so three rows of ~200px tiles. We let the
// grid flex with the viewport rather than hard-coding the height.
export default function CompactGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(3, minmax(200px, 1fr))',
        gap: 14,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}
