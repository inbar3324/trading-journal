import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { parseTrade, extractFilePropNames, updateTrade, archiveTrade } from '@/lib/notion';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
    const notion = new Client({ auth: key, timeoutMs: 8000 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (notion.pages as any).retrieve({ page_id: id }) as Record<string, unknown>;
    const trade = parseTrade(page);
    const filePropNames = extractFilePropNames(page);
    return NextResponse.json({ trade, filePropNames });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
    const trade = await updateTrade(id, body, { key, dbId });
    return NextResponse.json({ trade });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
    if (!key) return NextResponse.json({ error: 'Missing Notion token' }, { status: 401 });
    await archiveTrade(id, { key, dbId });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
