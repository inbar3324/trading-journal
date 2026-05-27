// Builds a compact, token-efficient journal context block for the mentor chat,
// scoped by the router decision. Reuses calculateStats / getWinRateByField / getActualTrades.

import type { Trade } from './types';
import { calculateStats, getWinRateByField, getActualTrades } from './utils';

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
export function rawNotesBlock(scoped: Trade[]): string {
  return scoped
    .filter((t) => t.notes?.trim())
    .map((t) => `- ${t.notes!.trim()}`)
    .join('\n');
}

// Returns the date range available in the journal (for the router prompt).
export function journalDateBounds(trades: Trade[]): { first: string; last: string; count: number } {
  const dates = getActualTrades(trades).map((t) => t.date).filter(Boolean) as string[];
  if (dates.length === 0) return { first: '—', last: '—', count: 0 };
  const sorted = [...dates].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1], count: getActualTrades(trades).length };
}

// Selects the trades relevant to the router decision.
export function scopeTrades(all: Trade[], decision: RouterDecision): Trade[] {
  const actual = getActualTrades(all);
  switch (decision.scope) {
    case 'range': {
      const s = decision.startDate ?? '0000-00-00';
      const e = decision.endDate ?? '9999-99-99';
      return actual.filter((t) => t.date && t.date >= s && t.date <= e);
    }
    case 'recent':
      return actual.slice(-20);
    case 'all':
    default:
      return actual;
  }
}

// Builds the textual context block sent to the answer pass.
// For large journals (scope=all) it leans on aggregate stats + a capped trade list
// so we never dump the entire raw journal.
// `notesInsights` is the server-side paraphrased digest of the raw notes (no verbatim text).
export function buildJournalContext(scoped: Trade[], decision: RouterDecision, notesInsights = ''): string {
  if (scoped.length === 0) {
    return 'הקשר יומן: לא נמצאו עסקאות בטווח המבוקש.';
  }

  const stats = calculateStats(scoped);
  const wins = scoped.filter((t) => t.winLose.includes('win'));
  const losses = scoped.filter((t) => t.winLose.includes('lose'));

  const header = `📓 הקשר יומן (${decision.scope === 'range' ? `${decision.startDate ?? '?'} עד ${decision.endDate ?? '?'}` : decision.scope === 'recent' ? '20 העסקאות האחרונות' : 'כל היומן'})`;

  const statsBlock = `סיכום: ${stats.tradedDays} עסקאות | ${stats.wins}W/${stats.losses}L${stats.breakevens ? `/${stats.breakevens}BE` : ''} | Win Rate ${stats.winRate.toFixed(0)}% | PNL ${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(0)} | טוב ביותר +$${stats.bestTrade.toFixed(0)} | גרוע ביותר $${stats.worstTrade.toFixed(0)}
דירוג: ${getWinRateByField(scoped, 'rateTrade').map((g) => `${g.label} ${g.winRate}% (${g.total})`).join(' | ') || '—'}
POI בניצחונות: ${topItems(wins, 'poi')} | POI בהפסדים: ${topItems(losses, 'poi')}
רגשות בניצחונות: ${topItems(wins, 'rulesFeelings')} | רגשות בהפסדים: ${topItems(losses, 'rulesFeelings')}`;

  // Cap the per-trade list so scope=all on a big journal stays bounded.
  const listSource = decision.scope === 'all' && scoped.length > 80 ? scoped.slice(-80) : scoped;
  const tradesBlock = listSource.map(tradeLine).join('\n');
  const truncNote = listSource.length < scoped.length
    ? `\n(מוצגות ${listSource.length} מתוך ${scoped.length} האחרונות; הסטטיסטיקה למעלה מכסה את כולן)`
    : '';

  const insightsBlock = notesInsights.trim()
    ? `★★★ המקור העיקרי — מה שהסוחר כתב בעצמו בטקסט החופשי (מנוסח מחדש). בנה את עיקר התשובה סביב זה, אל תצטט מילולית: ★★★\n${notesInsights.trim()}`
    : '(אין טקסט חופשי בתקופה זו — הסתמך על הנתונים למטה)';

  return `${header}

${insightsBlock}

— — — נתונים תומכים (משניים — רק לאישוש/חידוד מה שעולה מהטקסט) — — —
${statsBlock}

עסקאות לפי סדר כרונולוגי (תאריך | תוצאה | PNL | דירוג):
${tradesBlock}${truncNote}`;
}
