import { NextRequest, NextResponse } from 'next/server';
import type { WColumn } from '@/lib/weekly-types';
import type { NotionPropValue } from '@/lib/notion-page';
import { buildPageProperties, notionHeaders } from '@/lib/weekly-notion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  try {
    const { pageId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const body = await req.json() as { columns: WColumn[]; cells: Record<string, NotionPropValue> };

    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: notionHeaders(key),
      body: JSON.stringify({
        properties: buildPageProperties(body.columns, body.cells ?? {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to update page' },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  try {
    const { pageId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: notionHeaders(key),
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to archive page' },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
