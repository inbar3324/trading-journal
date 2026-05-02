import { NextRequest, NextResponse } from 'next/server';
import { createTrade } from '@/lib/notion';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    const trade = await createTrade(body, { key, dbId });
    return NextResponse.json({ trade });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
