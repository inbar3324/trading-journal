import { NextRequest, NextResponse } from 'next/server';
import { getSchema } from '@/lib/notion';

export async function GET(req: NextRequest) {
  try {
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    const schema = await getSchema({ key, dbId });
    return NextResponse.json({ schema });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
