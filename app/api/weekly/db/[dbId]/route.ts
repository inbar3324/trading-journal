import { NextRequest, NextResponse } from 'next/server';
import { parseDbSchema, parsePage, type NotionPage } from '@/lib/notion-page';
import { notionHeaders, resolveDataSourceId } from '@/lib/weekly-notion';
import { WEEKLY_ORDER_PROPERTY, matchesProperty, visibleViewSchema, sharedViewConfig, reorderedViewColumns, type WeeklyView as NotionView } from '@/lib/weekly-view-order';

interface ViewQueryPage {
  id: string;
}

interface ViewQueryResponse {
  id?: string;
  results?: ViewQueryPage[];
  next_cursor?: string | null;
  has_more?: boolean;
  request_status?: { type?: string; incomplete_reason?: string };
}

async function notionJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message ?? `${fallback} (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

function getDatabaseId(raw: Record<string, unknown>): string | null {
  const databaseParent = raw.database_parent as Record<string, unknown> | undefined;
  const parent = raw.parent as Record<string, unknown> | undefined;
  return (databaseParent?.database_id as string | undefined)
    ?? (parent?.database_id as string | undefined)
    ?? null;
}

async function retrieveTableView(
  viewId: string,
  databaseId: string,
  headers: Record<string, string>,
): Promise<NotionView | null> {
  const res = await fetch(`https://api.notion.com/v1/views/${viewId}`, { headers });
  if (res.status === 404) return null;
  const view = await notionJson<NotionView>(res, 'Failed to retrieve Notion view');
  if (view.type !== 'table') return null;
  const expected = databaseId.replaceAll('-', '');
  const actual = view.parent?.database_id?.replaceAll('-', '');
  return !actual || actual === expected ? view : null;
}

async function resolveTableView(
  databaseId: string,
  headers: Record<string, string>,
  preferredViewId?: string | null,
): Promise<NotionView> {
  if (preferredViewId) {
    const preferred = await retrieveTableView(preferredViewId, databaseId, headers);
    if (preferred) return preferred;
  }

  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ database_id: databaseId, page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const list = await notionJson<{
      results?: Array<{ id?: string }>;
      next_cursor?: string | null;
      has_more?: boolean;
    }>(
      await fetch(`https://api.notion.com/v1/views?${params.toString()}`, { headers }),
      'Failed to list Notion views',
    );
    for (const ref of list.results ?? []) {
      if (!ref.id) continue;
      const view = await retrieveTableView(ref.id, databaseId, headers);
      if (view) return view;
    }
    cursor = list.has_more ? list.next_cursor ?? undefined : undefined;
  } while (cursor);

  throw new Error('No accessible table view was found for this Notion database');
}

function assertCompleteViewQuery(data: ViewQueryResponse): void {
  if (data.request_status?.type === 'incomplete') {
    throw new Error(data.request_status.incomplete_reason ?? 'Notion view query was incomplete');
  }
}

