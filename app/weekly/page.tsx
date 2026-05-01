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
      <div className="p-6 space-y-5">
        <div style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}>
          <div className="skeleton" style={{ height: 24, width: 120, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 14, width: 180, borderRadius: 6, marginTop: 8 }} />
        </div>
        <div className="skeleton" style={{ height: 40, width: 540, maxWidth: '100%', borderRadius: 12 }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ borderRadius: '1.25rem', padding: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="skeleton" style={{ borderRadius: 'calc(1.25rem - 5px)', height: 76 }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ borderRadius: 16, height: 200 }} />
        <div className="skeleton" style={{ borderRadius: 16, height: 300 }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="pb-1" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <h1
          className="font-bold"
          style={{ fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
        >
          Recap
        </h1>
        <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)', letterSpacing: '0.01em' }}>
          {periodLabel}
        </p>
      </div>

      {/* Range selector */}
      <div className="space-y-3">
        <div
          className="flex flex-wrap items-center gap-0.5 p-1 rounded-xl w-fit"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {PRESETS.map((r) => {
            const isActive = mode === 'preset' && range === r;
            return (
              <button
                key={r}
                onClick={() => { setMode('preset'); setRange(r); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: isActive ? 'var(--blue)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 160ms var(--ease-out)',
                  boxShadow: isActive ? '0 1px 4px rgba(59,130,246,0.3)' : 'none',
                }}
              >
                {DATE_RANGE_LABELS[r]}
              </button>
            );
          })}
          <button
            onClick={() => setMode('custom')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: mode === 'custom' ? 'var(--purple)' : 'transparent',
              color: mode === 'custom' ? 'white' : 'var(--text-secondary)',
              fontWeight: mode === 'custom' ? 600 : 400,
              transition: 'all 160ms var(--ease-out)',
              boxShadow: mode === 'custom' ? '0 1px 4px rgba(124,58,237,0.3)' : 'none',
            }}
          >
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
            {/* Total PNL */}
            <div style={{ borderRadius: '1.25rem', padding: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              <div style={{ borderRadius: 'calc(1.25rem - 5px)', padding: '14px 18px 16px', background: 'var(--bg-card)', borderTop: `2px solid ${stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}`, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 7 }}>Total PNL</div>
                <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color: stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {formatPnl(stats.totalPnl)}
                </div>
              </div>
            </div>
            {/* Win Rate */}
            <div style={{ borderRadius: '1.25rem', padding: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              <div style={{ borderRadius: 'calc(1.25rem - 5px)', padding: '14px 18px 16px', background: 'var(--bg-card)', borderTop: `2px solid ${stats.winRate >= 50 ? 'var(--green)' : 'var(--red)'}`, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 7 }}>Win Rate</div>
                <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color: stats.winRate >= 50 ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {stats.winRate.toFixed(1)}%
                </div>
              </div>
            </div>
            {/* Trades */}
            <div style={{ borderRadius: '1.25rem', padding: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              <div style={{ borderRadius: 'calc(1.25rem - 5px)', padding: '14px 18px 16px', background: 'var(--bg-card)', borderTop: '2px solid var(--blue)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 7 }}>Trades</div>
                <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', letterSpacing: '-0.03em', lineHeight: 1 }}>{stats.tradedDays}</div>
                <div className="tabular" style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, letterSpacing: '-0.01em' }}>
                  {stats.wins}W / {stats.losses}L / {stats.breakevens}BE
                </div>
              </div>
            </div>
            {/* Wins / Losses */}
            <div style={{ borderRadius: '1.25rem', padding: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              <div style={{ borderRadius: 'calc(1.25rem - 5px)', padding: '14px 18px 16px', background: 'var(--bg-card)', borderTop: '2px solid var(--border-hover)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 7 }}>Wins / Losses</div>
                <div className="tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                  {formatPnl(periodTrades.filter((t) => t.winLose.includes('win')).reduce((s, t) => s + (t.pnl ?? 0), 0))}
                </div>
                <div className="tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                  {formatPnl(periodTrades.filter((t) => t.winLose.includes('lose')).reduce((s, t) => s + (t.pnl ?? 0), 0))}
                </div>
              </div>
            </div>
          </div>

          {/* Day-by-day grid — only for single-week views */}
          {isWeekView && (
            <div
              className="rounded-2xl p-5"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>עסקאות השבוע</div>
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
          <div
            className="rounded-2xl p-5"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>פירוט עסקאות</div>
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
          <div
            className="rounded-2xl p-5"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
            }}
          >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {summarySource === 'ai' ? 'AI Summary' : 'Period Summary'}
                  </div>
                  {summarySource && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: summarySource === 'ai' ? 'var(--purple-dim)' : 'var(--blue-dim)',
                        color: summarySource === 'ai' ? 'var(--purple)' : 'var(--blue)',
                        border: `1px solid ${summarySource === 'ai' ? 'rgba(124,58,237,0.28)' : 'rgba(59,130,246,0.22)'}`,
                      }}
                    >
                      {summarySource === 'ai' ? 'Gemini 2.5 Flash' : 'Statistical'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, marginTop: 3, color: 'var(--text-secondary)' }}>
                  ניתוח אוטומטי לתקופה: {periodLabel}
                </div>
              </div>
              <button
                onClick={generateSummary}
                disabled={summaryLoading || periodTrades.length === 0}
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  background: 'var(--blue)',
                  color: 'white',
                  border: 'none',
                  cursor: summaryLoading ? 'wait' : 'pointer',
                  opacity: summaryLoading || periodTrades.length === 0 ? 0.45 : 1,
                  transition: 'all 160ms var(--ease-out)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 3px 12px rgba(59,130,246,0.18)',
                }}
                onMouseDown={(e) => { if (!summaryLoading) e.currentTarget.style.transform = 'scale(0.97) translateY(1px)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
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
              <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--purple)',
                        opacity: 0.7,
                        animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gemini מנתח...</div>
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
