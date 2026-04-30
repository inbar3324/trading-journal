import type { Trade, GroupStat, PnlPoint, DashboardStats } from './types';

export function getActualTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.tookTrade.includes('TOOK TRADE'));
}

export function calculateStats(trades: Trade[]): DashboardStats {
  const actual = getActualTrades(trades);
  const wins = actual.filter((t) => t.winLose.includes('win')).length;
  const losses = actual.filter((t) => t.winLose.includes('lose')).length;
  const breakevens = actual.filter((t) => t.winLose.includes('BRAKEVEN')).length;
  const totalPnl = actual.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const denominator = wins + losses;

  return {
    totalDays: trades.length,
    tradedDays: actual.length,
    wins,
    losses,
    breakevens,
    winRate: denominator > 0 ? (wins / denominator) * 100 : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnl: actual.length > 0 ? Math.round((totalPnl / actual.length) * 100) / 100 : 0,
    bestTrade: actual.length > 0 ? Math.max(...actual.map((t) => t.pnl ?? 0)) : 0,
    worstTrade: actual.length > 0 ? Math.min(...actual.map((t) => t.pnl ?? 0)) : 0,
  };
}

export function getPnlCurve(trades: Trade[]): PnlPoint[] {
  const actual = getActualTrades(trades).filter((t) => t.date !== null && t.pnl !== null);
  let cumulative = 0;
  return actual.map((t) => {
    cumulative += t.pnl!;
    return {
      date: t.date!,
      pnl: t.pnl!,
      cumulative: Math.round(cumulative * 100) / 100,
    };
  });
}

export function getWinRateByField(trades: Trade[], field: keyof Trade): GroupStat[] {
  const actual = getActualTrades(trades);
  const groups: Record<string, { wins: number; losses: number; be: number; pnl: number }> = {};

  for (const trade of actual) {
    const raw = trade[field];
    const values = Array.isArray(raw) ? raw : [];
    if (values.length === 0) continue;

    for (const v of values as string[]) {
      if (!groups[v]) groups[v] = { wins: 0, losses: 0, be: 0, pnl: 0 };
      if (trade.winLose.includes('win')) groups[v].wins++;
      else if (trade.winLose.includes('lose')) groups[v].losses++;
      else if (trade.winLose.includes('BRAKEVEN')) groups[v].be++;
      groups[v].pnl += trade.pnl ?? 0;
    }
  }

  return Object.entries(groups)
    .map(([label, s]) => {
      const total = s.wins + s.losses + s.be;
      const denominator = s.wins + s.losses;
      return {
        label,
        wins: s.wins,
        losses: s.losses,
        breakevens: s.be,
        total,
        winRate: denominator > 0 ? Math.round((s.wins / denominator) * 100) : 0,
        totalPnl: Math.round(s.pnl * 100) / 100,
      };
    })
    .filter((s) => s.total >= 1)
    .sort((a, b) => b.winRate - a.winRate);
}

export function getTradesForWeek(trades: Trade[], weekStart: string, weekEnd: string): Trade[] {
  return getActualTrades(trades).filter((t) => {
    if (!t.date) return false;
    return t.date >= weekStart && t.date <= weekEnd;
  });
}

