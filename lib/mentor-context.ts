// Builds a compact, token-efficient journal context block for the mentor chat,
// scoped by the router decision. Reuses calculateStats / getWinRateByField / getActualTrades.

import type { Trade } from './types';
import { calculateStats, getWinRateByField } from './utils';

function isActualTrade(t: Trade): boolean {
  return t.tookTrade.includes('TOOK TRADE');
}

export type JournalScope = 'all' | 'range' | 'recent';

export interface RouterDecision {
  needsJournal: boolean;
  scope: JournalScope;
  startDate?: string;
  endDate?: string;
}

function topItems(trades: Trade[], field: keyof Trade, n = 3): string {
  const map: Record<string, number> = {};
  for (const t of trades) {
    const vals = t[field] as unknown;
    if (!Array.isArray(vals)) continue;
    for (const v of vals as string[]) if (v?.trim()) map[v] = (map[v] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v})`)
    .join(', ') || '—';
}

// Trade line WITHOUT the free-text note — keeps chronology/outcome for the answer pass.
// Raw notes are handled separately (paraphrased server-side) so the answer model never
// sees verbatim text it could quote back to the user.
function tradeLine(t: Trade): string {
  const res = t.winLose[0] ?? '?';
  const pnl = t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(0)}` : '—';
  const rate = t.rateTrade[0] ? ` ${t.rateTrade[0]}` : '';
  return `${t.date ?? '?'} | ${res} | ${pnl}${rate}`;
}

// Raw free-text notes for the paraphrase pass only (never sent to the answer pass).
// Includes watching-day notes (entries without a trade) so the mentor can spot misses /
// hesitation patterns, not just executed-trade behavior. If no entry has the 'TOOK TRADE'
// marker, the client's DB lacks the field — tag everything generically.
export function rawNotesBlock(scoped: Trade[]): string {
  const anyMarked = scoped.some(isActualTrade);
  return scoped
    .filter((t) => t.notes?.trim())
    .map((t) => {
      if (!anyMarked) return `- ${t.notes!.trim()}`;
      return isActualTrade(t)
        ? `- [עסקה] ${t.notes!.trim()}`
        : `- [יום צפייה — לא נלקחה עסקה] ${t.notes!.trim()}`;
    })
    .join('\n');
}

// Returns the date range available in the journal (for the router prompt).
export function journalDateBounds(trades: Trade[]): { first: string; last: string; count: number } {
  const dates = trades.map((t) => t.date).filter(Boolean) as string[];
  if (dates.length === 0) return { first: '—', last: '—', count: 0 };
  const sorted = [...dates].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1], count: trades.length };
}

// Selects the journal entries relevant to the router decision.
// Includes BOTH executed trades and watching days (no trade taken) — the mentor needs both
// to identify misses, hesitation, and over-/under-trading patterns.
export function scopeTrades(all: Trade[], decision: RouterDecision): Trade[] {
  const dated = all.filter((t) => t.date);
  switch (decision.scope) {
    case 'range': {
      const s = decision.startDate ?? '0000-00-00';
      const e = decision.endDate ?? '9999-99-99';
      return dated.filter((t) => t.date! >= s && t.date! <= e);
    }
    case 'recent':
      return dated.slice(-30);
    case 'all':
    default:
      return dated;
  }
}

