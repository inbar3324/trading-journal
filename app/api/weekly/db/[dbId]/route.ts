import { NextRequest, NextResponse } from 'next/server';
import { parseDbSchema, parsePage, applyViewOrder, type NotionPage, type NotionPropValue } from '@/lib/notion-page';
import { notionHeaders, resolveDataSourceId } from '@/lib/weekly-notion';

// Extract a sort key from a page property value (for client-side sort fallback).
function getSortKey(page: NotionPage, sort: Record<string, unknown>): string | number {
  if (sort.timestamp === 'created_time') return page.createdTime;
  if (sort.timestamp === 'last_edited_time') return page.lastEditedTime;
  const propName = sort.property as string | undefined;
  if (!propName) return '';
  const val: NotionPropValue | undefined = page.properties[propName];
  if (!val) return '';
  switch (val.type) {
    case 'date': return val.start ?? '';
    case 'number': return val.value ?? 0;
    case 'title': case 'rich_text': return val.text;
    case 'select': case 'status': return val.option?.name ?? '';
    case 'created_time': case 'last_edited_time': return val.value;
    case 'checkbox': return val.value ? '1' : '0';
    default: return '';
  }
}

// Sort pages client-side by an array of sort descriptors.
// Nulls/empty values are sorted LAST (ascending direction).
// IMPORTANT: For tied values, returns 0 (stable sort) so we preserve Notion's
// API response order — Notion already applies the view's tiebreak there, and
// forcing a local tiebreak (e.g. created_time ASC) makes the website diverge
// from Notion's UI when the view tiebreaks differently. This is the fix for
// the W.SUMMARY "last two rows swapped" bug.
function clientSort(pages: NotionPage[], sorts: Array<Record<string, unknown>>): NotionPage[] {
  return [...pages].sort((a, b) => {
    for (const s of sorts) {
      const ak = getSortKey(a, s);
      const bk = getSortKey(b, s);
      const dir = (s.direction as string) === 'descending' ? -1 : 1;
      const aEmpty = ak === '' || ak === 0;
      const bEmpty = bk === '' || bk === 0;
      if (aEmpty && bEmpty) continue;
      if (aEmpty) return 1;   // nulls last regardless of direction
      if (bEmpty) return -1;
      if (typeof ak === 'number' && typeof bk === 'number') {
        if (ak !== bk) return (ak < bk ? -1 : 1) * dir;
      } else {
        const cmp = String(ak).localeCompare(String(bk));
        if (cmp !== 0) return cmp * dir;
      }
    }
    // Stable: preserve API order when all sort keys tie.
    return 0;
  });
}

// Use Notion view sorts when available so the website mirrors Notion 1:1.
// Falls back to `created_time ascending` (JOURNAL default: oldest first, newest last).
function resolveSorts(viewSorts: Array<Record<string, unknown>>): {
  apiSorts: Array<Record<string, unknown>>;
  sorts: Array<Record<string, unknown>>;
} {
  if (viewSorts.length > 0) return { apiSorts: viewSorts, sorts: viewSorts };
  const createdTimeSort = [{ timestamp: 'created_time', direction: 'ascending' }];
  return { apiSorts: createdTimeSort, sorts: createdTimeSort };
}

async function fetchAllPages(
  dataSourceId: string,
  headers: Record<string, string>,
  viewSorts: Array<Record<string, unknown>>,
): Promise<NotionPage[]> {
  const { apiSorts, sorts } = resolveSorts(viewSorts);
  const pages: NotionPage[] = [];

  // Primary: data_sources query (Notion 2025-09-03)
  let cursor: string | undefined;
  try {
    do {
      const body: Record<string, unknown> = { page_size: 100, sorts: apiSorts };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json() as { results?: Array<Record<string, unknown>>; next_cursor?: string | null };
      for (const r of data.results ?? []) {
        if (r.archived) continue;
        pages.push(parsePage(r));
      }
      cursor = data.next_cursor ?? undefined;
    } while (cursor);
  } catch { /* try fallback */ }

  // Fallback: direct databases query (same as getAllPages in notion-page.ts)
  if (pages.length === 0) {
    let dbCursor: string | undefined;
    try {
      do {
        const body: Record<string, unknown> = { page_size: 100, sorts: apiSorts };
        if (dbCursor) body.start_cursor = dbCursor;
        const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
        if (!res.ok) break;
        const data = await res.json() as { results?: Array<Record<string, unknown>>; next_cursor?: string | null };
        for (const r of data.results ?? []) pages.push(parsePage(r));
        dbCursor = data.next_cursor ?? undefined;
      } while (dbCursor);
    } catch { /* ignore */ }
  }

  // Client-side sort ensures correct order even when API ignores timestamp sorts
  return clientSort(pages, sorts);
}

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

    const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}`, { headers });
    if (!dsRes.ok) {
      const err = await dsRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message ?? 'Failed to load data source' },
        { status: dsRes.status },
      );
    }
    const dsRaw = await dsRes.json() as Record<string, unknown>;
    const { schema, viewSorts, orderFromView } = await applyViewOrder(parseDbSchema(dsRaw), dataSourceId, key);

    const pages = await fetchAllPages(dataSourceId, headers, viewSorts);
    return NextResponse.json({ schema, pages, orderFromView });
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
