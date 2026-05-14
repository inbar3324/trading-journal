// Shared helpers for Weekly Summary ↔ Notion sync.

import type { NotionPropValue } from './notion-page';
import type { WColType, WColumn } from './weekly-types';

export const NOTION_VERSION = '2025-09-03';

// ── WColType ↔ Notion property type ──────────────────────────────────────────

export function colTypeToNotionType(t: WColType): string {
  return t === 'text' ? 'rich_text' : t;
}

// ── WColumn → Notion DB schema entry ─────────────────────────────────────────

export function colToSchemaEntry(col: WColumn, isTitle: boolean): unknown {
  if (isTitle) return { title: {} };
  switch (col.type) {
    case 'text': return { rich_text: {} };
    case 'number': return { number: { format: 'number' } };
    case 'url': return { url: {} };
    case 'date': return { date: {} };
    case 'checkbox': return { checkbox: {} };
    case 'files': return { files: {} };
    case 'select':
      return { select: { options: (col.options ?? []).map(o => ({ name: o.name, color: o.color ?? 'default' })) } };
    case 'multi_select':
      return { multi_select: { options: (col.options ?? []).map(o => ({ name: o.name, color: o.color ?? 'default' })) } };
  }
}

// ── Cell value → Notion page property body ───────────────────────────────────

export function valueToPageProp(value: NotionPropValue, isTitle: boolean): unknown {
  if (isTitle) {
    const text = (value as { text?: string }).text ?? '';
    return { title: text ? [{ text: { content: text } }] : [] };
  }
  switch (value.type) {
    case 'title':
    case 'rich_text':
      return { rich_text: value.text ? [{ text: { content: value.text } }] : [] };
    case 'number':
      return { number: value.value };
    case 'url':
      return { url: value.value };
    case 'date':
      return value.start
        ? { date: { start: value.start, ...(value.end ? { end: value.end } : {}) } }
        : { date: null };
    case 'checkbox':
      return { checkbox: value.value };
    case 'select':
      return { select: value.option ? { name: value.option.name } : null };
    case 'multi_select':
      return { multi_select: value.options.map(o => ({ name: o.name })) };
    case 'files':
      return { files: value.files.map(f => ({ name: f.name, external: { url: f.url } })) };
    default:
      return null;
  }
}

// ── Build full DB schema from columns ────────────────────────────────────────

export function buildDbProperties(columns: WColumn[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    props[col.name] = colToSchemaEntry(col, idx === 0);
  });
  return props;
}

// ── Build page properties body from row cells ────────────────────────────────

// Strip empty cells so new rows reach Notion without forcing a sort position
// (mirrors the JOURNAL commitInline filter in app/journal/page.tsx).
function isEmptyCell(cell: NotionPropValue): boolean {
  switch (cell.type) {
    case 'title':
    case 'rich_text': return !cell.text;
    case 'multi_select': return cell.options.length === 0;
    case 'select':
    case 'status': return !cell.option;
    case 'date': return !cell.start;
    case 'url':
    case 'email':
    case 'phone_number': return !cell.value;
    case 'number': return cell.value === null;
    case 'checkbox': return cell.value === false;
    case 'files': return cell.files.length === 0;
    default: return false;
  }
}

export function buildPageProperties(
  columns: WColumn[],
  cells: Record<string, NotionPropValue>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    const cell = cells[col.id];
    if (!cell) return;
    if (isEmptyCell(cell)) return;
    const isTitle = col.notionType ? col.notionType === 'title' : idx === 0;
    const v = valueToPageProp(cell, isTitle);
    if (v !== null && v !== undefined) props[col.name] = v;
  });
  return props;
}

// ── Notion fetch helper ──────────────────────────────────────────────────────

export function notionHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

// Resolves a stored id (either a database_id or a data_source_id) to the
// data_source_id required by Notion 2025-09-03 read/schema endpoints.
export async function resolveDataSourceId(id: string, key: string): Promise<string> {
  const headers = notionHeaders(key);
  // 1) Already a data_source_id?
  const dsRes = await fetch(`https://api.notion.com/v1/data_sources/${id}`, { headers });
  if (dsRes.ok) return id;
  // 2) Treat as database_id and read its first data source.
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
  if (!dbRes.ok) {
    const err = await dbRes.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `Failed to resolve data source for ${id}`);
  }
  const db = await dbRes.json() as { data_sources?: Array<{ id: string }> };
  const dsId = db.data_sources?.[0]?.id;
  if (!dsId) throw new Error('Database has no data source');
  return dsId;
}
