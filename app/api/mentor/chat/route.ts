import type { Trade } from '@/lib/types';
import { getAllTrades } from '@/lib/notion';
import { getDateRangeBounds, toISODate, type DateRange } from '@/lib/utils';
import { MENTOR_SYSTEM_PROMPT } from '@/lib/mentor-knowledge';
import {
  buildJournalContext, scopeTrades, journalDateBounds, rawNotesBlock,
  type RouterDecision,
} from '@/lib/mentor-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'gemini-2.5-flash';

interface ChatMessage { role: 'user' | 'model'; content: string }

function mentorKeys(): string[] {
  return [process.env.MENTOR_GEMINI_KEY, process.env.MENTOR_GEMINI_KEY_2]
    .filter((k): k is string => !!k?.startsWith('AIza'));
}

// ── Pass 1: deterministic router — does the question need the journal, at what scope? ──
// Heuristic over the Hebrew text: predictable, instant, free. Matches the user's intent:
// general personal question → whole journal; period-specific → that period only; pure
// knowledge / mental / external question → no journal context (no wasted tokens).
function routeQuestion(question: string): RouterDecision {
  const q = question;

  // Personal / journal signals — references to the trader's own data, not generic terms.
  // Hebrew + English.
  const personal = /שלי|אצלי|היומן|יומן שלי|סחרתי|נכנסתי|יצאתי|הרווחתי|הפסדתי|ביצועים|התקדמ|שיפור|השתפר|הסטטיסטיק|הטעות|הטעויות|הדפוס|הדפוסים|כמה עסקאות|כמה ימים|כמה הרווח|כמה הפסד|win[- ]?rate|\bmy (?:\w+ ){0,2}(trade|trades|trading|mistake|mistakes|journal|performance|results?|stats?|losses?|pnl|setups?|patterns?|entr(?:y|ies)|wins?)\b|\bhow am i\b|\bimprov(?:e|ing|ement)\b|\bprogress\b|\b(?:do|did|was|have) i\b[^?.!]{0,40}\b(?:trade|win|los|profit|mistake|pattern|improv|better|worse|wrong|right|consistent|enter|exit|setup|pnl|journal)\w*/i;
  if (!personal.test(q)) return { needsJournal: false, scope: 'all' };

  // "two months / two weeks" — must precede the single-month/week rules (substring overlap:
  // "החודשיים" contains "החודש", "השבועיים" contains "השבוע").
  if (/חודשיים|שני חודשים|2 חודשים|last two months|past two months|last 2 months|past 2 months|two months|2 months/i.test(q)) {
    const d = new Date(); d.setMonth(d.getMonth() - 2);
    return { needsJournal: true, scope: 'range', startDate: toISODate(d), endDate: toISODate(new Date()) };
  }
  if (/שבועיים|שני שבועות|2 שבועות|last two weeks|past two weeks|two weeks|last 2 weeks|past 2 weeks|2 weeks/i.test(q)) {
    const d = new Date(); d.setDate(d.getDate() - 14);
    return { needsJournal: true, scope: 'range', startDate: toISODate(d), endDate: toISODate(new Date()) };
  }

  // Period detection → scope=range with computed bounds. Hebrew + English.
  const periodToRange: Array<[RegExp, DateRange]> = [
    [/חודש שעבר|החודש שעבר|חודש קודם|last month|past month|previous month/i, 'last_month'],
    [/שבוע שעבר|השבוע שעבר|שבוע קודם|last week|past week|previous week/i, 'last_week'],
    [/3 חודשים|שלושה חודשים|רבעון|3 months|three months|last 3 months|past 3 months|last quarter|quarter/i, '3_months'],
    [/החודש|החודש הזה|this month|current month/i, 'this_month'],
    [/השבוע|השבוע הזה|this week|current week/i, 'this_week'],
    [/השנה|השנה הזו|מתחילת השנה|this year|year to date|ytd/i, 'this_year'],
    [/היום|today/i, 'today'],
  ];
  for (const [re, range] of periodToRange) {
    if (re.test(q)) {
      const [startDate, endDate] = getDateRangeBounds(range);
      return { needsJournal: true, scope: 'range', startDate, endDate };
    }
  }

  // Explicit ISO date or date range in the text.
  const isoDates = q.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoDates && isoDates.length >= 1) {
    const sorted = [...isoDates].sort();
    return { needsJournal: true, scope: 'range', startDate: sorted[0], endDate: sorted[sorted.length - 1] };
  }

  // "yesterday".
  if (/אתמול|yesterday/i.test(q)) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const d = toISODate(y);
    return { needsJournal: true, scope: 'range', startDate: d, endDate: d };
  }

  // Fuzzy "recently / last trades" → recent.
  if (/לאחרונה|אחרונ|לאחרו|הזמן האחרון|recently|lately|recent|last few|past few/i.test(q)) {
    return { needsJournal: true, scope: 'recent' };
  }

  // General personal question with no period → whole journal.
  return { needsJournal: true, scope: 'all' };
}

