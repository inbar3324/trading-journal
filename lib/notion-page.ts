// Generic Notion page + schema layer for the journal mirror.
// Independent from lib/notion.ts (which keeps the trade-typed model used by analytics).

import { Client } from '@notionhq/client';
import { discoverRealDbId } from './notion';

const NOTION_VERSION = '2025-09-03';

// ── Types ────────────────────────────────────────────────────────────────────

export type NotionColor =
  | 'default' | 'gray' | 'brown' | 'orange' | 'yellow'
  | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export interface SelectOption { id?: string; name: string; color?: NotionColor }
export interface PersonRef { id: string; name?: string; avatar_url?: string }
export interface FileRef { name: string; url: string; external: boolean }

export type NotionPropValue =
  | { type: 'title'; text: string }
  | { type: 'rich_text'; text: string }
  | { type: 'number'; value: number | null }
  | { type: 'select'; option: SelectOption | null }
  | { type: 'multi_select'; options: SelectOption[] }
  | { type: 'status'; option: SelectOption | null }
  | { type: 'date'; start: string | null; end: string | null; hasTime: boolean }
  | { type: 'url'; value: string | null }
  | { type: 'email'; value: string | null }
  | { type: 'phone_number'; value: string | null }
  | { type: 'checkbox'; value: boolean }
  | { type: 'files'; files: FileRef[] }
  | { type: 'people'; people: PersonRef[] }
  | { type: 'relation'; ids: string[] }
  | { type: 'formula'; display: string }
  | { type: 'rollup'; display: string }
  | { type: 'created_time'; value: string }
  | { type: 'last_edited_time'; value: string }
  | { type: 'created_by'; user: PersonRef | null }
  | { type: 'last_edited_by'; user: PersonRef | null }
  | { type: 'unique_id'; prefix: string | null; number: number | null }
  | { type: 'unsupported'; raw: string };

export type NotionPropType = NotionPropValue['type'];

export interface NotionPropDef {
  id: string;
  name: string;
  type: NotionPropType;
  options?: SelectOption[];
}

export interface NotionDbSchema {
  title: string;
  realDbId: string;
  properties: NotionPropDef[]; // ordered by DB property order
}

