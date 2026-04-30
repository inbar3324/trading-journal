// READ-ONLY Notion client — never calls create/update/delete
import { Client } from '@notionhq/client';
import type { Trade } from './types';

const notion = new Client({ auth: process.env.NOTION_API_KEY, timeoutMs: 8000 });

// Data source ID for "2026 מסחר" (the collection ID, not the database page ID)
const DATA_SOURCE_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';

function multiSelect(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as Record<string, unknown>;
  if (p.type !== 'multi_select') return [];
  const items = p.multi_select as Array<{ name: string }>;
  return Array.isArray(items) ? items.map((o) => o.name) : [];
}

function filesFirstUrl(prop: unknown): string | null {
  if (!prop || typeof prop !== 'object') return null;
  const p = prop as Record<string, unknown>;
  if (p.type !== 'files') return null;
  const files = p.files as Array<Record<string, unknown>>;
  if (!Array.isArray(files) || files.length === 0) return null;
  const first = files[0];
  if (first.type === 'file') return ((first.file as Record<string, unknown>)?.url as string) ?? null;
  if (first.type === 'external') return ((first.external as Record<string, unknown>)?.url as string) ?? null;
  return null;
}

function richTextContent(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return '';
  const p = prop as Record<string, unknown>;
  // Notion stores title fields under .title and rich_text fields under .rich_text
  const segments = (p.title ?? p.rich_text) as Array<{ plain_text: string }> | undefined;
  return Array.isArray(segments) ? segments.map((s) => s.plain_text).join('') : '';
}

function parseTrade(page: Record<string, unknown>): Trade {
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
  const images: string[] = [];
  if (coverUrl) images.push(coverUrl);
  for (const val of Object.values(p)) {
    const url = filesFirstUrl(val);
    if (url && !images.includes(url)) images.push(url);
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

export async function getAllTrades(): Promise<Trade[]> {
  const trades: Trade[] = [];
  let cursor: string | undefined;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (notion.dataSources as any).query({
      data_source_id: DATA_SOURCE_ID,
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
