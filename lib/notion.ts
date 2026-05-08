import { Client } from '@notionhq/client';
import type { Trade, TradeInput, NotionSchema, FieldMap } from './types';

const NOTION_VERSION = '2025-09-03';

const DEFAULT_FIELD_MAP: FieldMap = {
  notes: 'NOTES!',
  date: 'Date',
  pnl: 'PNL',
  winLose: 'win/lose',
  day: 'day',
  time: 'TIME',
  tookTrade: 'Took a trade today?',
  indices: 'indices',
  direction: 'long/short',
  news: 'NEWS',
  reversalContinuation: 'reversal/continuation ',
  drawInLiquidity: 'draw in liquidity',
  poi: 'POI',
  lowerTimeEntry: 'LOWER TIME ENTRY',
  rulesFeelings: 'RULES/feeling',
  trend: 'TREND',
  biasForDay: 'BIAS FOR THE DAY',
  rateTrade: 'RATE TRADE',
  tradeIdeaLink: 'TRADE  IDEA LINK',
  oneMLink: '1M trade link',
  linkAfter: 'link to what happend after',
};

function normalizeWinLose(v: string): string {
  const l = v.toLowerCase().trim();
  if (['win', 'w', 'profit', '✅', 'yes', 't', 'winner', 'won'].includes(l)) return 'win';
  if (['lose', 'l', 'loss', '❌', 'no', 'f', 'loser', 'lost'].includes(l)) return 'lose';
  if (['brakeven', 'breakeven', 'be', 'b/e', 'break even', 'break-even', 'neutral', 'scratch', 'even'].includes(l)) return 'BRAKEVEN';
  return v;
}

function normalizeTookTrade(v: string): string {
  const l = v.toLowerCase().trim();
  if (['took trade', 'yes', 'y', 'true', 'traded', 'active', '1', '✅', 'done'].includes(l)) return 'TOOK TRADE';
  return v;
}

function findProp(
  props: Record<string, { type: string }>,
  types: string | string[],
  hints: string[] = [],
): string | undefined {
  const typeArr = Array.isArray(types) ? types : [types];
  const candidates = Object.entries(props).filter(([, p]) => typeArr.includes(p.type));
  if (candidates.length === 0) return undefined;
  for (const hint of hints) {
    const exact = candidates.find(([n]) => n.toLowerCase() === hint.toLowerCase());
    if (exact) return exact[0];
  }
  for (const hint of hints) {
    const partial = candidates.find(([n]) => n.toLowerCase().includes(hint.toLowerCase()));
    if (partial) return partial[0];
  }
  return candidates[0][0];
}

export function buildFieldMap(props: Record<string, { type: string }>): FieldMap {
  return {
    notes: findProp(props, 'title') ?? DEFAULT_FIELD_MAP.notes,
    date: findProp(props, 'date', ['date', 'trade date', 'entry date']) ?? DEFAULT_FIELD_MAP.date,
    pnl: findProp(props, 'number', ['pnl', 'p&l', 'profit', 'p/l', 'profit/loss', 'gain', 'return']) ?? DEFAULT_FIELD_MAP.pnl,
    winLose: findProp(props, ['select', 'multi_select'], ['win/lose', 'result', 'outcome', 'w/l', 'trade result', 'win lose']) ?? DEFAULT_FIELD_MAP.winLose,
    day: findProp(props, 'multi_select', ['day', 'weekday', 'day of week']) ?? DEFAULT_FIELD_MAP.day,
    time: findProp(props, ['rich_text', 'text'], ['time', 'entry time', 'trade time']) ?? DEFAULT_FIELD_MAP.time,
    tookTrade: findProp(props, 'multi_select', ['took a trade', 'took trade', 'traded', 'active']) ?? DEFAULT_FIELD_MAP.tookTrade,
    indices: findProp(props, 'multi_select', ['indices', 'index', 'market', 'instrument', 'symbol', 'ticker', 'asset']) ?? DEFAULT_FIELD_MAP.indices,
    direction: findProp(props, 'multi_select', ['long/short', 'direction', 'side', 'long short', 'type']) ?? DEFAULT_FIELD_MAP.direction,
    news: findProp(props, 'multi_select', ['news', 'catalyst', 'event', 'macro']) ?? DEFAULT_FIELD_MAP.news,
    reversalContinuation: findProp(props, 'multi_select', ['reversal/continuation', 'reversal', 'continuation', 'trade type']) ?? DEFAULT_FIELD_MAP.reversalContinuation,
    drawInLiquidity: findProp(props, 'multi_select', ['draw in liquidity', 'draw', 'liquidity']) ?? DEFAULT_FIELD_MAP.drawInLiquidity,
    poi: findProp(props, 'multi_select', ['poi', 'point of interest', 'entry zone', 'zone', 'level']) ?? DEFAULT_FIELD_MAP.poi,
    lowerTimeEntry: findProp(props, 'multi_select', ['lower time entry', 'lte', 'lower tf entry']) ?? DEFAULT_FIELD_MAP.lowerTimeEntry,
    rulesFeelings: findProp(props, 'multi_select', ['rules/feeling', 'rules', 'feeling', 'emotion', 'psychology', 'mental']) ?? DEFAULT_FIELD_MAP.rulesFeelings,
    trend: findProp(props, 'multi_select', ['trend', 'market trend', 'higher tf', 'htf trend']) ?? DEFAULT_FIELD_MAP.trend,
    biasForDay: findProp(props, 'multi_select', ['bias for the day', 'bias', 'daily bias', 'day bias']) ?? DEFAULT_FIELD_MAP.biasForDay,
    rateTrade: findProp(props, 'multi_select', ['rate trade', 'rating', 'grade', 'quality', 'score']) ?? DEFAULT_FIELD_MAP.rateTrade,
    tradeIdeaLink: findProp(props, 'url', ['trade idea link', 'trade idea', 'chart link', 'tradingview']) ?? DEFAULT_FIELD_MAP.tradeIdeaLink,
    oneMLink: findProp(props, 'url', ['1m trade link', '1m link', '1 minute', 'entry link']) ?? DEFAULT_FIELD_MAP.oneMLink,
    linkAfter: findProp(props, 'url', ['link to what happened after', 'what happened', 'after link', 'result link']) ?? DEFAULT_FIELD_MAP.linkAfter,
  };
}

