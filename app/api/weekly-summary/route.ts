import type { Trade } from '@/lib/types';
import { generateStatsSummary } from '@/lib/utils';

function topItems(trades: Trade[], field: keyof Trade, n = 3): string {
  const map: Record<string, number> = {};
  for (const t of trades) {
    const vals = t[field] as string[];
    if (!Array.isArray(vals)) continue;
    for (const v of vals) if (v?.trim()) map[v] = (map[v] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} (${v}x)`)
    .join(', ') || '—';
}

export async function POST(request: Request) {
  let trades: Trade[] = [];
  let journalEntries: Trade[] | undefined;
  let weekStart = '';
  let weekEnd = '';
  let freeNotes = '';

  try {
    const body = await request.json();
    trades         = body.trades         ?? [];
    journalEntries = body.journalEntries;
    weekStart      = body.weekStart      ?? '';
    weekEnd        = body.weekEnd        ?? '';
    freeNotes      = body.freeNotes      ?? '';
  } catch {
    return Response.json({ error: 'שגיאה בקריאת הנתונים' }, { status: 400 });
  }

  try {

    const apiKey = process.env.GEMINI_API_KEY;
    const hasKey = !!apiKey?.startsWith('AIza');

    if (!hasKey) {
      const summary = generateStatsSummary(trades, weekStart, weekEnd);
      return Response.json({ summary, source: 'stats' });
    }

    const winTrades  = trades.filter((t) => t.winLose.includes('win'));
    const lossTrades = trades.filter((t) => t.winLose.includes('lose'));
    const wins    = winTrades.length;
    const losses  = lossTrades.length;
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

    const avgWin  = wins  > 0 ? winTrades.reduce((s, t)  => s + (t.pnl ?? 0), 0) / wins  : 0;
    const avgLoss = losses > 0 ? lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses : 0;
    const bestTrade  = trades.length > 0 ? Math.max(...trades.map((t) => t.pnl ?? 0)) : 0;
    const worstTrade = trades.length > 0 ? Math.min(...trades.map((t) => t.pnl ?? 0)) : 0;

    // Rating breakdown
    const ratingStats = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C'].flatMap((r) => {
      const g = trades.filter((t) => t.rateTrade.includes(r));
      if (g.length === 0) return [];
      const w = g.filter((t) => t.winLose.includes('win')).length;
      const l = g.filter((t) => t.winLose.includes('lose')).length;
      const wr = w + l > 0 ? Math.round((w / (w + l)) * 100) : 0;
      return [`${r}: ${wr}% (${g.length})`];
    }).join(' | ') || '—';

    // Analytical patterns block
    const analyticsBlock = `
📊 דפוסים מחושבים:
• ממוצע ניצחון: +$${avgWin.toFixed(2)} | ממוצע הפסד: $${avgLoss.toFixed(2)}
• הכי טוב: +$${bestTrade.toFixed(2)} | הכי גרוע: $${worstTrade.toFixed(2)}
• ביצועים לפי דירוג: ${ratingStats}
• POI בניצחונות: ${topItems(winTrades, 'poi')}
• POI בהפסדים: ${topItems(lossTrades, 'poi')}
• רגשות בניצחונות: ${topItems(winTrades, 'rulesFeelings')}
• רגשות בהפסדים: ${topItems(lossTrades, 'rulesFeelings')}`.trim();

    const isLargePeriod = trades.length > 20;

    // Extract all free-text notes as the primary analysis source
    const allEntries = journalEntries ?? [];
    const journalNotesBlock = [
      ...trades
        .filter((t) => t.notes?.trim())
        .map((t) => {
          const ctx = [t.winLose[0] ?? '?', t.rateTrade[0], t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl}` : null]
            .filter(Boolean).join(' | ');
          return `[${ctx}] ${t.notes!.trim()}`;
        }),
      ...allEntries
        .filter((t) => !t.tookTrade.includes('TOOK TRADE') && t.notes?.trim())
        .map((t) => `[ימי צפייה] ${t.notes!.trim()}`),
      ...(freeNotes.trim() ? [`[הערות חופשיות] ${freeNotes.trim()}`] : []),
    ].join('\n\n');

    const systemPrompt = `You are a professional trading mentor and data analyst reading a trader's personal journal. Your only job in the "בעיה שחוזרת על עצמה" section is to find the real behavioral problem — the mistake that actually cost money or discipline. Nothing else.

━━ HOW TO CLASSIFY EACH NOTE ━━

A note is a PROBLEM if it contains any of these:
  TYPE A — Execution mistake: something went wrong, loss of discipline
    → "לא הייתי צריך", "טעיתי", "יצאתי מוקדם", "נכנסתי בלי תוכנית", "לא כיבדתי", "נקמה", "פחד"
  TYPE B — Missed opportunity: trader saw a valid setup but didn't take it, and it worked
    → "פספסתי", "לא נכנסתי", "חיכיתי ל", "הלך בלי", "ראיתי אבל", "החמצתי"
    → "שמתי לימיט", "לימיט לא נגע", "לא מילא" — placed a limit order that didn't fill, missed the move
    → "הוציא אותי והלך", "יצאתי והלך לניצחון", "הסטופ נגע והלך", "יצא בסטופ ואז הלך" — stopped out then trade went to target
    → Example: waiting for a retracement/limit that never came, or getting stopped out right before the win
  TYPE C — Repeated hesitation or over-filtering that causes missed wins consistently

A note is a SOLUTION/PLAN — NOT a problem — if the trader describes a choice, method, or future intention:
  → "כניסה במארקט במקום לימיט" = entry method description or plan. NOT a problem.
  → "הפעם אכנס", "אנסה", "החלטתי" = future plan. NOT a problem.

A note is an OBSERVATION (market description) or REFLECTION (neutral thought) — NOT a problem.

If a note is ambiguous — default to NOT treating it as a problem.

━━ PROFESSIONAL TRADING MENTOR KNOWLEDGE ━━

You understand trading deeply. When you identify a problem, derive the solution using real trading logic:

- Stopped out then trade goes to target →
  Stop is placed too tight relative to market structure. Solution: widen the stop to the next logical level (swing, FVG, OB), reduce position size to keep the same dollar risk. Never move the stop closer — move it to where the trade idea is actually invalidated.

- Missed trades because limit didn't fill →
  Over-relying on precise entry. Solution: use a small zone instead of a single price, or switch to market/stop-limit entry at confirmation. A slightly worse entry is better than no trade.

- Exiting early before target →
  Fear overrides the plan. Solution: define TP before entry and make it non-negotiable. Close the screen after entry — no monitoring until SL or TP is hit.

- Overtrading / too many trades →
  No filter. Solution: pick one setup per session in the morning. Everything else is observation only.

- Revenge trades after a loss →
  Emotional reaction. Solution: mandatory 30-minute break after any loss before re-evaluating.

- Entering without a clear plan →
  Impulsive execution. Solution: write the trade thesis (entry reason, SL level, TP level) before touching the order.

Use this knowledge when deriving the פתרון section. The solution must match the specific problem found — not be a generic list.

━━ rulesFeelings FIELD — THIS IS NOT AN EMOTION LIST ━━

This field contains custom self-assessment tags the trader assigns. Most tags are quality or process assessments:
  → "FINE SETUP", "GOOD R:R", "MY BIAS WAS RIGHT", "followed plan", "good execution" = quality assessments. NEVER call these emotions.
  → Only tags like FOMO, revenge, fear, hesitation, overconfidence describe emotional states.
  → Do NOT mention this field in the analysis unless it shows a clear emotional pattern.

━━ ANALYSIS PROCESS ━━
1. Read every NOTES entry. Classify each one: problem / solution / observation / reflection.
2. Group the PROBLEM entries by theme — what is the underlying behavior causing the issue?
   Ask yourself: is the trader losing money, missing trades, or breaking discipline? What specifically?
3. Count how many entries share the same root cause. The most frequent root cause is the finding.
4. Describe it as a behavioral pattern with a cause and effect — not a list of incidents.
   What does the trader do → what happens as a result → why it costs them.

RULES:
- Write in Hebrew (second person).
- One specific problem only — the most damaging and most recurring.
- Every sentence must be traceable to multiple journal entries, not one note.
- No generic advice. No invented patterns. No surface reading.

TONE: Professional mentor. Evidence-based. Sharp. Direct.`;

    const userPrompt = `תקופה: ${weekStart} עד ${weekEnd}
${trades.length} עסקאות | ${wins}W / ${losses}L | Win Rate: ${winRate}% | PNL: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}

━━━ יומן טקסט חופשי (זה המקור העיקרי שלך לניתוח) ━━━
${journalNotesBlock || '(אין הערות בתקופה זו)'}

━━━ נתונים סטטיסטיים (הקשר בלבד) ━━━
${analyticsBlock}

---
כתוב בדיוק שלושה סעיפים. כל סעיף 2-3 משפטים. כל מסקנה חייבת לנבוע ממה שכתוב ביומן:

## מה קרה
תיאור התקופה — שלב מספרים (win rate, PnL) עם מה שעולה מהיומן. אל תציין תאריכים.

## בעיה שחוזרת על עצמה
לפני שכותב: סווג כל ערך NOTES — בעיה אמיתית, פתרון מתוכנן, תצפית שוק, או רפלקציה. ספור רק את הבעיות האמיתיות. מה הבעיה שמופיעה הכי הרבה פעמים או גורמת לנזק הגדול ביותר? תאר: מה קורה, מתי זה מופעל, ולמה זה פוגע בביצועים. אל תתבלבל בין פתרון שנרשם לבין בעיה.

## פתרון
הפתרון נגזר ישירות מהבעיה שזיהית — לא מידע כללי. שאל את עצמך: מה השינוי ההתנהגותי המינימלי שחותך את שורש הבעיה? תן פעולה אחת, ספציפית, שאפשר לבצע כבר בסשן הבא. הפתרון חייב להיות מחובר לבעיה שמצאת — אם הבעיה שונה, הפתרון שונה.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error: ${response.status} — ${errBody.slice(0, 200)}`);
    }

    const data = await response.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return Response.json({ summary, source: 'ai' });

  } catch (err) {
    const errMsg = String(err);
    console.error('Weekly summary error:', errMsg);
    try {
      const summary = generateStatsSummary(trades, weekStart, weekEnd);
      return Response.json({ summary, source: 'stats', debug: errMsg });
    } catch {
      return Response.json({ error: 'שגיאה ביצירת הסיכום' }, { status: 500 });
    }
  }
}
