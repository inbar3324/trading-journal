import { Client } from '@notionhq/client';
import type { Trade, TradeInput, NotionSchema } from './types';

const DEFAULT_DB_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';

// Tracks the last DB that createTrade successfully wrote to (per process instance).
// getAllTrades uses this to query it directly, even if search misses it.
let _lastWritableDbId: string | null = null;

function multiSelect(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as Record<string, unknown>;
  if (p.type !== 'multi_select') return [];
  const items = p.multi_select as Array<{ name: string }>;
  return Array.isArray(items) ? items.map((o) => o.name) : [];
}

function filesAllUrls(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as Record<string, unknown>;
  if (p.type !== 'files') return [];
  const files = p.files as Array<Record<string, unknown>>;
  if (!Array.isArray(files)) return [];
  return files.flatMap(f => {
    if (f.type === 'file') return [(f.file as Record<string, unknown>)?.url as string].filter(Boolean);
    if (f.type === 'external') return [(f.external as Record<string, unknown>)?.url as string].filter(Boolean);
    return [];
  });
}

function richTextContent(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return '';
  const p = prop as Record<string, unknown>;
  // Notion stores title fields under .title and rich_text fields under .rich_text
  const segments = (p.title ?? p.rich_text) as Array<{ plain_text: string }> | undefined;
  return Array.isArray(segments) ? segments.map((s) => s.plain_text).join('') : '';
}

export function extractFilePropNames(page: Record<string, unknown>): string[] {
  const p = page.properties as Record<string, unknown> | undefined;
  if (!p) return [];
  return Object.entries(p)
    .filter(([, val]) => (val as Record<string, unknown>)?.type === 'files')
    .map(([key]) => key);
}

export function parseTrade(page: Record<string, unknown>): Trade {
  const p = page.properties as Record<string, unknown>;
  const dateField = p['Date'] as Record<string, unknown> | undefined;
  const dateObj = dateField?.date as Record<string, unknown> | undefined;
  const pnlField = p['PNL'] as Record<string, unknown> | undefined;
  const tradeIdeaLink = p['TRADE  IDEA LINK'] as Record<string, unknown> | undefined;
  const oneMLink = p['1M trade link'] as Record<string, unknown> | undefined;

  // Collect ALL image URLs: page cover first, then every files-type property
  const cover = page.cover as Record<string, unknown> | undefined;
  const coverUrl = ((cover?.external as Record<string, unknown>)?.url as string)
    ?? ((cover?.file as Record<string, unknown>)?.url as string)
    ?? null;
  const images: { url: string; label: string }[] = [];
  if (coverUrl) images.push({ url: coverUrl, label: 'cover' });
  for (const [key, val] of Object.entries(p)) {
    for (const url of filesAllUrls(val)) {
      if (!images.some(i => i.url === url)) images.push({ url, label: key });
    }
  }

  return {
    id: page.id as string,
    url: page.url as string,
    date: (dateObj?.start as string) ?? null,
    day: multiSelect(p['day']),
    time: richTextContent(p['TIME']),
    tookTrade: multiSelect(p['Took a trade today?']),
    indices: multiSelect(p['indices']),
    longShort: multiSelect(p['long/short']),
    news: multiSelect(p['NEWS']),
    reversalContinuation: multiSelect(p['reversal/continuation ']),
    drawInLiquidity: multiSelect(p['draw in liquidity']),
    poi: multiSelect(p['POI']),
    lowerTimeEntry: multiSelect(p['LOWER TIME ENTRY']),
    rulesFeelings: multiSelect(p['RULES/feeling']),
    trend: multiSelect(p['TREND']),
    biasForTheDay: multiSelect(p['BIAS FOR THE DAY']),
    rateTrade: multiSelect(p['RATE TRADE']),
    winLose: multiSelect(p['win/lose']),
    pnl: (pnlField?.number as number) ?? null,
    notes: richTextContent(p['NOTES!']),
    tradeIdeaLink: (tradeIdeaLink?.url as string) ?? null,
    oneMTradeLink: (oneMLink?.url as string) ?? null,
    images,
  };
}