// ── Paraphrase pass: turn raw journal notes into neutral third-person insights. ──
// The answer model never sees the raw notes, so it cannot quote the trader verbatim.
async function paraphraseNotes(rawNotes: string, keys: string[]): Promise<string> {
  const prompt = `אתה אנליסט מסחר. לפניך הערות יומן גולמיות שכתב סוחר (בגוף ראשון). כל שורה מתחילה בתגית: [עסקה] = יום שבו בוצעה עסקה, [יום צפייה — לא נלקחה עסקה] = יום שבו רק צפה בשוק ולא נכנס לעסקה. זהו המקור הכי חשוב להבנת הסוחר.
המשימה: לזקק את **כל** מה שעולה מהן לתובנות, באופן יסודי — אל תפספס שום נושא שחוזר או שמשמעותי.
חוקים קשיחים:
- בגוף שלישי או פנייה כללית, בלי שום ציטוט מילולי, בלי מרכאות, בלי תאריכים, בלי להעתיק משפטים.
- כסה הכל: דפוסים התנהגותיים, רגשות, סיבות לכניסה/יציאה, מה תכנן מול מה שעשה בפועל, טעויות חוזרות, וגם חוזקות והתקדמות.
- **התייחס בנפרד גם לימי הצפייה:** האם יש דפוס של היסוס, פספוסי הזדמנויות, חשש להיכנס, או תצפיות חיוביות שלא תורגמו לפעולה? סמן את התובנות הקשורות לימי צפייה במפורש.
- 6 עד 10 תובנות קצרות וממוקדות (כולל לפחות 1-2 על ימי הצפייה אם יש כאלה). כל תובנה = שורה אחת שמתחילה ב-"- ".
- אם דבר חוזר בכמה הערות — סמן אותו כדפוס חוזר וציין כמה פעמים בערך.
- שמור על הניואנסים והטון של הסוחר (ביטחון, תסכול, היסוס) — הם חשובים לניתוח.

הערות הסוחר:
${rawNotes}`;

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1000, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
  });

  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text.trim()) return text.trim();
    } catch { /* try next key */ }
  }
  return '';
}

export async function POST(request: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = await request.json();
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return Response.json({ error: 'שגיאה בקריאת הנתונים' }, { status: 400 });
  }

  const keys = mentorKeys();
  if (keys.length === 0) {
    return Response.json({ error: 'מפתחות Gemini של המנטור לא מוגדרים' }, { status: 500 });
  }

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content?.trim()) {
    return Response.json({ error: 'אין שאלה' }, { status: 400 });
  }

  // ── Build journal context (only when the router says it's needed) ──
  const notionKey = request.headers.get('x-notion-key') ?? undefined;
  const dbId = request.headers.get('x-notion-db') ?? undefined;

  let journalContext = '';
  if (notionKey) {
    try {
      const decision = routeQuestion(lastUser.content);
      if (decision.needsJournal) {
        const { trades } = await getAllTrades({ key: notionKey, dbId });
        if (journalDateBounds(trades).count > 0) {
          const scoped = scopeTrades(trades as Trade[], decision);
          const rawNotes = rawNotesBlock(scoped);
          const notesInsights = rawNotes ? await paraphraseNotes(rawNotes, keys) : '';
          journalContext = buildJournalContext(scoped, decision, notesInsights);
        }
      }
    } catch (e) {
      console.error('mentor journal fetch failed:', e instanceof Error ? e.message : e);
    }
  }

  // ── Build multi-turn contents; inject journal context into the last user turn ──
  const contents = messages
    .filter((m) => m.content?.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.content }] }));

  if (journalContext) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        const original = contents[i].parts[0].text;
        contents[i] = {
          role: 'user',
          parts: [{
            text: `הוראה מחייבת: הטקסט שבין הקווים הוא רקע פרטי מהיומן. אסור לצטט ממנו מילולית — לא משפטים, לא תגיות באנגלית, לא תאריכים, לא מרכאות עם טקסט שהסוחר כתב. נסח כל תובנה מחדש לגמרי במילים שלך.
━━━ רקע (אל תצטט) ━━━
${journalContext}
━━━ סוף הרקע — אפס ציטוטים, הכל במילים שלך ━━━

שאלת הסוחר:
${original}`,
          }],
        };
        break;
      }
    }
  }

  // ── Pass 2: stream the mentor answer, with Google Search grounding ──
  const answerBody = JSON.stringify({
    systemInstruction: { parts: [{ text: MENTOR_SYSTEM_PROMPT }] },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 900, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
  });

  let geminiRes: Response | null = null;
  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${key}&alt=sse`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: answerBody },
      );
      if (res.ok && res.body) { geminiRes = res; break; }
    } catch { /* try next key */ }
  }

  if (!geminiRes) {
    return Response.json({ error: 'כל מפתחות ה-AI נכשלו. נסה שוב בעוד רגע.' }, { status: 502 });
  }

  const reader = geminiRes.body!.getReader();
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
              const parts = chunk.candidates?.[0]?.content?.parts ?? [];
              for (const p of parts) {
                if (p.thought) continue; // never stream the model's internal thinking
                if (p.text) controller.enqueue(new TextEncoder().encode(p.text));
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