// Builds the textual context block sent to the answer pass.
// For large journals (scope=all) it leans on aggregate stats + a capped trade list
// so we never dump the entire raw journal.
// `notesInsights` is the server-side paraphrased digest of the raw notes (no verbatim text).
export function buildJournalContext(scoped: Trade[], decision: RouterDecision, notesInsights = ''): string {
  if (scoped.length === 0) {
    return 'הקשר יומן: לא נמצאו רשומות בטווח המבוקש.';
  }

  // If NO entry in scope has 'TOOK TRADE' set, the client's DB likely lacks the field
  // (or uses different values entirely). Treat all entries as trades so the mentor still works
  // — mirrors the fallback in getActualTrades (utils.ts).
  const anyMarked = scoped.some(isActualTrade);
  const actual = anyMarked ? scoped.filter(isActualTrade) : scoped;
  const watching = anyMarked ? scoped.filter((t) => !isActualTrade(t)) : [];

  const stats = calculateStats(actual);
  const wins = actual.filter((t) => t.winLose.includes('win'));
  const losses = actual.filter((t) => t.winLose.includes('lose'));

  const periodTxt = decision.scope === 'range'
    ? `${decision.startDate ?? '?'} עד ${decision.endDate ?? '?'}`
    : decision.scope === 'recent' ? '30 הרשומות האחרונות' : 'כל היומן';
  const header = anyMarked
    ? `📓 הקשר יומן (${periodTxt}) — ${actual.length} ימי מסחר, ${watching.length} ימי צפייה`
    : `📓 הקשר יומן (${periodTxt}) — ${actual.length} רשומות (אין שדה "Took a trade today?" — אין הפרדה בין ימי מסחר לצפייה)`;

  const statsBlock = actual.length > 0
    ? `סיכום מסחר: ${stats.tradedDays} עסקאות | ${stats.wins}W/${stats.losses}L${stats.breakevens ? `/${stats.breakevens}BE` : ''} | Win Rate ${stats.winRate.toFixed(0)}% | PNL ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(0)} | טוב ביותר +$${stats.bestTrade.toFixed(0)} | גרוע ביותר $${stats.worstTrade.toFixed(0)}
דירוג: ${getWinRateByField(actual, 'rateTrade').map((g) => `${g.label} ${g.winRate}% (${g.total})`).join(' | ') || '—'}
POI בניצחונות: ${topItems(wins, 'poi')} | POI בהפסדים: ${topItems(losses, 'poi')}
רגשות בניצחונות: ${topItems(wins, 'rulesFeelings')} | רגשות בהפסדים: ${topItems(losses, 'rulesFeelings')}`
    : 'סיכום מסחר: אין עסקאות שבוצעו בתקופה — רק ימי צפייה.';

  // Cap the per-entry list so scope=all on a big journal stays bounded.
  const cap = 100;
  const actualList = decision.scope === 'all' && actual.length > cap ? actual.slice(-cap) : actual;
  const watchingList = decision.scope === 'all' && watching.length > cap ? watching.slice(-cap) : watching;

  const tradesBlock = actualList.length > 0
    ? actualList.map(tradeLine).join('\n')
    : '(אין עסקאות שבוצעו בתקופה)';
  const watchingBlock = watchingList.length > 0
    ? watchingList.map((t) => `${t.date ?? '?'} | יום צפייה${t.notes?.trim() ? ' | יש הערה' : ' | אין הערה'}`).join('\n')
    : '(אין ימי צפייה בתקופה)';

  const truncNote = (actualList.length < actual.length || watchingList.length < watching.length)
    ? `\n(הרשימות מקוצצות ל-${cap} אחרונות לכל סוג; הסטטיסטיקה מכסה את הכל)`
    : '';

  const insightsBlock = notesInsights.trim()
    ? `★★★ המקור העיקרי — מה שהסוחר כתב בעצמו (גם בימי מסחר וגם בימי צפייה), מנוסח מחדש. בנה את עיקר התשובה סביב זה, אל תצטט מילולית: ★★★\n${notesInsights.trim()}`
    : '(אין טקסט חופשי בתקופה זו — הסתמך על הנתונים למטה)';

  const watchingSection = anyMarked
    ? `\n\nימי צפייה (תאריך | סטטוס | הערה?) — שים לב לפספוסי הזדמנויות / היסוס / שגרה לא יציבה:\n${watchingBlock}`
    : '';

  return `${header}

${insightsBlock}

— — — נתונים תומכים (משניים — רק לאישוש/חידוד מה שעולה מהטקסט) — — —
${statsBlock}

${anyMarked ? 'ימי מסחר' : 'רשומות'} (תאריך | תוצאה | PNL | דירוג):
${tradesBlock}${watchingSection}${truncNote}`;
}
