import { Client } from '@notionhq/client';
import type { Trade, TradeInput, NotionSchema } from './types';

const DEFAULT_DB_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';
const NOTION_VERSION = '2025-09-03';

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
  const linkAfter = p['link to what happend after'] as Record<string, unknown> | undefined;

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
    linkToWhatHappenedAfter: (linkAfter?.url as string) ?? null,
    images,
  };
}

function makeClient(creds?: { key?: string }) {
  return new Client({ auth: creds?.key ?? process.env.NOTION_API_KEY, timeoutMs: 8000 });
}

function resolveDbId(creds?: { key?: string; dbId?: string }) {
  return creds?.dbId ?? process.env.NOTION_DATABASE_ID ?? DEFAULT_DB_ID;
}

function makeHeaders(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
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
  if (input.linkToWhatHappenedAfter !== undefined) p['link to what happend after'] = { url: input.linkToWhatHappenedAfter || null };
  return p;
}

export async function getTrade(pageId: string, creds?: { key?: string; dbId?: string }): Promise<Trade> {
  const notion = makeClient(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (notion.pages as any).retrieve({ page_id: pageId });
  return parseTrade(page as Record<string, unknown>);
}

// Discovers the real database_id behind a connector/data-source ID.
// Strategy A: direct database query — if it works, dataSourceId IS a real DB.
// Strategy B: connector query for 1 page → extract parent.database_id.
export async function discoverRealDbId(key: string, dataSourceId: string): Promise<string | null> {
  const headers = makeHeaders(key);

  // Strategy A: try querying as a real database
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 1 }),
    });
    if (res.ok) return dataSourceId;
  } catch { /* fall through */ }

  // Strategy B: query connector and look at first page's parent
  try {
    const notion = makeClient({ key });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qres = await (notion.dataSources as any).query({ data_source_id: dataSourceId, page_size: 1 });
    const pages: Array<Record<string, unknown>> = qres.results ?? [];
    if (pages.length > 0) {
      const directId = (pages[0].parent as Record<string, unknown>)?.database_id as string | undefined;
      if (directId) return directId;
      // Some connector responses omit parent — retrieve the full page
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const full = await (notion.pages as any).retrieve({ page_id: pages[0].id as string }) as Record<string, unknown>;
        const fullId = (full.parent as Record<string, unknown>)?.database_id as string | undefined;
        if (fullId) return fullId;
      } catch { /* ignore */ }
    }
  } catch { /* fall through */ }

  return null;
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

export async function getSchema(creds?: { key?: string; dbId?: string; realDbId?: string }): Promise<NotionSchema> {
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const dataSourceId = resolveDbId(creds);
  const headers = makeHeaders(key);
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();

  const fetchSchemaById = async (id: string): Promise<NotionSchema | null> => {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
      if (!res.ok) return null;
      const db = await res.json() as Record<string, unknown>;
      const schema = extractSchemaFromDb(db);
      return Object.keys(schema).length > 0 ? schema : null;
    } catch {
      return null;
    }
  };

  // Strategy 1: use realDbId if already known (fastest path — no discovery needed)
  if (creds?.realDbId) {
    const schema = await fetchSchemaById(creds.realDbId);
    if (schema) return schema;
  }

  // Strategy 2: try dataSourceId directly as a legacy database (old API format)
  {
    const schema = await fetchSchemaById(dataSourceId);
    if (schema) return schema;
  }

  // Strategy 3: search for a data_source matching dataSourceId (Notion API 2025-09-03)
  // In the new API, data sources are objects with type "data_source" and carry the properties.
  try {
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = { filter: { property: 'object', value: 'data_source' }, page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch('https://api.notion.com/v1/search', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) break;
      const data = await res.json() as Record<string, unknown>;
      const results = (data.results as Array<Record<string, unknown>>) ?? [];
      const target = results.find((r) => norm(r.id as string) === norm(dataSourceId));
      if (target) {
        const schema = extractSchemaFromDb(target);
        if (Object.keys(schema).length > 0) return schema;
      }
      cursor = (data.next_cursor as string | null) ?? undefined;
    } while (cursor);
  } catch { /* fall through */ }

  // Strategy 4: discover realDbId from connector query, then fetch schema
  const discovered = await discoverRealDbId(key, dataSourceId);
  if (discovered && discovered !== dataSourceId) {
    const schema = await fetchSchemaById(discovered);
    if (schema) return schema;
  }

  return {};
}

