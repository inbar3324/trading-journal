import { NextRequest, NextResponse } from 'next/server';
import { parseDbSchema, parsePage, applyViewOrder } from '@/lib/notion-page';
import { notionHeaders, resolveDataSourceId } from '@/lib/weekly-notion';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dbId: string }> },
) {
  try {
    const { dbId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const headers = notionHeaders(key);
    const dataSourceId = await resolveDataSourceId(dbId, key);

    // Schema lives on the data source (Notion 2025-09-03)
    const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, { headers });
    if (!dsRes.ok) {
      const err = await dsRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to load data source' },
        { status: dsRes.status },
      );
    }
    const dsRaw = await dsRes.json() as Record<string, unknown>;
    const { schema, orderFromView } = await applyViewOrder(parseDbSchema(dsRaw), dataSourceId, key);

    const pages: ReturnType<typeof parsePage>[] = [];
    let cursor: string | undefined;
    do {
      // Always request ascending by created_time; post-sort below handles any API non-compliance.
      const body: Record<string, unknown> = {
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      };
      if (cursor) body.start_cursor = cursor;
      const qRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!qRes.ok) break;
      const data = await qRes.json() as { results?: Array<Record<string, unknown>>; next_cursor?: string | null };
      for (const r of data.results ?? []) {
        if (r.archived) continue;
        pages.push(parsePage(r));
      }
      cursor = data.next_cursor ?? undefined;
    } while (cursor);

    // Notion's data_sources query returns newest-first regardless of `sorts`, and rows created in
    // the same second share identical `created_time`. Sort ascending; tiebreak by reverse API index
    // so equal-time rows flip from newest-first (API) to oldest-first (Notion view order).
    const indexed = pages.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => {
      const at = a.p.createdTime || '9999';
      const bt = b.p.createdTime || '9999';
      if (at !== bt) return at < bt ? -1 : 1;
      return b.i - a.i;
    });
    const sortedPages = indexed.map(x => x.p);
    return NextResponse.json({ schema, pages: sortedPages, orderFromView });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dbId: string }> },
) {
  try {
    const { dbId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const body = await req.json() as { properties: Record<string, unknown> };
    if (!body.properties) {
      return NextResponse.json({ error: 'Missing properties' }, { status: 400 });
    }

    const dataSourceId = await resolveDataSourceId(dbId, key);
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, {
      method: 'PATCH',
      headers: notionHeaders(key),
      body: JSON.stringify({ properties: body.properties }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to update schema' },
        { status: res.status },
      );
    }
    const dsRaw = await res.json() as Record<string, unknown>;
    const { schema } = await applyViewOrder(parseDbSchema(dsRaw), dataSourceId, key);
    return NextResponse.json({ schema });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