async function queryViewPageIds(viewId: string, headers: Record<string, string>): Promise<string[]> {
  const first = await notionJson<ViewQueryResponse>(
    await fetch(`https://api.notion.com/v1/views/${viewId}/queries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 100 }),
    }),
    'Failed to query Notion view',
  );
  if (!first.id) throw new Error('Notion view query returned no query ID');

  const queryId = first.id;
  const pageIds: string[] = [];
  try {
    assertCompleteViewQuery(first);
    pageIds.push(...(first.results ?? []).map(page => page.id).filter(Boolean));
    let cursor = first.has_more ? first.next_cursor ?? undefined : undefined;
    while (cursor) {
      const params = new URLSearchParams({ start_cursor: cursor, page_size: '100' });
      const next = await notionJson<ViewQueryResponse>(
        await fetch(`https://api.notion.com/v1/views/${viewId}/queries/${queryId}?${params.toString()}`, { headers }),
        'Failed to paginate Notion view query',
      );
      assertCompleteViewQuery(next);
      pageIds.push(...(next.results ?? []).map(page => page.id).filter(Boolean));
      cursor = next.has_more ? next.next_cursor ?? undefined : undefined;
    }
  } finally {
    await fetch(`https://api.notion.com/v1/views/${viewId}/queries/${queryId}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }

  return [...new Set(pageIds)];
}

async function fetchPagesInViewOrder(
  dataSourceId: string,
  pageIds: string[],
  headers: Record<string, string>,
): Promise<NotionPage[]> {
  const pagesById = new Map<string, NotionPage>();
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionJson<{
      results?: Array<Record<string, unknown>>;
      next_cursor?: string | null;
      has_more?: boolean;
    }>(
      await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      'Failed to load Notion rows',
    );
    for (const raw of data.results ?? []) {
      if (raw.archived || raw.in_trash) continue;
      const page = parsePage(raw);
      pagesById.set(page.id, page);
    }
    cursor = data.has_more ? data.next_cursor ?? undefined : undefined;
  } while (cursor);

  for (const pageId of pageIds) {
    if (pagesById.has(pageId)) continue;
    const raw = await notionJson<Record<string, unknown>>(
      await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers }),
      `Failed to retrieve Notion row ${pageId}`,
    );
    if (raw.archived || raw.in_trash) continue;
    const page = parsePage(raw);
    pagesById.set(page.id, page);
  }

  return pageIds.map(pageId => pagesById.get(pageId)).filter((page): page is NotionPage => Boolean(page));
}

async function loadTable(
  req: NextRequest,
  { params }: { params: Promise<{ dbId: string }> },
  synchronize: boolean,
) {
  try {
    const { dbId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const headers = notionHeaders(key);
    const dataSourceId = await resolveDataSourceId(dbId, key);

    const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, { headers });
    if (!dsRes.ok) {
      const err = await dsRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to load data source' },
        { status: dsRes.status },
      );
    }
    let dsRaw = await dsRes.json() as Record<string, unknown>;
    const databaseId = getDatabaseId(dsRaw);
    if (!databaseId) throw new Error('Could not resolve the parent Notion database');
    let view = await resolveTableView(databaseId, headers, req.nextUrl.searchParams.get('viewId'));
    if (view.data_source_id && view.data_source_id.replaceAll('-', '') !== dataSourceId.replaceAll('-', '')) {
      throw new Error('The selected Notion view belongs to a different data source');
    }
    let fullSchema = parseDbSchema(dsRaw);
    let order = fullSchema.properties.find(p => p.name === WEEKLY_ORDER_PROPERTY);
    if (synchronize && !order) {
      dsRaw = await notionJson<Record<string, unknown>>(await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ properties: { [WEEKLY_ORDER_PROPERTY]: { unique_id: {} } } }),
      }), 'Failed to configure shared row order');
      fullSchema = parseDbSchema(dsRaw);
      order = fullSchema.properties.find(p => p.name === WEEKLY_ORDER_PROPERTY);
    }
    if (!order || order.type !== 'unique_id') throw new Error('Shared Notion row order is not configured. Synchronize the table first.');
    if (synchronize) {
      const update = sharedViewConfig(fullSchema, view, order);
      if (!view.sorts?.some(sort => matchesProperty(sort.property, order!)) ||
          !view.configuration?.properties?.some(p => matchesProperty(p.property_id, order!) && p.visible === false)) {
        await notionJson(await fetch(`https://api.notion.com/v1/views/${view.id}`, {
          method: 'PATCH', headers, body: JSON.stringify(update),
        }), 'Failed to save the shared Notion sort');
        view = { ...view, ...update };
      }
    }
    if (!view.sorts?.some(sort => matchesProperty(sort.property, order!))) {
      throw new Error('Notion row sorting changed. Synchronize the table before refreshing.');
    }
    const schema = visibleViewSchema(fullSchema, view);
    const pageIds = await queryViewPageIds(view.id, headers);
    const pages = await fetchPagesInViewOrder(dataSourceId, pageIds, headers);
    return NextResponse.json({ schema, pages, orderFromView: true, viewId: view.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ dbId: string }> }) {
  return loadTable(req, context, false);
}

export async function POST(req: NextRequest, context: { params: Promise<{ dbId: string }> }) {
  return loadTable(req, context, true);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dbId: string }> },
) {
  try {
    const { dbId } = await params;
    const key = req.headers.get('x-notion-key');
    if (!key) return NextResponse.json({ error: 'Missing Notion key' }, { status: 401 });

    const body = await req.json() as { properties?: Record<string, unknown>; columnIds?: string[]; viewId?: string };
    const dataSourceId = await resolveDataSourceId(dbId, key);
    if (body.columnIds) {
      const headers = notionHeaders(key);
      const raw = await notionJson<Record<string, unknown>>(
        await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, { headers }), 'Failed to load columns');
      const databaseId = getDatabaseId(raw);
      if (!databaseId) throw new Error('Could not resolve the parent Notion database');
      const view = await resolveTableView(databaseId, headers, body.viewId);
      const configuration = reorderedViewColumns(parseDbSchema(raw), view, body.columnIds);
      await notionJson(await fetch(`https://api.notion.com/v1/views/${view.id}`, {
        method: 'PATCH', headers, body: JSON.stringify({ configuration }),
      }), 'Failed to save Notion column order');
      return NextResponse.json({ ok: true, viewId: view.id });
    }
    if (!body.properties) {
      return NextResponse.json({ error: 'Missing properties' }, { status: 400 });
    }

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
    return NextResponse.json({ schema: parseDbSchema(dsRaw) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