function multiSelect(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as Record<string, unknown>;
  if (p.type === 'select') {
    const item = p.select as { name: string } | null;
    return item ? [item.name] : [];
  }
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

export function parseTrade(page: Record<string, unknown>, fieldMap: FieldMap = DEFAULT_FIELD_MAP): Trade {
  const p = page.properties as Record<string, unknown>;
  const dateField = p[fieldMap.date] as Record<string, unknown> | undefined;
  const dateObj = dateField?.date as Record<string, unknown> | undefined;
  const pnlField = p[fieldMap.pnl] as Record<string, unknown> | undefined;
  const tradeIdeaLink = p[fieldMap.tradeIdeaLink] as Record<string, unknown> | undefined;
  const oneMLink = p[fieldMap.oneMLink] as Record<string, unknown> | undefined;
  const linkAfter = p[fieldMap.linkAfter] as Record<string, unknown> | undefined;

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
    day: multiSelect(p[fieldMap.day]),
    time: richTextContent(p[fieldMap.time]),
    tookTrade: multiSelect(p[fieldMap.tookTrade]).map(normalizeTookTrade),
    indices: multiSelect(p[fieldMap.indices]),
    longShort: multiSelect(p[fieldMap.direction]),
    news: multiSelect(p[fieldMap.news]),
    reversalContinuation: multiSelect(p[fieldMap.reversalContinuation]),
    drawInLiquidity: multiSelect(p[fieldMap.drawInLiquidity]),
    poi: multiSelect(p[fieldMap.poi]),
    lowerTimeEntry: multiSelect(p[fieldMap.lowerTimeEntry]),
    rulesFeelings: multiSelect(p[fieldMap.rulesFeelings]),
    trend: multiSelect(p[fieldMap.trend]),
    biasForTheDay: multiSelect(p[fieldMap.biasForDay]),
    rateTrade: multiSelect(p[fieldMap.rateTrade]),
    winLose: multiSelect(p[fieldMap.winLose]).map(normalizeWinLose),
    pnl: (pnlField?.number as number) ?? null,
    notes: richTextContent(p[fieldMap.notes]),
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
  return creds?.dbId ?? process.env.NOTION_DATABASE_ID ?? '';
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

export async function getAllTrades(creds?: { key?: string; dbId?: string }): Promise<{ trades: Trade[]; realDbId: string; dbTitle: string; fieldMap: FieldMap }> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);
  const key = creds?.key ?? process.env.NOTION_API_KEY ?? '';
  const headers = makeHeaders(key);

  const tradeMap = new Map<string, Trade>();
  let cursor: string | undefined;
  let firstPage: Record<string, unknown> | undefined;
  let fieldMap: FieldMap | undefined;

  // Primary read: dataSources connector (handles connector IDs)
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
      for (const page of results) {
        const p = page as Record<string, unknown>;
        if (p.properties) {
          if (!fieldMap) fieldMap = buildFieldMap(p.properties as Record<string, { type: string }>);
          const trade = parseTrade(p, fieldMap);
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
          sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
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
          if (!fieldMap && page.properties) fieldMap = buildFieldMap(page.properties as Record<string, { type: string }>);
          const trade = parseTrade(page, fieldMap ?? DEFAULT_FIELD_MAP);
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

  return { trades, realDbId, dbTitle, fieldMap: fieldMap ?? DEFAULT_FIELD_MAP };
}