export async function createTrade(
  input: TradeInput,
  creds?: { key?: string; dbId?: string },
  realDbId?: string,
): Promise<Trade> {
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const dataSourceId = resolveDbId(creds);
  const headers = makeHeaders(key);
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const tried = new Set<string>();

  // tryCreate: POST to /v1/pages with given parent, stripping unknown props on retry
  const tryCreate = async (parentObj: Record<string, unknown>): Promise<Trade> => {
    let props = buildProperties(input);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({ parent: parentObj, properties: props }),
        });
        if (!res.ok) {
          const err = await res.json() as Record<string, unknown>;
          throw new Error((err.message as string) ?? `HTTP ${res.status}`);
        }
        return parseTrade(await res.json() as Record<string, unknown>);
      } catch (e) {
        if (!(e instanceof Error && e.message.includes('is not a property that exists'))) throw e;
        const invalid = new Set<string>();
        const re = /([^.]+?) is not a property that exists/g;
        let m;
        while ((m = re.exec(e.message)) !== null) invalid.add(m[1].trim());
        if (invalid.size === 0) throw e;
        props = Object.fromEntries(Object.entries(props).filter(([k]) => !invalid.has(k.trim())));
      }
    }
    throw new Error('Could not create page after stripping invalid properties');
  };

  const isConnectorError = (e: unknown) => e instanceof Error && (
    e.message.includes('multiple data sources') ||
    e.message.includes('data_source')
  );

  // Attempt 1: data_source_id parent (Notion API 2025-09-03 — works for connector IDs)
  tried.add(norm(dataSourceId));
  try {
    return await tryCreate({ data_source_id: dataSourceId });
  } catch (e) {
    if (!isConnectorError(e)) throw e;
  }

  // Attempt 2: realDbId passed from client (discovered during previous getAllTrades)
  if (realDbId && !tried.has(norm(realDbId))) {
    tried.add(norm(realDbId));
    try {
      return await tryCreate({ database_id: realDbId });
    } catch (e) {
      if (!isConnectorError(e)) throw e;
    }
  }

  // Attempt 3: discover realDbId fresh and try with database_id
  const discovered = await discoverRealDbId(key, dataSourceId);
  if (discovered && !tried.has(norm(discovered))) {
    tried.add(norm(discovered));
    return await tryCreate({ database_id: discovered });
  }

  throw new Error('Cannot create journal entry: could not determine a writable Notion database ID.');
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

export async function getAllTrades(creds?: { key?: string; dbId?: string }): Promise<{ trades: Trade[]; realDbId: string; dbTitle: string }> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const headers = makeHeaders(key);

  const tradeMap = new Map<string, Trade>();
  let cursor: string | undefined;
  let firstPage: Record<string, unknown> | undefined;

  // Primary read: dataSources connector (handles connector IDs)
  try {
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
          if (!firstPage) firstPage = p;
        }
      }
      cursor = (res.next_cursor as string | null) ?? undefined;
    } while (cursor);
  } catch {
    // dataSources.query failed — try as a direct database below
  }

  // Fallback: direct database query (works when dataSourceId is a real DB ID)
  if (tradeMap.size === 0) {
    try {
      let dbCursor: string | undefined;
      do {
        const body: Record<string, unknown> = {
          page_size: 100,
          sorts: [{ property: 'Date', direction: 'ascending' }],
        };
        if (dbCursor) body.start_cursor = dbCursor;
        const res = await fetch(`https://api.notion.com/v1/databases/${dataSourceId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) break;
        const data = await res.json() as Record<string, unknown>;
        const results = (data.results as Array<Record<string, unknown>>) ?? [];
        for (const page of results) {
          const trade = parseTrade(page);
          tradeMap.set(trade.id, trade);
          if (!firstPage) firstPage = page;
        }
        dbCursor = (data.next_cursor as string | null) ?? undefined;
      } while (dbCursor);
    } catch { /* ignore */ }
  }

  const trades = [...tradeMap.values()].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  // Discover realDbId from first page
  let realDbId = dataSourceId;
  if (firstPage) {
    const directId = (firstPage.parent as Record<string, unknown>)?.database_id as string | undefined;
    if (directId) {
      realDbId = directId;
    } else {
      // Connector pages may omit parent — retrieve the full page
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const full = await (notion.pages as any).retrieve({ page_id: firstPage.id as string }) as Record<string, unknown>;
        const parentDbId = (full.parent as Record<string, unknown>)?.database_id as string | undefined;
        if (parentDbId) realDbId = parentDbId;
      } catch { /* keep dataSourceId */ }
    }
  } else {
    // No pages yet — try to discover realDbId without any page
    const discovered = await discoverRealDbId(key, dataSourceId);
    if (discovered) realDbId = discovered;
  }

  // Fetch DB title (best-effort)
  let dbTitle = '';
  try {
    const titleRes = await fetch(`https://api.notion.com/v1/databases/${realDbId}`, { headers });
    if (titleRes.ok) {
      const tdata = await titleRes.json() as Record<string, unknown>;
      const titleArr = tdata.title as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(titleArr) && titleArr.length > 0) {
        dbTitle = titleArr.map(t => (t.plain_text as string) ?? '').join('');
      }
    }
  } catch { /* ignore */ }

  return { trades, realDbId, dbTitle };
}
