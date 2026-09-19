import type { NotionColor, NotionPropValue, SelectOption } from './notion-page';
import type { Trade } from './types';
import type { WColumn, WStore } from './weekly-types';

const NEWS_COLUMN_KEY = 'NEWSOFTHEWEEK';
const WEEK_DATE_KEYS = new Set(['WEEKENDING', 'WEEKDATE', 'WEEK']);
const NOTION_COLORS = new Set<NotionColor>([
  'default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red',
]);

export interface WeeklyNewsPatch {
  rowId: string;
  value: NotionPropValue;
}

export interface WeeklyNewsPlan {
  targetColumn: WColumn | null;
  dateColumn: WColumn | null;
  patches: WeeklyNewsPatch[];
}

function columnKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function sameValue(current: NotionPropValue | undefined, next: NotionPropValue): boolean {
  if (!current || current.type !== next.type) return false;
  if (next.type === 'rich_text') return current.type === 'rich_text' && current.text === next.text;
  if (next.type === 'multi_select') {
    if (current.type !== 'multi_select') return false;
    return current.options.map(option => option.name).join('\u0000')
      === next.options.map(option => option.name).join('\u0000');
  }
  return JSON.stringify(current) === JSON.stringify(next);
}

function notionColor(color: string | undefined): NotionColor {
  return color && NOTION_COLORS.has(color as NotionColor) ? color as NotionColor : 'default';
}

function newsValue(column: WColumn, names: string[]): NotionPropValue | null {
  if (column.type === 'multi_select') {
    const knownOptions = new Map((column.options ?? []).map(option => [option.name, option]));
    const options: SelectOption[] = names.map(name => {
      const known = knownOptions.get(name);
      return { name, color: notionColor(known?.color) };
    });
    return { type: 'multi_select', options };
  }
  if (column.type === 'text') return { type: 'rich_text', text: names.join(', ') };
  return null;
}

function newsInRange(trades: Trade[], start: string, end: string): string[] {
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const seen = new Set<string>();
  const news: string[] = [];

  const sorted = [...trades].sort((a, b) => (dateKey(a.date) ?? '').localeCompare(dateKey(b.date) ?? ''));
  for (const trade of sorted) {
    const tradeDate = dateKey(trade.date);
    if (!tradeDate || tradeDate < first || tradeDate > last) continue;
    for (const item of trade.news) {
      const name = item.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      news.push(name);
    }
  }
  return news;
}

export function buildWeeklyNewsPlan(store: WStore, trades: Trade[]): WeeklyNewsPlan {
  const targetColumn = store.columns.find(column => columnKey(column.name) === NEWS_COLUMN_KEY) ?? null;
  const dateColumns = store.columns.filter(column => column.type === 'date');
  const dateColumn = dateColumns.find(column => WEEK_DATE_KEYS.has(columnKey(column.name)))
    ?? (dateColumns.length === 1 ? dateColumns[0] : null);

  if (!targetColumn || !dateColumn) return { targetColumn, dateColumn, patches: [] };

  const patches: WeeklyNewsPatch[] = [];
  for (const row of store.rows) {
    const period = row.cells[dateColumn.id];
    if (period?.type !== 'date') continue;
    const start = dateKey(period.start);
    const end = dateKey(period.end) ?? start;
    if (!start || !end) continue;

    const value = newsValue(targetColumn, newsInRange(trades, start, end));
    if (value && !sameValue(row.cells[targetColumn.id], value)) {
      patches.push({ rowId: row.id, value });
    }
  }

  return { targetColumn, dateColumn, patches };
}
