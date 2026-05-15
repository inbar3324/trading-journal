// Client-side sync helpers — wraps API routes for the weekly summary table.

import type { WColumn } from './weekly-types';
import type { NotionPropValue, NotionPropDef } from './notion-page';
import { getNotionConfig, notionHeaders as buildHeaders } from './notion-config';

interface NotionPageRaw {
  id: string;
  createdTime: string;
  properties: Record<string, NotionPropValue>;
}

interface PullResponse {
  schema: {
    realDbId: string;
    properties: NotionPropDef[];
  };
  pages: NotionPageRaw[];
  orderFromView?: boolean;
}

function headers(): Record<string, string> {
  const cfg = getNotionConfig();
  return { ...buildHeaders(cfg), 'Content-Type': 'application/json' };
}

export async function safeJson<T>(res: Response, fallback: string): Promise<T> {
  const text = await res.text().catch(() => '');
  if (!text) {
    if (res.ok) return {} as T;
    throw new Error(`${fallback} (HTTP ${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.ok) throw new Error(`${fallback} — invalid JSON response`);
    throw new Error(`${fallback} (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }
}

async function callJson<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new Error(`${fallback} — network error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  const data = await safeJson<T & { error?: string }>(res, fallback);
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `${fallback} (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function pullDb(dbId: string): Promise<PullResponse> {
  return callJson<PullResponse>(
    `/api/weekly/db/${dbId}`,
    { headers: headers() },
    'Pull failed',
  );
}

export async function patchDbSchema(
  dbId: string,
  properties: Record<string, unknown>,
): Promise<{ schema: PullResponse['schema'] }> {
  return callJson(
    `/api/weekly/db/${dbId}`,
    { method: 'PATCH', headers: headers(), body: JSON.stringify({ properties }) },
    'Schema update failed',
  );
}

export async function createPage(
  dbId: string,
  columns: WColumn[],
  cells: Record<string, NotionPropValue>,
): Promise<{ page: NotionPageRaw }> {
  return callJson(
    `/api/weekly/db/${dbId}/pages`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ columns, cells }) },
    'Create page failed',
  );
}

export async function updatePage(
  pageId: string,
  columns: WColumn[],
  cells: Record<string, NotionPropValue>,
): Promise<void> {
  await callJson(
    `/api/weekly/page/${pageId}`,
    { method: 'PATCH', headers: headers(), body: JSON.stringify({ columns, cells }) },
    'Update page failed',
  );
}

export async function archivePage(pageId: string): Promise<void> {
  await callJson(
    `/api/weekly/page/${pageId}`,
    { method: 'DELETE', headers: headers() },
    'Archive page failed',
  );
}

// Map Notion prop type → local WColType
export function notionTypeToWColType(t: string): import('./weekly-types').WColType | null {
  switch (t) {
    case 'title':
    case 'rich_text':
      return 'text';
    case 'number': return 'number';
    case 'url': return 'url';
    case 'select': return 'select';
    case 'multi_select': return 'multi_select';
    case 'date': return 'date';
    case 'checkbox': return 'checkbox';
    case 'files': return 'files';
    default: return null;
  }
}