export interface NotionPage {
  id: string;
  url: string;
  archived: boolean;
  cover: string | null;
  icon: string | null; // emoji or url
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, NotionPropValue>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function plain(rt: unknown): string {
  if (!Array.isArray(rt)) return '';
  return (rt as Array<{ plain_text?: string }>).map(t => t.plain_text ?? '').join('');
}

function makeHeaders(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function makeClient(creds?: { key?: string }) {
  return new Client({ auth: creds?.key ?? process.env.NOTION_API_KEY, timeoutMs: 12000 });
}

function resolveDbId(creds?: { key?: string; dbId?: string }) {
  return creds?.dbId ?? process.env.NOTION_DATABASE_ID ?? '';
}

// ── Parse a single property value ────────────────────────────────────────────

export function parseProp(prop: unknown): NotionPropValue {
  if (!prop || typeof prop !== 'object') return { type: 'unsupported', raw: '' };
  const p = prop as Record<string, unknown>;
  const t = p.type as string;

  switch (t) {
    case 'title':
      return { type: 'title', text: plain(p.title) };
    case 'rich_text':
      return { type: 'rich_text', text: plain(p.rich_text) };
    case 'number':
      return { type: 'number', value: (p.number as number) ?? null };
    case 'select': {
      const v = p.select as Record<string, unknown> | null;
      return { type: 'select', option: v ? { id: v.id as string, name: v.name as string, color: v.color as NotionColor } : null };
    }
    case 'multi_select': {
      const arr = (p.multi_select as Array<Record<string, unknown>>) ?? [];
      return { type: 'multi_select', options: arr.map(o => ({ id: o.id as string, name: o.name as string, color: o.color as NotionColor })) };
    }
    case 'status': {
      const v = p.status as Record<string, unknown> | null;
      return { type: 'status', option: v ? { id: v.id as string, name: v.name as string, color: v.color as NotionColor } : null };
    }
    case 'date': {
      const d = p.date as Record<string, unknown> | null;
      const start = (d?.start as string) ?? null;
      const end = (d?.end as string) ?? null;
      const hasTime = !!(start && start.includes('T'));
      return { type: 'date', start, end, hasTime };
    }
    case 'url':
      return { type: 'url', value: (p.url as string) ?? null };
    case 'email':
      return { type: 'email', value: (p.email as string) ?? null };
    case 'phone_number':
      return { type: 'phone_number', value: (p.phone_number as string) ?? null };
    case 'checkbox':
      return { type: 'checkbox', value: !!p.checkbox };
    case 'files': {
      const arr = (p.files as Array<Record<string, unknown>>) ?? [];
      const files: FileRef[] = arr.map(f => {
        const isExt = f.type === 'external';
        const wrap = (isExt ? f.external : f.file) as Record<string, unknown> | undefined;
        return { name: (f.name as string) ?? 'file', url: (wrap?.url as string) ?? '', external: isExt };
      }).filter(f => !!f.url);
      return { type: 'files', files };
    }
    case 'people': {
      const arr = (p.people as Array<Record<string, unknown>>) ?? [];
      return {
        type: 'people',
        people: arr.map(u => ({ id: u.id as string, name: u.name as string | undefined, avatar_url: u.avatar_url as string | undefined })),
      };
    }
    case 'relation': {
      const arr = (p.relation as Array<{ id: string }>) ?? [];
      return { type: 'relation', ids: arr.map(r => r.id) };
    }
    case 'formula': {
      const f = p.formula as Record<string, unknown> | undefined;
      const sub = f?.type as string;
      let display = '';
      if (sub === 'string') display = (f?.string as string) ?? '';
      else if (sub === 'number') display = String((f?.number as number) ?? '');
      else if (sub === 'boolean') display = (f?.boolean as boolean) ? '✓' : '✗';
      else if (sub === 'date') {
        const d = f?.date as Record<string, unknown> | null;
        display = (d?.start as string) ?? '';
      }
      return { type: 'formula', display };
    }
    case 'rollup': {
      const r = p.rollup as Record<string, unknown> | undefined;
      const sub = r?.type as string;
      let display = '';
      if (sub === 'number') display = String((r?.number as number) ?? '');
      else if (sub === 'date') {
        const d = r?.date as Record<string, unknown> | null;
        display = (d?.start as string) ?? '';
      } else if (sub === 'array') {
        const arr = (r?.array as Array<Record<string, unknown>>) ?? [];
        display = arr.map(item => {
          const it = item.type as string;
          if (it === 'title' || it === 'rich_text') return plain(item[it]);
          if (it === 'number') return String((item.number as number) ?? '');
          return '';
        }).filter(Boolean).join(', ');
      }
      return { type: 'rollup', display };
    }
    case 'created_time':
      return { type: 'created_time', value: (p.created_time as string) ?? '' };
    case 'last_edited_time':
      return { type: 'last_edited_time', value: (p.last_edited_time as string) ?? '' };
    case 'created_by': {
      const u = p.created_by as Record<string, unknown> | undefined;
      return { type: 'created_by', user: u ? { id: u.id as string, name: u.name as string | undefined, avatar_url: u.avatar_url as string | undefined } : null };
    }
    case 'last_edited_by': {
      const u = p.last_edited_by as Record<string, unknown> | undefined;
      return { type: 'last_edited_by', user: u ? { id: u.id as string, name: u.name as string | undefined, avatar_url: u.avatar_url as string | undefined } : null };
    }
    case 'unique_id': {
      const u = p.unique_id as Record<string, unknown> | undefined;
      return { type: 'unique_id', prefix: (u?.prefix as string) ?? null, number: (u?.number as number) ?? null };
    }
    default:
      return { type: 'unsupported', raw: t ?? '' };
  }
}

// ── Parse full page ──────────────────────────────────────────────────────────

export function parsePage(raw: Record<string, unknown>): NotionPage {
  const props = (raw.properties as Record<string, unknown>) ?? {};
  const properties: Record<string, NotionPropValue> = {};
  for (const [name, val] of Object.entries(props)) {
    properties[name] = parseProp(val);
  }
  const cover = raw.cover as Record<string, unknown> | null | undefined;
  const coverUrl = cover
    ? ((cover.external as Record<string, unknown>)?.url as string) ?? ((cover.file as Record<string, unknown>)?.url as string) ?? null
    : null;
  const icon = raw.icon as Record<string, unknown> | null | undefined;
  const iconStr = icon
    ? (icon.emoji as string) ?? ((icon.external as Record<string, unknown>)?.url as string) ?? ((icon.file as Record<string, unknown>)?.url as string) ?? null
    : null;
  return {
    id: raw.id as string,
    url: (raw.url as string) ?? '',
    archived: !!raw.archived,
    cover: coverUrl,
    icon: iconStr,
    createdTime: (raw.created_time as string) ?? '',
    lastEditedTime: (raw.last_edited_time as string) ?? '',
    properties,
  };
}

// ── Parse DB schema ──────────────────────────────────────────────────────────

export function parseDbSchema(db: Record<string, unknown>): NotionDbSchema {
  const props = (db.properties as Record<string, unknown>) ?? {};
  const titleArr = db.title as Array<Record<string, unknown>> | undefined;
  const dbTitle = Array.isArray(titleArr)
    ? titleArr.map(t => (t.plain_text as string) ?? '').join('')
    : '';

  const properties: NotionPropDef[] = Object.entries(props).map(([name, val]) => {
    const p = val as Record<string, unknown>;
    const type = (p.type as NotionPropType) ?? 'unsupported';
    const rawId = (p.id as string) ?? name;
    const def: NotionPropDef = {
      id: rawId.includes('%') ? decodeURIComponent(rawId) : rawId,
      name,
      type,
    };
    if (type === 'select' || type === 'multi_select' || type === 'status') {
      const cfg = p[type] as Record<string, unknown> | undefined;
      const opts = (cfg?.options as Array<Record<string, unknown>>) ?? [];
      def.options = opts.map(o => ({
        id: o.id as string,
        name: o.name as string,
        color: (o.color as NotionColor) ?? 'default',
      }));
    }
    return def;
  });

  return { title: dbTitle, realDbId: (db.id as string) ?? '', properties };
}

// ── Build properties patch for write ─────────────────────────────────────────
// Accepts a partial Record<propName, NotionPropValue>. Skips read-only types.

const READONLY: NotionPropType[] = [
  'people', 'relation', 'formula', 'rollup',
  'created_time', 'last_edited_time', 'created_by', 'last_edited_by',
  'unique_id', 'unsupported',
];

export function buildPropertiesPatch(
  patch: Record<string, NotionPropValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(patch)) {
    if (READONLY.includes(v.type)) continue;
    switch (v.type) {
      case 'title':
        out[name] = { title: v.text ? [{ text: { content: v.text } }] : [] };
        break;
      case 'rich_text':
        out[name] = { rich_text: v.text ? [{ text: { content: v.text } }] : [] };
        break;
      case 'number':
        out[name] = { number: v.value };
        break;
      case 'select':
        out[name] = { select: v.option ? { name: v.option.name } : null };
        break;
      case 'multi_select':
        out[name] = { multi_select: v.options.map(o => ({ name: o.name })) };
        break;
      case 'status':
        out[name] = { status: v.option ? { name: v.option.name } : null };
        break;
      case 'date': {
        if (!v.start) { out[name] = { date: null }; break; }
        const d: Record<string, string> = { start: v.start };
        if (v.end) d.end = v.end;
        out[name] = { date: d };
        break;
      }
      case 'url':
        out[name] = { url: v.value || null };
        break;
      case 'email':
        out[name] = { email: v.value || null };
        break;
      case 'phone_number':
        out[name] = { phone_number: v.value || null };
        break;
      case 'checkbox':
        out[name] = { checkbox: !!v.value };
        break;
      case 'files':
        out[name] = {
          files: v.files.map(f => f.external
            ? { type: 'external', name: f.name, external: { url: f.url } }
            : { type: 'external', name: f.name, external: { url: f.url } }
          ),
        };
        break;
    }
  }
  return out;
}

// ── DB read endpoints ────────────────────────────────────────────────────────

export async function getDbSchema(creds?: { key?: string; dbId?: string; realDbId?: string }): Promise<NotionDbSchema> {
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const dataSourceId = resolveDbId(creds);
  const headers = makeHeaders(key);
  const notion = makeClient(creds);

  // Fetch schema from data_source (Notion 2025-09-03 — data sources carry the properties)
  let schema: NotionDbSchema | null = null;
  const idsToTry = [dataSourceId, creds?.realDbId].filter(Boolean) as string[];
  for (const id of idsToTry) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ds = await (notion.dataSources as any).retrieve({ data_source_id: id }) as Record<string, unknown>;
      const s = parseDbSchema(ds);
      if (s.properties.length > 0) { schema = s; break; }
    } catch { /* try next */ }
  }

  // Fallback: legacy /databases/ endpoint
  if (!schema) {
    for (const id of idsToTry) {
      try {
        const res = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
        if (!res.ok) continue;
        const db = await res.json() as Record<string, unknown>;
        const s = parseDbSchema(db);
        if (s.properties.length > 0) { schema = s; break; }
      } catch { /* next */ }
    }
  }

  if (!schema) return { title: '', realDbId: dataSourceId, properties: [] };

  // Apply Notion column order from the default table view.
  // views.list returns only partial {id} stubs — retrieve each individually.
  try {
    const listRes = await fetch(
      `https://api.notion.com/v1/views?data_source_id=${encodeURIComponent(dataSourceId)}`,
      { headers },
    );
    if (listRes.ok) {
      const listData = await listRes.json() as Record<string, unknown>;
      const viewIds = ((listData.results as Array<Record<string, unknown>>) ?? [])
        .map(v => v.id as string).filter(Boolean);
      for (const viewId of viewIds) {
        try {
          const vRes = await fetch(`https://api.notion.com/v1/views/${viewId}`, { headers });
          if (!vRes.ok) continue;
          const view = await vRes.json() as Record<string, unknown>;
          if (view.type !== 'table') continue;
          const cfg = view.configuration as Record<string, unknown> | undefined;
          const viewProps = (cfg?.properties as Array<Record<string, unknown>>) ?? [];
          if (viewProps.length === 0) continue;
          const propById = new Map(schema.properties.map(p => [p.id, p]));
          const ordered: NotionPropDef[] = [];
          const seen = new Set<string>();
          for (const vp of viewProps) {
            const pid = vp.property_id as string;
            const prop = propById.get(pid);
            if (prop) { ordered.push(prop); seen.add(prop.id); }
          }
          for (const p of schema.properties) {
            if (!seen.has(p.id)) ordered.push(p);
          }
          schema = { ...schema, properties: ordered };
          break;
        } catch { /* try next */ }
      }
    }
  } catch { /* keep schema as-is */ }

  return schema;
}

