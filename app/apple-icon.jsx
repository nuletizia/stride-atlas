import { ImageResponse } from 'next/og';

// 180x180 PNG generated at build time for iOS home-screen bookmarks.
// Same design as /icon.svg (3 ascending orange bars on ink) but rendered
// at the size iOS expects. Other platforms use icon.svg directly.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#1A1A17',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '22px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ flex: 1, height: '34%', background: '#C4502A', borderRadius: 6 }} />
          <div style={{ flex: 1, height: '62%', background: '#C4502A', borderRadius: 6 }} />
          <div style={{ flex: 1, height: '95%', background: '#C4502A', borderRadius: 6 }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
