import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const size = Math.min(512, Math.max(16, parseInt(searchParams.get('size') ?? '512')));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#F4F0E7',
          borderRadius: size * 0.18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 512 512">
          <path d="M126 130 344 27c19-9 40 5 40 26v175c0 14-7 26-19 32L128 394c-16 9-36-3-36-22V176c0-19 14-38 34-46Z" fill="#171719" />
          <path d="m297 300 87-49v99c0 22-23 35-42 24l-58-34c-16-10-14-31 13-40Z" fill="#E8A820" />
          <path d="m130 382 90-47c13-7 28-7 40 1l199 108c11 6 17 18 17 30 0 24-22 40-45 34L126 426c-22-6-25-33 4-44Z" fill="#171719" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  );
}
