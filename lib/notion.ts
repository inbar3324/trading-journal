import { Client } from '@notionhq/client';
import type { Trade, TradeInput, NotionSchema } from './types';

const DEFAULT_DB_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';

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
  if (input.notes !== undefined) p['NOTES!'] = rt(input.notes ?? '');
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

export async function createTrade(input: TradeInput, creds?: { key?: string; dbId?: string }): Promise<Trade> {
  const notion = makeClient(creds);
  const dbId = resolveDbId(creds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (notion.pages as any).create({
    parent: { database_id: dbId },
    properties: buildProperties(input),
  });
  return parseTrade(page as Record<string, unknown>);
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

export async function getAllTrades(creds?: { key?: string; dbId?: string }): Promise<Trade[]> {
  const notion = makeClient(creds);
  const dataSourceId = resolveDbId(creds);

  const trades: Trade[] = [];
  let cursor: string | undefined;

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
        trades.push(parseTrade(p));
      }
    }

    cursor = (res.next_cursor as string | null) ?? undefined;
  } while (cursor);

  return trades;
}
