import { NextRequest, NextResponse } from 'next/server';
import type { WColumn } from '@/lib/weekly-types';
import type { NotionPropValue } from '@/lib/notion-page';
import { buildPageProperties, notionHeaders, resolveDataSourceId } from '@/lib/weekly-notion';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ dbId: string }> },
) {
  try {
    const { dbId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const body = await req.json() as { columns: WColumn[]; cells: Record<string, NotionPropValue> };
    if (!body.columns?.length) return NextResponse.json({ error: 'No columns' }, { status: 400 });

    const dataSourceId = await resolveDataSourceId(dbId, key);
    const properties = buildPageProperties(body.columns, body.cells ?? {});

    // Notion 2025-09-03: prefer data_source_id parent; fall back to database_id.
    let res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(key),
      body: JSON.stringify({
        parent: { data_source_id: dataSourceId },
        properties,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      const isParentErr =
        err.message?.includes('data_source') || err.message?.includes('parent');
      if (!isParentErr) {
        return NextResponse.json({ error: err.message ?? 'Failed to create page' }, { status: res.status });
      }
      res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: notionHeaders(key),
        body: JSON.stringify({
          parent: { database_id: dbId },
          properties,
        }),
      });
      if (!res.ok) {
        const err2 = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: (err2 as { message?: string }).message ?? 'Failed to create page' },
          { status: res.status },
        );
      }
    }
    const page = await res.json() as { id: string };
    return NextResponse.json({ pageId: page.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