export async function applyViewOrder(
  schema: NotionDbSchema,
  dataSourceId: string,
  key: string,
): Promise<{ schema: NotionDbSchema; viewSorts: Array<Record<string, unknown>>; orderFromView: boolean }> {
  let viewSorts: Array<Record<string, unknown>> = [];
  try {
    const headers = makeHeaders(key);
    const listRes = await fetch(
      `https://api.notion.com/v1/views?data_source_id=${encodeURIComponent(dataSourceId)}`,
      { headers },
    );
    if (!listRes.ok) return { schema, viewSorts, orderFromView: false };
    const listData = await listRes.json() as Record<string, unknown>;
    const viewIds = ((listData.results as Array<Record<string, unknown>>) ?? [])
      .map(v => v.id as string).filter(Boolean);
    for (const viewId of viewIds) {
      try {
        const vRes = await fetch(`https://api.notion.com/v1/views/${viewId}`, { headers });
        if (!vRes.ok) continue;
        const view = await vRes.json() as Record<string, unknown>;
        if (view.type !== 'table') continue;
        const cfg = view.configuration as Record<string, unknown> | undefined;
        // Notion API returns sorts at view top-level, not inside configuration
        const rawSorts = (view.sorts as Array<Record<string, unknown>> | null) ?? [];

        // Map view sorts to Notion query API format (property_id → property name).
        const propByIdMap = new Map(schema.properties.map(p => [p.id, p.name]));
        viewSorts = rawSorts.map(s => {
          if (s.timestamp) return s;
          const propId = s.property_id as string | undefined;
          if (propId) {
            const propName = propByIdMap.get(propId);
            if (propName) return { property: propName, direction: s.direction };
          }
          return null;
        }).filter((s): s is Record<string, unknown> => s !== null);

        const viewProps = (cfg?.properties as Array<Record<string, unknown>>) ?? [];
        if (viewProps.length > 0) {
          const propById = new Map(schema.properties.map(p => [p.id, p]));
          // Also build lookup by URL-encoded ID and by name as fallbacks.
          const propByEncId = new Map(schema.properties.map(p => [encodeURIComponent(p.id), p]));
          const propByName = new Map(schema.properties.map(p => [p.name, p]));
          const ordered: NotionPropDef[] = [];
          const seen = new Set<string>();
          for (const vp of viewProps) {
            const pid = vp.property_id as string;
            const decodedPid = pid && pid.includes('%') ? decodeURIComponent(pid) : pid;
            const prop = propById.get(decodedPid) ?? propById.get(pid)
              ?? propByEncId.get(pid) ?? propByName.get(pid as string);
            if (prop) { ordered.push(prop); seen.add(prop.id); }
          }
          for (const p of schema.properties) {
            if (!seen.has(p.id)) ordered.push(p);
          }
          return { schema: { ...schema, properties: ordered }, viewSorts, orderFromView: true };
        }
        return { schema, viewSorts, orderFromView: false };
      } catch { /* try next view */ }
    }
  } catch { /* keep schema as-is */ }
  return { schema, viewSorts, orderFromView: false };
}

