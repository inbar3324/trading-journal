import { NextRequest, NextResponse } from 'next/server';
import { createTrade } from '@/lib/notion';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { realDbId, ...input } = body;
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
    console.log('[create] input:', JSON.stringify({ notes: input.notes, date: input.date, realDbId }));
    const trade = await createTrade(input, { key, dbId }, realDbId as string | undefined);
    console.log('[create] success → trade.id:', trade.id, 'notes:', trade.notes);
    return NextResponse.json({ trade });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[create] FAILED:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