export function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${value.toFixed(2)}`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISODate(date: Date): string {
  // Use local date parts to avoid UTC offset shifting the date (e.g. UTC+3 midnight = prev day in UTC)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Date range filtering ──────────────────────────────────────────────────────

export type DateRange = 'today' | 'this_week' | 'last_week' | 'this_month' | '3_months' | 'this_year' | 'all';

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: 'היום',
  this_week: 'השבוע',
  last_week: 'שבוע שעבר',
  this_month: 'החודש',
  '3_months': '3 חודשים',
  this_year: 'השנה',
  all: 'הכל',
};

function addDaysToDate(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function filterByDateRange(trades: Trade[], range: DateRange): Trade[] {
  const now = new Date();
  const today = toISODate(now);

  switch (range) {
    case 'today':
      return trades.filter((t) => t.date === today);

    case 'this_week': {
      const start = toISODate(getWeekStart(now));
      const end = toISODate(addDaysToDate(getWeekStart(now), 4));
      return trades.filter((t) => t.date && t.date >= start && t.date <= end);
    }

    case 'last_week': {
      const lastMonday = getWeekStart(addDaysToDate(now, -7));
      const start = toISODate(lastMonday);
      const end = toISODate(addDaysToDate(lastMonday, 4));
      return trades.filter((t) => t.date && t.date >= start && t.date <= end);
    }

    case 'this_month': {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return trades.filter((t) => t.date && t.date >= start && t.date <= today);
    }

    case '3_months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      const start = toISODate(d);
      return trades.filter((t) => t.date && t.date >= start);
    }

    case 'this_year': {
      const start = `${now.getFullYear()}-01-01`;
      return trades.filter((t) => t.date && t.date >= start);
    }

    case 'all':
    default:
      return trades;
  }
}

// ── Correlation matrix ────────────────────────────────────────────────────────

export interface CorrelationCell {
  wins: number;
  losses: number;
  total: number;
  winRate: number | null;
}

export interface CorrelationMatrix {
  rowLabels: string[];
  colLabels: string[];
  cells: Record<string, Record<string, CorrelationCell>>;
}

export function getCorrelationMatrix(
  trades: Trade[],
  fieldA: keyof Trade,
  fieldB: keyof Trade,
  minSamples = 2,
): CorrelationMatrix {
  const actual = getActualTrades(trades);

  const rowSet = new Set<string>();
  const colSet = new Set<string>();

  for (const t of actual) {
    (t[fieldA] as string[]).forEach((v) => rowSet.add(v));
    (t[fieldB] as string[]).forEach((v) => colSet.add(v));
  }

  const cells: Record<string, Record<string, CorrelationCell>> = {};
  for (const row of rowSet) {
    cells[row] = {};
    for (const col of colSet) {
      cells[row][col] = { wins: 0, losses: 0, total: 0, winRate: null };
    }
  }

  for (const t of actual) {
    const aVals = t[fieldA] as string[];
    const bVals = t[fieldB] as string[];
    for (const a of aVals) {
      for (const b of bVals) {
        if (!cells[a]?.[b]) continue;
        cells[a][b].total++;
        if (t.winLose.includes('win')) cells[a][b].wins++;
        else if (t.winLose.includes('lose')) cells[a][b].losses++;
      }
    }
  }

  // Compute win rates and filter out rows/cols with no data
  for (const row of rowSet) {
    for (const col of colSet) {
      const c = cells[row][col];
      const denom = c.wins + c.losses;
      c.winRate = denom >= minSamples ? Math.round((c.wins / denom) * 100) : null;
    }
  }

  // Only keep rows that have at least one cell with enough samples
  const rowLabels = Array.from(rowSet)
    .filter((r) => Object.values(cells[r]).some((c) => c.total >= minSamples))
    .sort();
  const colLabels = Array.from(colSet)
    .filter((col) => rowLabels.some((r) => cells[r][col]?.total >= minSamples))
    .sort();

  return { rowLabels, colLabels, cells };
}

// ── Statistical weekly summary (no API key needed) ───────────────────────────

export function generateStatsSummary(trades: Trade[], weekStart: string, weekEnd: string): string {
  const wins   = trades.filter((t) => t.winLose.includes('win'));
  const losses = trades.filter((t) => t.winLose.includes('lose'));
  const bes    = trades.filter((t) => t.winLose.includes('be') || t.winLose.includes('BE'));
  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const denom  = wins.length + losses.length;
  const winRate = denom > 0 ? Math.round((wins.length / denom) * 100) : 0;

  const top1 = (arr: string[]) => {
    const map: Record<string, number> = {};
    arr.forEach((v) => { if (v?.trim()) map[v] = (map[v] ?? 0) + 1; });
    const e = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return e[0] ?? null;
  };

  const topWinPoi  = top1(wins.flatMap((t) => t.poi));
  const topLossPoi = top1(losses.flatMap((t) => t.poi));
  const topWinFeel = top1(wins.flatMap((t) => t.rulesFeelings));
  const topLossFeel = top1(losses.flatMap((t) => t.rulesFeelings));

  const pnlStr = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`;

  // Section 1
  let s = `## מה קרה\n`;
  const outcome = totalPnl >= 0 ? 'תקופה חיובית' : 'תקופה שלילית';
  s += `${outcome} — ${trades.length} עסקאות עם ${winRate}% אחוז ניצחון ו-PNL של **${pnlStr}**.`;
  if (wins.length === 0) {
    s += ` לא היו ניצחונות בתקופה.`;
  } else if (losses.length === 0) {
    s += ` כל העסקאות הסתיימו בניצחון.`;
  } else {
    s += ` ${wins.length} ניצחונות, ${losses.length} הפסדים${bes.length ? ` ו-${bes.length} BE` : ''}.`;
  }

  // Notes pattern — find repeated themes in notes text only
  const allNotes = trades.map((t) => t.notes ?? '').filter(Boolean).join(' ');
  const noteKeywords: Array<{ pattern: RegExp; label: string; rule: string }> = [
    { pattern: /מארקט|market order|כניסה במארקט/i,
      label: 'כניסה במארקט במקום לימיט',
      rule: 'ניתוח בבוקר = pending limit על הרמה, לא סימון בלבד. אם אין אורדר פתוח כשהשוק מגיע לרמה — העסקה לא קיימת' },
    { pattern: /סטופ.*רחוק|סטופ.*גדול|stop.*wide|לא.*יכול.*להכנס|אין.*מקום.*סטופ/i,
      label: 'סטופ גדול מדי ביחס לגודל הפוזיציה',
      rule: 'להוריד מינוף: לחשב קודם את הסטופ הלוגי (swing, FVG, OB), ואז לחשב גודל פוזיציה שמתאים לו — לא הפוך' },
    { pattern: /סטופ.*קטן|סטופ.*צמוד|stop.*tight/i,
      label: 'סטופ צמוד מדי',
      rule: 'לפני כל כניסה לשאול: האם הסטופ שורד תנודה של 5-10 נקודות? אם לא — להרחיב ולהקטין גודל פוזיציה' },
    { pattern: /הלך.*ניצחון|הוציא.*ת|went to target|הגיע ליעד|הלך לtp|הלך ל-tp/i,
      label: 'יצא לפני שהגיע ליעד',
      rule: 'TP נקבע לפני הכניסה ולא משתנה. אחרי כניסה — לסגור מסך. אין נגיעה בפוזיציה עד TP או SL' },
    { pattern: /פספס|missed|לא נכנס|החמצתי/i,
      label: 'פספס כניסה',
      rule: 'להוריד מינוף כדי שהסטופ הלוגי יתאים לסיכון — לא לוותר על סטאפים טובים בגלל גודל פוזיציה' },
    { pattern: /מוקדם|early exit|יצאתי מוקדם|פחד/i,
      label: 'יציאה מוקדמת מחשש',
      rule: 'לרשום לפני כל כניסה את תנאי היציאה. יוצאים רק כשנשבר הסטופ המוגדר — לא לפני' },
    { pattern: /נקמה|revenge|חזרתי.*הפסד|אחרי.*הפסד.*שוב/i,
      label: 'עסקת נקמה אחרי הפסד',
      rule: 'אחרי הפסד — פלטפורמה נסגרת ל-30 דקות. אחר כך: האם הסטאפ הבא עומד בכל הקריטריונים? אם לא — סיום יום' },
    { pattern: /ממוצע|average down|הוספתי/i,
      label: 'הוספה להפסד',
      rule: 'לקבוע max loss יומי לפני פתיחת השוק. ברגע שמגיעים אליו — פלטפורמה נסגרת. אין חריגים' },
    { pattern: /overtrading|יותר מדי|הרבה עסקאות/i,
      label: 'יותר מדי עסקאות',
      rule: 'בבוקר לבחור סטאפ אחד שעומד בכל הקריטריונים — trade of the day. שאר ההזדמנויות: תצפית בלבד' },
  ];
  const notePatterns = noteKeywords.filter((k) => k.pattern.test(allNotes));

  // Section 2
  s += `\n\n## בעיה שחוזרת על עצמה\n`;
  s += 'לא ניתן לזהות דפוס אוטומטית — לחץ על "צור סיכום" לניתוח AI מלא.';

  // Section 3
  s += `\n\n## פתרון\n`;
  s += 'לניתוח ופתרון מותאם אישית לחץ על "צור סיכום".';

  return s;
}
