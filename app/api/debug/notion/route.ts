import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

export async function GET(request: Request) {
  const key = request.headers.get('x-notion-key') ?? '';
  const dataSourceId = request.headers.get('x-notion-db') ?? '';
  if (!key || !dataSourceId) {
    return NextResponse.json({ error: 'Missing x-notion-key or x-notion-db header' }, { status: 401 });
  }

  const notion = new Client({ auth: key, timeoutMs: 10000 });
  const notionHeaders = {
    Authorization: `Bearer ${key}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const info: Record<string, unknown> = { dataSourceId };

  // 1. Fetch the connector database object via raw REST
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}`, { headers: notionHeaders });
    const raw = await res.json() as Record<string, unknown>;
    info.connectorDb = {
      status: res.status,
      id: raw.id,
      object: raw.object,
      // Dump all top-level keys so we can see if there are source refs
      allKeys: Object.keys(raw),
      // Specifically look for any field that might hold source db ids
      data_sources: raw.data_sources,
      sources: raw.sources,
      connected_sources: raw.connected_sources,
      source_databases: raw.source_databases,
      relations: raw.relations,
    };
  } catch (e) { info.connectorDbError = String(e); }

  // 2. Query dataSources for first 3 pages
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (notion.dataSources as any).query({ data_source_id: dataSourceId, page_size: 3 });
    const pages: Array<Record<string, unknown>> = res.results ?? [];
    info.dataSourcesQuery = {
      totalReturned: pages.length,
      pages: pages.map((p) => ({
        id: p.id,
        object: p.object,
        parent: p.parent,
        allKeys: Object.keys(p),
      })),
    };

    // 3. pages.retrieve on first page
    if (pages[0]) {
      const firstId = pages[0].id as string;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retrieved = await (notion.pages as any).retrieve({ page_id: firstId }) as Record<string, unknown>;
        info.pagesRetrieve = {
          id: retrieved.id,
          parent: retrieved.parent,
          allKeys: Object.keys(retrieved),
        };
      } catch (e) { info.pagesRetrieveError = String(e); }

      // 4. Try pages.create with the parent from dataSources.query result
      const directParent = (pages[0].parent as Record<string, unknown>)?.database_id as string | undefined;
      if (directParent) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (notion.pages as any).create({ parent: { database_id: directParent }, properties: {} });
          info.createTestDirectParent = { id: directParent, result: 'SUCCESS (unexpected!)' };
        } catch (e) { info.createTestDirectParent = { id: directParent, error: String(e) }; }
      }
    }
  } catch (e) { info.dataSourcesQueryError = String(e); }

  // 5. Search all accessible databases
  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({ filter: { property: 'object', value: 'database' }, page_size: 20 }),
    });
    const data = await res.json() as Record<string, unknown>;
    const results = (data.results as Array<Record<string, unknown>>) ?? [];
    info.searchResults = results.map((db) => ({
      id: db.id,
      title: ((db.title as Array<Record<string, unknown>>)?.[0] as Record<string, unknown>)?.plain_text,
      propertyTypes: Object.entries(db.properties as Record<string, unknown> ?? {})
        .map(([k, v]) => `${k}:${(v as Record<string, unknown>)?.type}`)
        .slice(0, 8),
    }));
  } catch (e) { info.searchError = String(e); }

  return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } });
}