function makeClient(creds?: { key?: string; dbId?: string }) {
  return new Client({ auth: creds?.key ?? process.env.NOTION_API_KEY, timeoutMs: 8000 });
}

function resolveDbId(creds?: { key?: string; dbId?: string }) {
  return creds?.dbId ?? process.env.NOTION_DATABASE_ID ?? DEFAULT_DB_ID;
}

function ms(values: string[]) {
  return { multi_select: values.map((name) => ({ name })) };
}

function rt(content: string) {
  return content
    ? { rich_text: [{ text: { content } }] }
    : { rich_text: [] };
}

function buildProperties(input: TradeInput): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.date !== undefined) p['Date'] = input.date ? { date: { start: input.date } } : { date: null };
  if (input.day !== undefined) p['day'] = ms(input.day);
  if (input.time !== undefined) p['TIME'] = rt(input.time);
  if (input.tookTrade !== undefined) p['Took a trade today?'] = ms(input.tookTrade);
  if (input.indices !== undefined) p['indices'] = ms(input.indices);
  if (input.longShort !== undefined) p['long/short'] = ms(input.longShort);
  if (input.news !== undefined) p['NEWS'] = ms(input.news);
  if (input.reversalContinuation !== undefined) p['reversal/continuation '] = ms(input.reversalContinuation);
  if (input.drawInLiquidity !== undefined) p['draw in liquidity'] = ms(input.drawInLiquidity);
  if (input.poi !== undefined) p['POI'] = ms(input.poi);
  if (input.lowerTimeEntry !== undefined) p['LOWER TIME ENTRY'] = ms(input.lowerTimeEntry);
  if (input.rulesFeelings !== undefined) p['RULES/feeling'] = ms(input.rulesFeelings);
  if (input.trend !== undefined) p['TREND'] = ms(input.trend);
  if (input.biasForTheDay !== undefined) p['BIAS FOR THE DAY'] = ms(input.biasForTheDay);
  if (input.rateTrade !== undefined) p['RATE TRADE'] = ms(input.rateTrade);
  if (input.winLose !== undefined) p['win/lose'] = ms(input.winLose);
  if (input.pnl !== undefined) p['PNL'] = { number: input.pnl };
  if (input.notes !== undefined) {
    const text = input.notes ?? '';
    p['NOTES!'] = text ? { title: [{ text: { content: text } }] } : { title: [] };
  }
  if (input.tradeIdeaLink !== undefined) p['TRADE  IDEA LINK'] = { url: input.tradeIdeaLink || null };
  if (input.oneMTradeLink !== undefined) p['1M trade link'] = { url: input.oneMTradeLink || null };
  return p;
}

export async function getTrade(pageId: string, creds?: { key?: string; dbId?: string }): Promise<Trade> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (notion.pages as any).retrieve({ page_id: pageId });
  return parseTrade(page as Record<string, unknown>);
}

