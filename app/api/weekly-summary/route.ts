import type { Trade } from '@/lib/types';
import { generateStatsSummary } from '@/lib/utils';

export const runtime = 'edge';
export const maxDuration = 60;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.startsWith('AIza')) {
    const summary = generateStatsSummary(trades, weekStart, weekEnd);
    return Response.json({ summary, source: 'stats' });
  }

  const winTrades  = trades.filter((t) => t.winLose.includes('win'));
  const lossTrades = trades.filter((t) => t.winLose.includes('lose'));
  const wins       = winTrades.length;
  const losses     = lossTrades.length;
  const totalPnl   = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winRate    = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0';

  const avgWin      = wins   > 0 ? winTrades.reduce((s, t)  => s + (t.pnl ?? 0), 0) / wins   : 0;
  const avgLoss     = losses > 0 ? lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses : 0;
  const bestTrade   = trades.length > 0 ? Math.max(...trades.map((t) => t.pnl ?? 0)) : 0;
  const worstTrade  = trades.length > 0 ? Math.min(...trades.map((t) => t.pnl ?? 0)) : 0;

  const ratingStats = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C'].flatMap((r) => {
    const g = trades.filter((t) => t.rateTrade.includes(r));
    if (g.length === 0) return [];
    const w = g.filter((t) => t.winLose.includes('win')).length;
    const l = g.filter((t) => t.winLose.includes('lose')).length;
    const wr = w + l > 0 ? Math.round((w / (w + l)) * 100) : 0;
    return [`${r}: ${wr}% (${g.length})`];
  }).join(' | ') || '—';

  const analyticsBlock = `📊 דפוסים מחושבים:
• ממוצע ניצחון: +$${avgWin.toFixed(2)} | ממוצע הפסד: $${avgLoss.toFixed(2)}
• הכי טוב: +$${bestTrade.toFixed(2)} | הכי גרוע: $${worstTrade.toFixed(2)}
• ביצועים לפי דירוג: ${ratingStats}
• POI בניצחונות: ${topItems(winTrades, 'poi')}
• POI בהפסדים: ${topItems(lossTrades, 'poi')}
• רגשות בניצחונות: ${topItems(winTrades, 'rulesFeelings')}
• רגשות בהפסדים: ${topItems(lossTrades, 'rulesFeelings')}`;

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
  TYPE C — Repeated hesitation or over-filtering that causes missed wins consistently

A note is a SOLUTION/PLAN — NOT a problem — if the trader describes a choice, method, or future intention:
  → "כניסה במארקט במקום לימיט" = entry method description or plan. NOT a problem.
  → "הפעם אכנס", "אנסה", "החלטתי" = future plan. NOT a problem.

A note is an OBSERVATION (market description) or REFLECTION (neutral thought) — NOT a problem.

If a note is ambiguous — default to NOT treating it as a problem.

━━ PROFESSIONAL TRADING MENTOR KNOWLEDGE ━━

You understand trading deeply. When you identify a problem, derive the solution using real trading logic:

- Stopped out then trade goes to target → Stop is placed too tight. Solution: widen to the next logical level (swing, FVG, OB), reduce position size to keep the same dollar risk.
- Missed trades because limit didn't fill → Over-relying on precise entry. Solution: use a small zone instead of a single price, or switch to market/stop-limit entry at confirmation.
- Exiting early before target → Fear overrides the plan. Solution: define TP before entry and make it non-negotiable.
- Overtrading → No filter. Solution: pick one setup per session. Everything else is observation only.
- Revenge trades → Emotional reaction. Solution: mandatory 30-minute break after any loss.
- Entering without a clear plan → Impulsive execution. Solution: write the trade thesis before touching the order.

━━ rulesFeelings FIELD ━━

Tags like "FINE SETUP", "GOOD R:R", "MY BIAS WAS RIGHT", "followed plan", "good execution" are quality assessments — NOT emotions. Only tags like FOMO, revenge, fear, hesitation describe emotional states. Do NOT mention this field unless it shows a clear emotional pattern.

━━ ANALYSIS PROCESS ━━
1. Read every NOTES entry. Classify each one: problem / solution / observation / reflection.
2. Group the PROBLEM entries by theme. What is the underlying behavior causing the issue?
3. Count how many entries share the same root cause. The most frequent root cause is the finding.
4. Describe it as a behavioral pattern — not a list of incidents.

RULES:
- Write in Hebrew (second person).
- One specific problem only — the most damaging and most recurring.
- Every sentence must be traceable to multiple journal entries, not one note.
- No generic advice. No invented patterns.

TONE: Professional mentor. Evidence-based. Sharp. Direct.`;

  const userPrompt = `תקופה: ${weekStart} עד ${weekEnd}
${trades.length} עסקאות | ${wins}W / ${losses}L | Win Rate: ${winRate}% | PNL: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}

━━━ יומן (המקור העיקרי לניתוח) ━━━
${journalNotesBlock || '(אין הערות בתקופה זו)'}

━━━ נתונים סטטיסטיים ━━━
${analyticsBlock}

---
כתוב בדיוק שלושה סעיפים, כל אחד 2-3 משפטים:

## מה קרה
תיאור התקופה — שלב מספרים עם מה שעולה מהיומן. אל תציין תאריכים.

## בעיה שחוזרת על עצמה
סווג כל ערך NOTES לפני שכותב. ספור רק בעיות אמיתיות. תאר: מה קורה, מתי זה מופעל, למה זה פוגע בביצועים.

## פתרון
פעולה אחת ספציפית שנגזרת ישירות מהבעיה. אפשר לבצע כבר בסשן הבא.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok || !geminiRes.body) {
      throw new Error(`Gemini ${geminiRes.status}`);
    }

    const reader  = geminiRes.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const json = line.slice(6).trim();
              if (!json || json === '[DONE]') continue;
              try {
                const chunk = JSON.parse(json);
                const text  = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                if (text) controller.enqueue(new TextEncoder().encode(text));
              } catch { /* skip malformed chunk */ }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Summary-Source': 'ai',
        'Cache-Control': 'no-cache',
      },
    });

  } catch {
    const summary = generateStatsSummary(trades, weekStart, weekEnd);
    return Response.json({ summary, source: 'stats' });
  }
}
