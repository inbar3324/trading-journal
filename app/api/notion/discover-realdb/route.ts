import { NextRequest, NextResponse } from 'next/server';
import { discoverRealDbId } from '@/lib/notion';

export async function POST(req: NextRequest) {
  try {
    const { key, dbId } = await req.json() as { key: string; dbId: string };
    if (!key || !dbId) {
      return NextResponse.json({ error: 'Missing key or dbId' }, { status: 400 });
    }
    const realDbId = await discoverRealDbId(key, dbId);
    return NextResponse.json({ realDbId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