async function searchAllDbIds(key: string, excludeNorm: Set<string>): Promise<string[]> {
  const headers = {
    Authorization: `Bearer ${key}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { filter: { property: 'object', value: 'database' }, page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    try {
      const res = await fetch('https://api.notion.com/v1/search', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) break;
      const data = await res.json() as Record<string, unknown>;
      const results = (data.results as Array<Record<string, unknown>>) ?? [];
      // Prioritize DBs that look like journals (date + number), but include all
      const priority: string[] = [];
      const rest: string[] = [];
      for (const db of results) {
        const id = db.id as string;
        if (excludeNorm.has(norm(id))) continue;
        const props = db.properties as Record<string, unknown> | undefined;
        // Only consider databases that have a NOTES! property (journal-specific field)
        if (!props || !('NOTES!' in props)) continue;
        const vals = Object.values(props) as Array<Record<string, unknown>>;
        const hasDate = vals.some((p) => p?.type === 'date');
        const hasNumber = vals.some((p) => p?.type === 'number');
        if (hasDate && hasNumber) priority.push(id); else rest.push(id);
      }
      ids.push(...priority, ...rest);
      cursor = (data.next_cursor as string | null) ?? undefined;
    } catch { break; }
  } while (cursor);
  return ids;
}

export async function createTrade(
  input: TradeInput,
  creds?: { key?: string; dbId?: string },
  realDbId?: string,
): Promise<Trade> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);
  const primaryId = realDbId ?? dataSourceId;
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const tried = new Set<string>();

  // Creates a page in `id`. If Notion rejects unknown properties, strips them and retries (up to 4x).
  const tryCreate = async (id: string): Promise<Trade> => {
    let props = buildProperties(input);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doCreate = (p: Record<string, unknown>) => (notion.pages as any).create({
      parent: { database_id: id },
      properties: p,
    });
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return parseTrade(await doCreate(props));
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('is not a property that exists'))) throw e;
        const invalid = new Set<string>();
        const re = /([^.]+?) is not a property that exists/g;
        let m;
        while ((m = re.exec(e.message)) !== null) invalid.add(m[1].trim());
        if (invalid.size === 0) throw e;
        // Use k.trim() so trailing-space prop names (e.g. "reversal/continuation ") still match
        props = Object.fromEntries(Object.entries(props).filter(([k]) => !invalid.has(k.trim())));
      }
    }
    throw new Error('Could not create page after stripping invalid properties');
  };

  // Attempt 1: primary ID (will fail for multi-source connectors)
  tried.add(norm(primaryId));
  try {
    return await tryCreate(primaryId);
  } catch (e) {
    if (!(e instanceof Error && e.message.includes('multiple data sources'))) throw e;
  }

  // Attempt 2: query the connector → extract parent DB IDs from real pages
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qres = await (notion.dataSources as any).query({ data_source_id: dataSourceId, page_size: 5 });
    const pages: Array<Record<string, unknown>> = qres.results ?? [];
    const parentIds = new Set<string>();
    for (const p of pages) {
      const id = (p.parent as Record<string, unknown>)?.database_id as string | undefined;
      if (id) parentIds.add(id);
    }
    if (pages[0]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (notion.pages as any).retrieve({ page_id: pages[0].id as string }) as Record<string, unknown>;
        const id = (r.parent as Record<string, unknown>)?.database_id as string | undefined;
        if (id) parentIds.add(id);
      } catch { /* ignore */ }
    }
    for (const id of parentIds) {
      if (tried.has(norm(id))) continue;
      tried.add(norm(id));
      try { return await tryCreate(id); } catch { /* try next */ }
    }
  } catch { /* ignore */ }

  // Attempt 3: search all accessible databases (journal DBs first)
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  for (const id of await searchAllDbIds(key, tried)) {
    if (tried.has(norm(id))) continue;
    tried.add(norm(id));
    try {
      const trade = await tryCreate(id);
      _lastWritableDbId = id; // remember for getAllTrades supplemental read
      return trade;
    } catch { /* try next */ }
  }

  throw new Error('Cannot create journal entry: all accessible Notion databases were tried and failed.');
}

export async function updateTrade(pageId: string, input: TradeInput, creds?: { key?: string; dbId?: string }): Promise<Trade> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (notion.pages as any).update({
    page_id: pageId,
    properties: buildProperties(input),
  });
  return parseTrade(page as Record<string, unknown>);
}

export async function archiveTrade(pageId: string, creds?: { key?: string; dbId?: string }): Promise<void> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (notion.pages as any).update({ page_id: pageId, archived: true });
}

function extractSchemaFromDb(db: Record<string, unknown>): NotionSchema {
  const schema: NotionSchema = {};
  const props = db.properties as Record<string, unknown> | undefined;
  if (!props) return schema;
  for (const [name, prop] of Object.entries(props)) {
    const p = prop as Record<string, unknown>;
    if (p.type === 'multi_select') {
      const opts = (p.multi_select as Record<string, unknown>)?.options as Array<{ name: string; color?: string }> | undefined;
      schema[name] = Array.isArray(opts) ? opts.map((o) => ({ name: o.name, color: o.color })) : [];
    }
  }
  return schema;
}

export async function getSchema(creds?: { key?: string; dbId?: string }): Promise<NotionSchema> {
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const dbId = resolveDbId(creds);
  const notionHeaders = {
    Authorization: `Bearer ${key}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const normalizeId = (id: string) => id.replace(/-/g, '').toLowerCase();
  const targetId = normalizeId(dbId);

  // Strategy 1: direct database retrieve via raw REST (bypasses SDK quirks)
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}`, { headers: notionHeaders });
    if (res.ok) {
      const db = await res.json() as Record<string, unknown>;
      const schema = extractSchemaFromDb(db);
      if (Object.keys(schema).length > 0) return schema;
    }
  } catch { /* fall through */ }

  // Strategy 2: search all databases accessible to this integration
  try {
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = { filter: { property: 'object', value: 'database' }, page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json() as Record<string, unknown>;
      const results = (data.results as Array<Record<string, unknown>>) ?? [];
      const db = results.find((r) => normalizeId(r.id as string) === targetId);
      if (db) {
        const schema = extractSchemaFromDb(db);
        if (Object.keys(schema).length > 0) return schema;
      }
      cursor = (data.next_cursor as string | null) ?? undefined;
    } while (cursor);
  } catch { /* fall through */ }

  return {};
}

export async function getAllTrades(creds?: { key?: string; dbId?: string }): Promise<{ trades: Trade[]; realDbId: string }> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();

  // Use a map to deduplicate by page ID (connector is authoritative; supplemental fills gaps)
  const tradeMap = new Map<string, Trade>();
  let cursor: string | undefined;
  let firstPageId: string | undefined;

  // Primary read: dataSources connector
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (notion.dataSources as any).query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
      sorts: [{ property: 'Date', direction: 'ascending' }],
    });

    const results: unknown[] = res.results ?? [];
    for (const page of results) {
      const p = page as Record<string, unknown>;
      if (p.properties) {
        const trade = parseTrade(p);
        tradeMap.set(trade.id, trade);
        if (!firstPageId) firstPageId = p.id as string;
      }
    }

    cursor = (res.next_cursor as string | null) ?? undefined;
  } while (cursor);

  // Supplemental read: also query accessible databases directly.
  // createTrade falls back to these DBs when the connector is read-only,
  // so pages written there won't appear in dataSources.query without this.
  const notionHeaders = {
    Authorization: `Bearer ${key}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
  const querySupplementalDb = async (dbId: string) => {
    let dbCursor: string | undefined;
    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (dbCursor) body.start_cursor = dbCursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json() as Record<string, unknown>;
      const results = (data.results as Array<Record<string, unknown>>) ?? [];
      for (const page of results) {
        const pageId = page.id as string;
        if (tradeMap.has(pageId)) continue;
        const props = page.properties as Record<string, unknown> | undefined;
        // Include only if this looks like a journal DB (has NOTES! or Date property)
        if (props && ('NOTES!' in props || 'Date' in props)) {
          tradeMap.set(pageId, parseTrade(page));
        }
      }
      dbCursor = (data.next_cursor as string | null) ?? undefined;
    } while (dbCursor);
  };

  // Always query the last DB we wrote to (fastest path, works even across search failures)
  if (_lastWritableDbId && norm(_lastWritableDbId) !== norm(dataSourceId)) {
    try { await querySupplementalDb(_lastWritableDbId); } catch { /* ignore */ }
  }

  // Also search for any other accessible databases
  try {
    const excludeNorm = new Set([norm(dataSourceId)]);
    if (_lastWritableDbId) excludeNorm.add(norm(_lastWritableDbId));
    const extraDbIds = await searchAllDbIds(key, excludeNorm);
    for (const dbId of extraDbIds) {
      try { await querySupplementalDb(dbId); } catch { /* ignore unavailable db */ }
    }
  } catch { /* ignore search failures */ }

  const trades = [...tradeMap.values()].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  // pages.retrieve returns the real parent.database_id needed for pages.create.
  let realDbId = dataSourceId;
  if (firstPageId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = await (notion.pages as any).retrieve({ page_id: firstPageId }) as Record<string, unknown>;
      const parentDbId = (page.parent as Record<string, unknown>)?.database_id as string | undefined;
      if (parentDbId) realDbId = parentDbId;
    } catch { /* fall through — keep dataSourceId as fallback */ }
  }

  return { trades, realDbId };
}