export async function getAllPages(creds?: { key?: string; dbId?: string }): Promise<{
  pages: NotionPage[];
  realDbId: string;
}> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const headers = makeHeaders(key);

  const pageMap = new Map<string, NotionPage>();
  let firstRaw: Record<string, unknown> | undefined;

  // Primary: data source query (new API)
  let cursor: string | undefined;
  try {
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (notion.dataSources as any).query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      });
      const results: unknown[] = res.results ?? [];
      for (const raw of results) {
        const r = raw as Record<string, unknown>;
        if (!r.properties) continue;
        const p = parsePage(r);
        pageMap.set(p.id, p);
        if (!firstRaw) firstRaw = r;
      }
      cursor = (res.next_cursor as string | null) ?? undefined;
    } while (cursor);
  } catch { /* try fallback */ }

  // Fallback: direct DB query
  if (pageMap.size === 0) {
    let dbCursor: string | undefined;
    try {
      do {
        const body: Record<string, unknown> = {
          page_size: 100,
          sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        };
        if (dbCursor) body.start_cursor = dbCursor;
        const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
        if (!res.ok) break;
        const data = await res.json() as Record<string, unknown>;
        const results = (data.results as Array<Record<string, unknown>>) ?? [];
        for (const r of results) {
          const p = parsePage(r);
          pageMap.set(p.id, p);
          if (!firstRaw) firstRaw = r;
        }
        dbCursor = (data.next_cursor as string | null) ?? undefined;
      } while (dbCursor);
    } catch { /* ignore */ }
  }

  // Resolve realDbId
  let realDbId = dataSourceId;
  if (firstRaw) {
    const directId = (firstRaw.parent as Record<string, unknown>)?.database_id as string | undefined;
    if (directId) realDbId = directId;
    else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const full = await (notion.pages as any).retrieve({ page_id: firstRaw.id as string }) as Record<string, unknown>;
        const pid = (full.parent as Record<string, unknown>)?.database_id as string | undefined;
        if (pid) realDbId = pid;
      } catch { /* keep */ }
    }
  } else {
    const discovered = await discoverRealDbId(key, dataSourceId);
    if (discovered) realDbId = discovered;
  }

  const pages = [...pageMap.values()].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  return { pages, realDbId };
}

