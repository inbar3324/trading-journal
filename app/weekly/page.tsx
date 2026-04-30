'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Trade } from '@/lib/types';
import {
  getActualTrades, calculateStats, formatPnl,
  filterByDateRange, toISODate, getWeekStart,
  DATE_RANGE_LABELS, type DateRange,
} from '@/lib/utils';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';

const PRESETS: DateRange[] = ['today', 'this_week', 'last_week', 'this_month', '3_months', 'this_year', 'all'];

function SummaryRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div dir="rtl" style={{ textAlign: 'right', lineHeight: '1.8' }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <div key={i} className="flex items-center gap-2 mt-5 mb-2 first:mt-0"
              style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {line.replace('## ', '')}
              </span>
            </div>
          );
        }
        if (line.trim() === '' || line.startsWith('---')) return <div key={i} className="h-1.5" />;
        // Score line: starts with digit/10
        const scoreMatch = line.match(/^(\d+)\/10(.*)$/);
        if (scoreMatch) {
          const score = parseInt(scoreMatch[1]);
          const rest = scoreMatch[2].replace(/^[\s—–-]+/, '');
          const color = score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--yellow)' : 'var(--red)';
          return (
            <div key={i} className="flex items-center gap-3 mt-1 p-3 rounded-xl"
              style={{ background: 'var(--bg-surface)', border: `1px solid var(--border-color)` }}>
              <span className="text-2xl font-bold tabular" style={{ color }}>{score}/10</span>
              {rest && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{rest}</span>}
            </div>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>
                : part
            )}
          </div>
        );
      })}
    </div>
  );
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function WeeklyPage() {
  const [allTrades, setAllTrades]           = useState<Trade[]>([]);
  const [loading, setLoading]               = useState(true);
  const [mode, setMode]                     = useState<'preset' | 'custom'>('preset');
  const [range, setRange]                   = useState<DateRange>('last_week');
  const [customFrom, setCustomFrom]         = useState('');
  const [customTo, setCustomTo]             = useState(toISODate(new Date()));
  const [summary, setSummary]               = useState('');
  const [summarySource, setSummarySource]   = useState<'ai' | 'stats' | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError]     = useState<string | null>(null);
  const [freeNotes, setFreeNotes]           = useState('');

  useEffect(() => {
    fetch('/api/trades', { headers: notionHeaders(getNotionConfig()) })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAllTrades(data.trades);
      })
      .finally(() => setLoading(false));
  }, []);

  // Filtered actual trades for the selected period
  const periodTrades = useMemo(() => {
    const actual = getActualTrades(allTrades);
    if (mode === 'custom') {
      if (!customFrom || !customTo) return [];
      return actual.filter((t) => t.date && t.date >= customFrom && t.date <= customTo);
    }
    return filterByDateRange(actual, range);
  }, [allTrades, mode, range, customFrom, customTo]);

  const periodLabel = mode === 'custom'
    ? (customFrom && customTo ? `${customFrom} — ${customTo}` : 'בחר תאריכים')
    : DATE_RANGE_LABELS[range];

  const [periodStart, periodEnd] = useMemo(() => {
    if (mode === 'custom') return [customFrom, customTo];
    const dates = periodTrades.map((t) => t.date).filter(Boolean) as string[];
    return [dates[0] ?? '', dates[dates.length - 1] ?? ''];
  }, [mode, customFrom, customTo, periodTrades]);

  // Day-by-day grid only for single-week presets
  const isWeekView = mode === 'preset' && (range === 'this_week' || range === 'last_week');
  const weekDays = useMemo(() => {
    if (!isWeekView) return [];
    const now = new Date();
    const monday = range === 'last_week' ? getWeekStart(addDays(now, -7)) : getWeekStart(now);
    return Array.from({ length: 5 }, (_, i) => toISODate(addDays(monday, i)));
  }, [isWeekView, range]);

  const stats = calculateStats(periodTrades);

  // Clear summary when period changes
  useEffect(() => {
    setSummary('');
    setSummaryError(null);
    setSummarySource(null);
  }, [range, mode, customFrom, customTo]);

  // Auto-generate summary when trades load
  useEffect(() => {
    if (allTrades.length === 0) return;
    const actual = filterByDateRange(getActualTrades(allTrades), 'last_week');
    if (actual.length === 0) return;
    runSummary(actual, allTrades);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrades]);

  async function callSummary(body: object) {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary('');
    setSummarySource(null);
    try {
      const res = await fetch('/api/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/plain') && res.body) {
        setSummarySource('ai');
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setSummary(text);
        }
      } else {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSummary(data.summary);
        setSummarySource(data.source ?? null);
      }
    } catch (e: unknown) {
      setSummaryError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSummaryLoading(false);
    }
  }

  async function runSummary(trades: Trade[], all: Trade[]) {
    const dates   = trades.map((t) => t.date).filter(Boolean) as string[];
    const start   = dates[0] ?? '';
    const end     = dates[dates.length - 1] ?? '';
    const journal = all.filter((t) => t.date && start && end && t.date >= start && t.date <= end);
    await callSummary({ trades, journalEntries: journal, weekStart: start, weekEnd: end, freeNotes });
  }

  async function generateSummary() {
    if (periodTrades.length === 0) return;
    const journal = allTrades.filter(
      (t) => t.date && periodStart && periodEnd && t.date >= periodStart && t.date <= periodEnd,
    );
    await callSummary({ trades: periodTrades, journalEntries: journal, weekStart: periodStart, weekEnd: periodEnd, freeNotes });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin mx-auto"
            style={{ borderColor: 'var(--border-hover)', borderTopColor: 'var(--blue)' }}
          />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Recap</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{periodLabel}</p>
      </div>

      {/* Range selector */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          {PRESETS.map((r) => (
            <button key={r}
              onClick={() => { setMode('preset'); setRange(r); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: mode === 'preset' && range === r ? 'var(--blue)' : 'transparent',
                color: mode === 'preset' && range === r ? 'white' : 'var(--text-secondary)',
              }}>
              {DATE_RANGE_LABELS[r]}
            </button>
          ))}
          <button
            onClick={() => setMode('custom')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: mode === 'custom' ? 'var(--purple)' : 'transparent',
              color: mode === 'custom' ? 'white' : 'var(--text-secondary)',
            }}>
            תאריך מותאם
          </button>
        </div>

        {/* Custom date range picker */}
        {mode === 'custom' && (
          <div className="flex items-center gap-3 p-3 rounded-xl w-fit"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>מ:</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
            </div>
            <span style={{ color: 'var(--text-muted)' }}>—</span>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>עד:</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs px-2 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {periodTrades.length === 0 ? (
        <div className="rounded-xl p-8 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>לא נרשמו עסקאות בתקופה: <strong style={{ color: 'var(--text-primary)' }}>{periodLabel}</strong></div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>Total PNL</div>
              <div className="text-2xl font-bold" style={{ color: stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatPnl(stats.totalPnl)}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>Win Rate</div>
              <div className="text-2xl font-bold" style={{ color: stats.winRate >= 50 ? 'var(--green)' : 'var(--red)' }}>
                {stats.winRate.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--text-secondary)' }}>Trades</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--blue)' }}>{stats.tradedDays}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {stats.wins}W / {stats.losses}L / {stats.breakevens}BE
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Wins / Losses</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--green)' }}>
                {formatPnl(periodTrades.filter((t) => t.winLose.includes('win')).reduce((s, t) => s + (t.pnl ?? 0), 0))}
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--red)' }}>
                {formatPnl(periodTrades.filter((t) => t.winLose.includes('lose')).reduce((s, t) => s + (t.pnl ?? 0), 0))}
              </div>
            </div>
          </div>

          {/* Day-by-day grid — only for single-week views */}
          {isWeekView && (
            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>עסקאות השבוע</div>
              <div className="grid grid-cols-5 gap-3">
                {weekDays.map((day, idx) => {
                  const dayTrades = periodTrades.filter((t) => t.date === day);
                  const dayPnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
                  const dayLabel = ['שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'][idx];
                  const hasWin  = dayTrades.some((t) => t.winLose.includes('win'));
                  const hasLoss = dayTrades.some((t) => t.winLose.includes('lose'));
                  const borderColor = dayTrades.length === 0 ? 'var(--border-color)'
                    : hasWin && !hasLoss ? 'var(--green)'
                    : hasLoss && !hasWin ? 'var(--red)'
                    : 'var(--yellow)';
                  return (
                    <div key={day} className="rounded-lg p-3 text-xs"
                      style={{ background: 'var(--bg-surface)', border: `1px solid ${borderColor}` }}>
                      <div className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{dayLabel}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{day}</div>
                      {dayTrades.length === 0 ? (
                        <div className="mt-2" style={{ color: 'var(--text-secondary)' }}>—</div>
                      ) : (
                        <div className="mt-2 space-y-1">
                          {dayTrades.map((t) => {
                            const c = t.winLose.includes('win') ? 'var(--green)' : t.winLose.includes('lose') ? 'var(--red)' : 'var(--text-secondary)';
                            return (
                              <div key={t.id} style={{ color: c }}>
                                {t.pnl !== null ? formatPnl(t.pnl) : t.winLose[0] ?? '—'}
                              </div>
                            );
                          })}
                          <div className="pt-1 font-semibold"
                            style={{ color: dayPnl >= 0 ? 'var(--green)' : 'var(--red)', borderTop: '1px solid var(--border-color)' }}>
                            {formatPnl(dayPnl)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Trade Details Table */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>פירוט עסקאות</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    {['תאריך', 'אינדקס', 'כיוון', 'POI', 'דירוג', 'תוצאה', 'PNL', 'הערות'].map((h) => (
                      <th key={h} className="text-left pb-3 pr-4 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodTrades.map((t) => {
                    const isWin  = t.winLose.includes('win');
                    const isLoss = t.winLose.includes('lose');
                    const c = isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-secondary)';
                    return (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{t.date}</td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-primary)' }}>{t.indices.join(', ') || '—'}</td>
                        <td className="py-2.5 pr-4" style={{ color: t.longShort[0] === 'long' ? 'var(--green)' : 'var(--red)' }}>
                          {t.longShort[0] ?? '—'}
                        </td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{t.poi.join(', ') || '—'}</td>
                        <td className="py-2.5 pr-4">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                            background: t.rateTrade[0]?.startsWith('A') ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                            color: t.rateTrade[0]?.startsWith('A') ? 'var(--green)' : 'var(--yellow)',
                          }}>
                            {t.rateTrade[0] ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4" style={{ color: c }}>{t.winLose[0] ?? '—'}</td>
                        <td className="py-2.5 pr-4 font-semibold" style={{ color: c }}>
                          {t.pnl !== null ? formatPnl(t.pnl) : '—'}
                        </td>
                        <td className="py-2.5" style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            {/* Free-text notes — shown when no trade notes exist */}
            {periodTrades.every((t) => !t.notes?.trim()) && (
              <div className="mb-5">
                <div className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  הערות חופשיות לסיכום
                </div>
                <textarea
                  value={freeNotes}
                  onChange={(e) => setFreeNotes(e.target.value)}
                  placeholder="אין הערות ב-Notion — כתוב כאן מה קרה השבוע, מה עבד, מה לא..."
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    lineHeight: 1.7,
                  }}
                  dir="rtl"
                />
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {summarySource === 'ai' ? 'AI Summary' : 'Period Summary'}
                  </div>
                  {summarySource && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      background: summarySource === 'ai' ? 'var(--purple-dim)' : 'var(--blue-dim)',
                      color: summarySource === 'ai' ? 'var(--purple)' : 'var(--blue)',
                      border: `1px solid ${summarySource === 'ai' ? 'rgba(124,58,237,0.3)' : 'rgba(59,130,246,0.25)'}`,
                    }}>
                      {summarySource === 'ai' ? 'Gemini 2.5 Flash' : 'Statistical'}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  ניתוח אוטומטי לתקופה: {periodLabel}
                </div>
              </div>
              <button
                onClick={generateSummary}
                disabled={summaryLoading || periodTrades.length === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: 'var(--blue)',
                  color: 'white',
                  cursor: summaryLoading ? 'wait' : 'pointer',
                }}
              >
                {summaryLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {summaryError && (
              <div className="text-xs p-3 rounded-lg"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}>
                שגיאה: {summaryError}
              </div>
            )}

            {summaryLoading && !summary && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--border-hover)', borderTopColor: 'var(--purple)' }}
                />
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Gemini מנתח...</div>
              </div>
            )}

            {summary && <SummaryRenderer text={summary} />}

            {!summary && !summaryLoading && !summaryError && (
              <div className="text-sm text-center py-8 rounded-lg"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                לחץ על &ldquo;Generate&rdquo; לקבלת ניתוח של התקופה
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
