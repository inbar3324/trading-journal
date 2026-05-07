import { NextResponse } from 'next/server';
import { getAllTrades } from '@/lib/notion';

export async function GET(request: Request) {
  const key  = request.headers.get('x-notion-key')  ?? undefined;
  const dbId = request.headers.get('x-notion-db')   ?? undefined;
  try {
    const { trades, realDbId, dbTitle } = await getAllTrades({ key, dbId });
    return NextResponse.json({ trades, realDbId, dbTitle }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Notion fetch error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
