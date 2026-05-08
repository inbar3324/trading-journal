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

  let noTradesMode = false;
  let historicalTrades: Trade[] = [];
  let noTradesReasons: string[] = [];

  try {
    const body = await request.json();
    trades           = body.trades           ?? [];
    journalEntries   = body.journalEntries;
    weekStart        = body.weekStart        ?? '';
    weekEnd          = body.weekEnd          ?? '';
    freeNotes        = body.freeNotes        ?? '';
    noTradesMode     = body.noTradesMode     ?? false;
    historicalTrades = body.historicalTrades ?? [];
    noTradesReasons  = body.noTradesReasons  ?? [];
  } catch {
    return Response.json({ error: 'שגיאה בקריאת הנתונים' }, { status: 400 });
  }

  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter((k): k is string => !!k?.startsWith('AIza'));

  if (noTradesMode) {
    const journalBlock = (journalEntries ?? [])
      .filter((t) => t.notes?.trim())
      .map((t) => `${t.date} — ${t.notes!.trim()}`)
      .join('\n') || '(אין רשומות יומן בתקופה זו)';

    const historyBlock = historicalTrades.length > 0
      ? historicalTrades.map((t) => {
          const res = t.winLose[0] ?? '?';
          const pnl = t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—';
          return `${t.date} | ${res} | ${pnl}${t.notes?.trim() ? ` | ${t.notes.trim()}` : ''}`;
        }).join('\n')
      : '(אין עסקאות היסטוריות)';

    const reasonsLine = noTradesReasons.length > 0
      ? noTradesReasons.join(', ')
      : '(לא נבחרו)';

    if (apiKeys.length === 0) {
      return Response.json({
        summary: `## מה קרה\nלא בוצעו עסקאות בתקופה ${weekStart} עד ${weekEnd}.\n\n## דפוס אפשרי\nאין מספיק נתונים לניתוח אוטומטי.\n\n## המלצה\nהוסף הערות ולחץ Generate לניתוח מעמיק.`,
        source: 'stats',
      });
    }

    const noTradesSystemPrompt = `You are a professional trading mentor. The trader had ZERO executed trades in this period.
Your job: analyze why they didn't trade and whether there's a repeating behavioral pattern.

Write in Hebrew (second person). Be evidence-based — only mention patterns if the journal entries or history actually support them. If data is insufficient, say so plainly. No generic advice.`;

    const noTradesUserPrompt = `תקופה ללא עסקאות: ${weekStart} עד ${weekEnd}

יומן התקופה:
${journalBlock}

סיבות שסומנו על ידי הסוחר:
${reasonsLine}

הערות הסוחר:
${freeNotes.trim() || '(לא נכתב)'}

15 העסקאות האחרונות לפני התקופה:
${historyBlock}

---
כתוב בדיוק שלושה סעיפים, כל אחד 2-3 משפטים:

## מה קרה
תאר את ימי ההיעדר — מה עולה מהיומן, מהסיבות שנבחרו, ומההקשר ההיסטורי.

## דפוס אפשרי
האם יש סיבה עקבית להיעדר המסחר? לדוגמא: הפסדים רצופים לפני התקופה, ימים מסוימים, תנאי שוק. אם אין מידע מספיק — כתוב "אין מספיק נתונים לאיתור דפוס".

## המלצה
פעולה אחת ספציפית — האם כדאי לחזור לסחור? כיצד? מה לשים לב אליו?`;

    const noTradesBody = JSON.stringify({
      systemInstruction: { parts: [{ text: noTradesSystemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: noTradesUserPrompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
    });

    try {
      let geminiRes: Response | null = null;
      for (const apiKey of apiKeys) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: noTradesBody }
        );
        if (res.ok && res.body) { geminiRes = res; break; }
      }
      if (!geminiRes) throw new Error('All keys failed');

      const reader  = geminiRes.body!.getReader();
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
                } catch { /* skip */ }
              }
            }
          } finally { controller.close(); }
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Summary-Source': 'ai', 'Cache-Control': 'no-cache' },
      });
    } catch {
      return Response.json({
        summary: `## מה קרה\nלא בוצעו עסקאות בתקופה ${weekStart} עד ${weekEnd}.\n\n## דפוס אפשרי\nאין מספיק נתונים לניתוח אוטומטי.\n\n## המלצה\nהוסף הערות ולחץ Generate לניתוח מעמיק.`,
        source: 'stats',
      });
    }
  }

  if (apiKeys.length === 0) {
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

You understand trading deeply. When you identify a problem, derive the solution using real trading logic.
This is a reference library — only apply a pattern if multiple journal entries actually support it. Never project a pattern that isn't there.

- Stop too tight relative to market volatility → Trader is stopped out on normal noise, then watches the move continue. Solution: set stop at the next structural level (swing, FVG, OB), not a fixed dollar amount.
- FOMO entry after the ideal entry zone already passed → Entering with a bad R:R chasing a move. Solution: if price moved beyond the entry range, the trade is cancelled — not modified.
- Moving stop further away to "give the trade room" → A small loss becomes a large one. Solution: stop is defined before entry and never moved wider.
- Exiting a good trade early out of fear of giving back profit → Destroys long-term expectancy. Solution: define target before entry and make it non-negotiable.
- Taking too many trades in one session → Quality drops as edge dilutes. Solution: set a hard daily max trade count.
- Doubling position size after a loss → Emotional decision that amplifies drawdown. Solution: fixed position size for the entire day, decided before the session.
- Not taking an excellent setup due to fear of another loss → Fear causes the trader to miss their best edge. Solution: the first A+ setup of the day is mandatory.
- Continued trading after hitting daily profit target → Greed returns profits to the market. Solution: once daily target is hit, session ends.
- Continued trading after daily loss limit → A bad day becomes a disaster. Solution: automatic stop after maximum daily loss, no exceptions.
- Entering before clear confirmation → More fakeouts, weaker entries. Solution: entry only after candle close or confirmed signal.
- Trading during major news events → Unpredictable volatility destroys setups. Solution: no trading X minutes before and after scheduled news.
- Switching strategies every few days → Not enough data to know what actually works. Solution: commit to one setup for a defined period.
- Trading out of boredom when there's no clear setup → Forcing trades with no edge. Solution: if no valid setup appears in a defined time window, close the platform.
- Moving target further out of greed mid-trade → Good trades reverse before hitting the new target. Solution: target is set before entry and never changed.
- Taking a trade against the primary trend → Fighting the dominant market flow. Solution: entries only in the direction of the main trend.
- Entering too early at market open before price stabilizes → High noise, low directional conviction. Solution: wait a defined number of minutes after open before trading.
- Not stopping after a streak of consecutive losses → Deteriorating mindset leads to worse decisions. Solution: after X consecutive losses, mandatory break — session over.
- Closing partial position too early → Reduces the potential of winning trades. Solution: partial exits only according to a pre-defined rule, never improvised.
- Checking PNL frequently during the session → Decisions become money-based instead of setup-based. Solution: hide PNL during trading hours.
- Entering without a defined stop and target → Improvising under pressure leads to poor exits. Solution: stop and target must be defined before touching the order.
- Not doing a weekly review → The same mistakes repeat indefinitely. Solution: end-of-week review is mandatory, not optional.

IMPORTANT: The list above is a reference library, not a checklist. Only surface a pattern if the journal notes independently point to it. If the notes don't support a pattern — ignore it. The primary source is always what the trader actually wrote.

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

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  try {
    let geminiRes: Response | null = null;
    for (const apiKey of apiKeys) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );
      if (res.ok && res.body) { geminiRes = res; break; }
    }

    if (!geminiRes) {
      throw new Error('All keys failed');
    }

    const reader  = geminiRes!.body!.getReader();
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
