import { NextRequest, NextResponse } from 'next/server';
import type { WColumn, WRow } from '@/lib/weekly-types';
import { buildDbProperties, buildPageProperties, notionHeaders } from '@/lib/weekly-notion';

async function readNotionError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return `HTTP ${res.status}`;
  try {
    const err = JSON.parse(text) as { message?: string; code?: string };
    return err.message ? (err.code ? `${err.code}: ${err.message}` : err.message) : `HTTP ${res.status}: ${text.slice(0, 200)}`;
  } catch {
    return `HTTP ${res.status}: ${text.slice(0, 200)}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    let body: { columns: WColumn[]; rows: WRow[]; parentPageId: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { columns, rows, parentPageId } = body;
    if (!parentPageId) return NextResponse.json({ error: 'Missing parentPageId' }, { status: 400 });
    if (!columns?.length) return NextResponse.json({ error: 'No columns defined' }, { status: 400 });

    const headers = notionHeaders(key);
    const dbProps = buildDbProperties(columns);

    // 1. Create database. The Notion DB-create endpoint changed in 2025-09-03
    // (now expects `initial_data_source.properties`). Try the new format first,
    // then fall back to the legacy `properties` field used by 2022-06-28.
    const createNew = {
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: 'WEEKLY SUMMARY' } }],
      initial_data_source: { properties: dbProps },
    };
    let dbRes = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers,
      body: JSON.stringify(createNew),
    });
    if (!dbRes.ok) {
      const newFmtMsg = await readNotionError(dbRes);
      console.warn('[weekly/export] Create DB (new fmt) failed:', newFmtMsg, '— retrying with 2022-06-28 legacy format');
      const legacyHeaders: Record<string, string> = {
        Authorization: `Bearer ${key}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      };
      const createLegacy = {
        parent: { type: 'page_id', page_id: parentPageId },
        title: [{ type: 'text', text: { content: 'WEEKLY SUMMARY' } }],
        properties: dbProps,
      };
      dbRes = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: legacyHeaders,
        body: JSON.stringify(createLegacy),
      });
      if (!dbRes.ok) {
        const legacyMsg = await readNotionError(dbRes);
        console.error('[weekly/export] Create DB (legacy fmt) also failed:', legacyMsg);
        return NextResponse.json({ error: `Notion: ${legacyMsg}` }, { status: 502 });
      }
    }

    const dbText = await dbRes.text();
    let db: {
      id: string;
      url: string;
      properties?: Record<string, { id: string; name: string; type: string }>;
      data_sources?: Array<{ id: string; properties?: Record<string, { id: string; name: string; type: string }> }>;
    };
    try {
      db = JSON.parse(dbText);
    } catch {
      console.error('[weekly/export] Failed to parse DB response:', dbText.slice(0, 500));
      return NextResponse.json({ error: 'Notion returned invalid JSON for DB create' }, { status: 502 });
    }
    if (!db.id) {
      console.error('[weekly/export] DB create returned no id:', dbText.slice(0, 500));
      return NextResponse.json({ error: 'Notion DB create returned no id' }, { status: 502 });
    }

    // 2. Build column → notionPropId map (handle both 2022-06-28 and 2025-09-03 response shapes)
    const responseProps =
      db.properties ??
      db.data_sources?.[0]?.properties ??
      {};
    const propIdByName: Record<string, string> = {};
    for (const [, p] of Object.entries(responseProps)) {
      if (p?.name && p?.id) propIdByName[p.name] = p.id;
    }
    const columnPropIds: Record<string, string> = {};
    for (const col of columns) {
      if (propIdByName[col.name]) columnPropIds[col.id] = propIdByName[col.name];
    }

    // 3. Create rows
    const rowPageIds: Record<string, string> = {};
    for (const row of rows ?? []) {
      try {
        const pageRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: db.id },
            properties: buildPageProperties(columns, row.cells),
          }),
        });
        if (pageRes.ok) {
          const pageText = await pageRes.text();
          try {
            const page = JSON.parse(pageText) as { id: string };
            if (page.id) rowPageIds[row.id] = page.id;
          } catch { /* skip */ }
        } else {
          const msg = await readNotionError(pageRes);
          console.warn('[weekly/export] Failed to create page for row', row.id, ':', msg);
        }
      } catch (e) {
        console.warn('[weekly/export] Exception creating page for row', row.id, ':', e);
      }
    }

    return NextResponse.json({
      url: db.url,
      dbId: db.id,
      columnPropIds,
      rowPageIds,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown server error';
    console.error('[weekly/export] Unhandled error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