export async function getPage(pageId: string, creds?: { key?: string }): Promise<NotionPage> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (notion.pages as any).retrieve({ page_id: pageId });
  return parsePage(raw as Record<string, unknown>);
}

export async function updatePage(
  pageId: string,
  patch: Record<string, NotionPropValue>,
  creds?: { key?: string },
): Promise<NotionPage> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await (notion.pages as any).update({
    page_id: pageId,
    properties: buildPropertiesPatch(patch),
  });
  return parsePage(raw as Record<string, unknown>);
}

export async function archivePage(pageId: string, creds?: { key?: string }): Promise<void> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (notion.pages as any).update({ page_id: pageId, archived: true });
}

export async function createPage(
  patch: Record<string, NotionPropValue>,
  creds?: { key?: string; dbId?: string },
  realDbId?: string,
): Promise<NotionPage> {
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const dataSourceId = resolveDbId(creds);
  const headers = makeHeaders(key);
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const tried = new Set<string>();

  const tryCreate = async (parentObj: Record<string, unknown>): Promise<NotionPage> => {
    let props = buildPropertiesPatch(patch);
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers,
        body: JSON.stringify({ parent: parentObj, properties: props }),
      });
      if (res.ok) return parsePage(await res.json() as Record<string, unknown>);
      const err = await res.json() as Record<string, unknown>;
      const msg = (err.message as string) ?? `HTTP ${res.status}`;
      if (!msg.includes('is not a property that exists')) throw new Error(msg);
      const invalid = new Set<string>();
      const re = /([^.]+?) is not a property that exists/g;
      let m;
      while ((m = re.exec(msg)) !== null) invalid.add(m[1].trim());
      if (invalid.size === 0) throw new Error(msg);
      props = Object.fromEntries(Object.entries(props).filter(([k]) => !invalid.has(k.trim())));
    }
    throw new Error('createPage: failed after 4 strip attempts');
  };

  const isConnectorErr = (e: unknown) =>
    e instanceof Error && (e.message.includes('multiple data sources') || e.message.includes('data_source'));

  tried.add(norm(dataSourceId));
  try { return await tryCreate({ data_source_id: dataSourceId }); }
  catch (e) { if (!isConnectorErr(e)) throw e; }

  if (realDbId && !tried.has(norm(realDbId))) {
    tried.add(norm(realDbId));
    try { return await tryCreate({ database_id: realDbId }); }
    catch (e) { if (!isConnectorErr(e)) throw e; }
  }

  const discovered = await discoverRealDbId(key, dataSourceId);
  if (discovered && !tried.has(norm(discovered))) {
    return await tryCreate({ database_id: discovered });
  }
  throw new Error('createPage: could not resolve a writable parent');
}
