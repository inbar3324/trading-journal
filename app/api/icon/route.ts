import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const size = Math.min(512, Math.max(16, parseInt(searchParams.get('size') ?? '512')));
  const pad = size * 0.18;
  const scale = size / 120;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#0E0E11',
          borderRadius: size * 0.18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Three rising candlesticks */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: scale * 8, paddingBottom: pad * 0.3 }}>
          {/* Candle 1 — short */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: scale * 2, height: scale * 6, background: '#F5C84A', borderRadius: scale }} />
            <div style={{ width: scale * 14, height: scale * 18, background: 'rgba(232,168,32,0.75)', borderRadius: scale * 2 }} />
            <div style={{ width: scale * 2, height: scale * 6, background: '#F5C84A', borderRadius: scale }} />
          </div>
          {/* Candle 2 — medium */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: scale * 2, height: scale * 8, background: '#F5C84A', borderRadius: scale }} />
            <div style={{ width: scale * 14, height: scale * 28, background: 'rgba(232,168,32,0.88)', borderRadius: scale * 2 }} />
            <div style={{ width: scale * 2, height: scale * 6, background: '#F5C84A', borderRadius: scale }} />
          </div>
          {/* Candle 3 — tall */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: scale * 2, height: scale * 6, background: '#F5C84A', borderRadius: scale }} />
            <div style={{ width: scale * 14, height: scale * 42, background: '#F5C84A', borderRadius: scale * 2 }} />
            <div style={{ width: scale * 2, height: scale * 6, background: '#F5C84A', borderRadius: scale }} />
          </div>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
