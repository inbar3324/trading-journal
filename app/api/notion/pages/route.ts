import { NextResponse } from 'next/server';
import { getAllPages, getDbSchema } from '@/lib/notion-page';

export async function GET(request: Request) {
  const key = request.headers.get('x-notion-key') ?? undefined;
  const dbId = request.headers.get('x-notion-db') ?? undefined;
  const realDbHeader = request.headers.get('x-notion-realdb') ?? undefined;
  if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
  try {
    const [{ pages, realDbId }, schema] = await Promise.all([
      getAllPages({ key, dbId }),
      getDbSchema({ key, dbId, realDbId: realDbHeader }),
    ]);
    return NextResponse.json(
      { pages, schema, realDbId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notion/pages] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
