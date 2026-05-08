import { NextRequest, NextResponse } from 'next/server';
import { createPage } from '@/lib/notion-page';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { realDbId, patch } = body as { realDbId?: string; patch: Record<string, unknown> };
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
    const page = await createPage(
      patch as Parameters<typeof createPage>[0],
      { key, dbId },
      realDbId,
    );
    return NextResponse.json({ page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[notion/pages/create] FAILED:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
