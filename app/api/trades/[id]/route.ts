import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@notionhq/client';
import { parseTrade, extractFilePropNames, updateTrade, archiveTrade } from '@/lib/notion';

const DEFAULT_DB_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = req.headers.get('x-notion-key') ?? undefined;
    const notion = new Client({ auth: key ?? process.env.NOTION_API_KEY, timeoutMs: 8000 });
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

void DEFAULT_DB_ID;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const key = req.headers.get('x-notion-key') ?? undefined;
    const dbId = req.headers.get('x-notion-db') ?? undefined;
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
    await archiveTrade(id, { key, dbId });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
