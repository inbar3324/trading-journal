'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import type { Trade } from '@/lib/types';
import {
  calculateStats,
  getPnlCurve,
  formatPnl,
  getActualTrades,
  filterByDateRange,
  DATE_RANGE_LABELS,
  type DateRange,
} from '@/lib/utils';
import KpiCard from '@/components/ui/KpiCard';
import PnlChart from '@/components/charts/PnlChart';
import PieDistribution from '@/components/charts/PieDistribution';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';

const RANGES: DateRange[] = ['today', 'this_week', 'last_week', 'this_month', '3_months', 'this_year', 'all'];

export default function DashboardPage() {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>('last_week');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch('/api/trades', { signal: controller.signal, headers: notionHeaders(getNotionConfig()) })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAllTrades(data.trades);
      })
      .catch((e: Error) => setError(
        e.name === 'AbortError' ? 'הבקשה לקחה יותר מדי זמן — נסה לרענן' : e.message
      ))
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const trades = filterByDateRange(allTrades, range);
  const stats = calculateStats(trades);
  const pnlCurve = getPnlCurve(trades);
  const actual = getActualTrades(trades);
  const recentTrades = actual.filter((t) => t.date).slice(-10).reverse();

  const grossWins = actual.filter((t) => t.winLose.includes('win')).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLosses = actual.filter((t) => t.winLose.includes('lose')).reduce((s, t) => s + (t.pnl ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {allTrades.length} ימי מסחר ביומן
          </p>
        </div>
      </div>

      {/* Date Range Tabs */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: range === r ? 'var(--blue)' : 'transparent',
              color: range === r ? 'white' : 'var(--text-secondary)',
            }}
          >
            {DATE_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {actual.length === 0 && (
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
          >
            <CalendarDays size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            No trades found for{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{DATE_RANGE_LABELS[range]}</strong>
          </div>
        </div>
      )}

      {actual.length > 0 && (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              title="Total PNL"
              value={formatPnl(stats.totalPnl)}
              color={stats.totalPnl >= 0 ? 'green' : 'red'}
              subtitle={`${stats.tradedDays} trades`}
            />
            <KpiCard
              title="Win Rate"
              value={`${stats.winRate.toFixed(1)}%`}
              color={stats.winRate >= 50 ? 'green' : 'red'}
              subtitle={`${stats.wins}W / ${stats.losses}L`}
            />
            <div
              className="rounded-xl px-5 pt-4 pb-5 flex flex-col gap-2"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderTop: '2px solid var(--border-hover)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                Gross P&amp;L
              </span>
              <div className="text-xl font-bold tabular" style={{ color: 'var(--green)' }}>{formatPnl(Math.round(grossWins * 100) / 100)}</div>
              <div className="text-xl font-bold tabular" style={{ color: 'var(--red)' }}>{formatPnl(Math.round(grossLosses * 100) / 100)}</div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {stats.wins}W / {stats.losses}L{stats.breakevens > 0 ? ` / ${stats.breakevens} BE` : ''}
              </div>
            </div>
          </div>

          {/* PNL Chart */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Cumulative PNL
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  עקומת רווח / הפסד — {DATE_RANGE_LABELS[range]}
                </div>
              </div>
              <div className="text-lg font-bold" style={{ color: stats.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatPnl(stats.totalPnl)}
              </div>
            </div>
            <PnlChart data={pnlCurve} />
          </div>

          {/* Trade Timeline */}
          <TradeTimeline allTrades={allTrades} />

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Win / Loss / BE</div>
              <PieDistribution wins={stats.wins} losses={stats.losses} breakevens={stats.breakevens} />
            </div>

            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                עסקאות אחרונות
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[200px]">
                {recentTrades.map((t) => {
                  const isWin = t.winLose.includes('win');
                  const isLoss = t.winLose.includes('lose');
                  const color = isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--text-secondary)';
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between text-xs py-1.5"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      <div style={{ color: 'var(--text-secondary)' }}>{t.date}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>{t.indices[0] ?? '—'}</div>
                      <div style={{ color }}>{t.winLose[0] ?? '—'}</div>
                      <div className="font-semibold" style={{ color }}>
                        {t.pnl !== null ? formatPnl(t.pnl) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Trade Calendar Heatmap ───────────────────────────────────────────────────

const CALENDAR_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEK_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface DayData {
  entries: Trade[];
  isTrade: boolean;
  totalPnl: number;
}

function dayColor(d: DayData): string {
  if (!d.isTrade) return 'var(--blue)';
  if (d.totalPnl > 0) return 'var(--green)';
  if (d.totalPnl < 0) return 'var(--red)';
  return 'var(--yellow)';
}

function TradeTimeline({ allTrades }: { allTrades: Trade[] }) {
  const dateMap = useMemo(() => {
    const map = new Map<string, DayData>();
    for (const t of allTrades) {
      if (!t.date) continue;
      const existing = map.get(t.date) ?? { entries: [], isTrade: false, totalPnl: 0 };
      existing.entries.push(t);
      if (t.tookTrade.includes('TOOK TRADE')) {
        existing.isTrade = true;
        existing.totalPnl += t.pnl ?? 0;
      }
      map.set(t.date, existing);
    }
    return map;
  }, [allTrades]);

  const jumpedRef = useRef(false);

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (jumpedRef.current || dateMap.size === 0) return;
    jumpedRef.current = true;
    const dates = Array.from(dateMap.keys()).sort();
    setViewMonth(dates[dates.length - 1].slice(0, 7));
  }, [dateMap]);

  const changeMonth = (delta: number) => {
    const [y, mo] = viewMonth.split('-').map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDate(null);
  };

  const calCells = useMemo(() => {
    const [y, mo] = viewMonth.split('-').map(Number);
    const firstDow = new Date(y, mo - 1, 1).getDay();
    const daysInMonth = new Date(y, mo, 0).getDate();
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const [y, mo] = viewMonth.split('-').map(Number);
  const monthDays = Array.from(dateMap.keys()).filter(d => d.startsWith(viewMonth));
  const monthTrade   = monthDays.filter(d => dateMap.get(d)?.isTrade).length;
  const monthNoTrade = monthDays.filter(d => !dateMap.get(d)?.isTrade).length;

  const selectedDay = selectedDate ? dateMap.get(selectedDate) : undefined;

  if (dateMap.size === 0) return null;

  return (
    <div className="rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Trade Calendar</div>
          <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
            {monthTrade > 0 && <span style={{ color: 'var(--green)' }}>{monthTrade} TOOK TRADE</span>}
            {monthTrade > 0 && monthNoTrade > 0 && <span>·</span>}
            {monthNoTrade > 0 && <span style={{ color: 'var(--blue)' }}>{monthNoTrade} NO TRADE</span>}
            {monthTrade === 0 && monthNoTrade === 0 && <span>אין רשומות בחודש זה</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="prev month">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2.5L5 7l4 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', minWidth: 150, textAlign: 'center' }}>
            {CALENDAR_MONTHS[mo - 1]} {y}
          </span>
          <button onClick={() => changeMonth(1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="next month">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2.5L9 7l-4 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1.5 px-5 mb-2">
        {WEEK_DAYS.map(d => (
          <div key={d} className="text-center"
            style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5 px-5 pb-5">
        {calCells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} style={{ height: 64 }} />;
          const day = dateMap.get(dateStr);
          const isSelected = dateStr === selectedDate;
          const dayNum = parseInt(dateStr.slice(8), 10);
          const base = day ? dayColor(day) : null;
          const intensity = isSelected ? 28 : 18;
          const tradeEntries = day?.entries.filter(t => t.tookTrade.includes('TOOK TRADE')) ?? [];

          return (
            <button
              key={dateStr}
              onClick={() => { if (day) setSelectedDate(isSelected ? null : dateStr); }}
              className="rounded-xl flex flex-col items-center justify-center transition-all"
              style={{
                height: 64,
                gap: 2,
                background: base
                  ? `color-mix(in srgb, ${base} ${intensity}%, var(--bg-surface))`
                  : 'var(--bg-surface)',
                border: `1.5px solid ${
                  isSelected && base ? base
                  : base ? `color-mix(in srgb, ${base} 35%, var(--border-color))`
                  : 'var(--border-color)'}`,
                outline: isSelected && base ? `2px solid ${base}` : 'none',
                outlineOffset: 1,
                cursor: day ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1, color: base ?? 'var(--text-secondary)' }}>
                {dayNum}
              </span>
              {/* TOOK TRADE: PnL + result dots */}
              {day?.isTrade && day.totalPnl !== 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: base! }}>
                  {day.totalPnl >= 0 ? '+' : ''}{day.totalPnl.toFixed(0)}
                </span>
              )}
              {day?.isTrade && tradeEntries.length > 0 && (
                <div style={{ display: 'flex', gap: 2 }}>
                  {tradeEntries.slice(0, 4).map((t, ti) => (
                    <div key={ti} style={{
                      width: 4, height: 4, borderRadius: '50%',
                      background: t.winLose.includes('win') ? 'var(--green)' : t.winLose.includes('lose') ? 'var(--red)' : 'var(--yellow)',
                    }} />
                  ))}
                </div>
              )}
              {/* Label */}
              {day && (
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1, color: base!, textTransform: 'uppercase' }}>
                  {day.isTrade ? 'TOOK TRADE' : 'NO TRADE'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedDate && selectedDay && (
        <div className="px-6 pb-6 space-y-4" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="pt-5 flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-primary)' }}>
              {selectedDate}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-md" style={{
              background: `color-mix(in srgb, ${dayColor(selectedDay)} 15%, transparent)`,
              color: dayColor(selectedDay),
              border: `1px solid color-mix(in srgb, ${dayColor(selectedDay)} 25%, transparent)`,
            }}>
              {selectedDay.isTrade ? 'TOOK TRADE' : 'NO TRADE'}
            </span>
          </div>
          {selectedDay.isTrade
            ? selectedDay.entries.filter(t => t.tookTrade.includes('TOOK TRADE')).map(t => <TradeDetailCard key={t.id} trade={t} />)
            : <NoTradeDayPanel entries={selectedDay.entries} />
          }
        </div>
      )}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-md font-medium" style={{
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      color, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
    }}>{label}</span>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-24 flex-shrink-0 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function TradeDetailCard({ trade: t }: { trade: Trade }) {
  const isWin  = t.winLose.includes('win');
  const isLoss = t.winLose.includes('lose');
  const resultColor = isWin ? 'var(--green)' : isLoss ? 'var(--red)' : 'var(--blue)';
  const ratingColor = t.rateTrade[0]?.startsWith('A') ? 'var(--green)' : t.rateTrade[0]?.startsWith('B') ? 'var(--yellow)' : 'var(--red)';

  const grouped = t.images.reduce<Record<string, string[]>>((acc, { url, label }) => {
    (acc[label] ??= []).push(url);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number; label: string } | null>(null);

  const toggle = useCallback((label: string) =>
    setExpanded(prev => ({ ...prev, [label]: !prev[label] })), []);

  const closeLightbox = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setLightbox(null);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(l => l ? { ...l, idx: Math.min(l.idx + 1, l.urls.length - 1) } : null);
      if (e.key === 'ArrowLeft')  setLightbox(l => l ? { ...l, idx: Math.max(l.idx - 1, 0) } : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: `1px solid color-mix(in srgb, ${resultColor} 20%, var(--border-color))` }}>

        {/* Header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {t.winLose[0] && <Badge label={t.winLose[0].toUpperCase()} color={resultColor} />}
              {t.rateTrade[0] && <Badge label={t.rateTrade[0]} color={ratingColor} />}
              {t.indices.map(i => <Badge key={i} label={i} color="var(--blue)" />)}
              {t.longShort.map(d => <Badge key={d} label={d.toUpperCase()} color={d === 'long' ? 'var(--green)' : 'var(--red)'} />)}
            </div>
            {t.pnl !== null && (
              <span className="text-lg font-bold tabular flex-shrink-0" style={{ color: resultColor }}>
                {t.pnl >= 0 ? '+' : ''}${t.pnl}
              </span>
            )}
          </div>

          {/* Fields grid */}
          <div className="space-y-2">
            {t.poi.length > 0 && (
              <FieldRow label="POI">
                {t.poi.map(v => <Badge key={v} label={v} color="var(--purple)" />)}
              </FieldRow>
            )}
            {t.rulesFeelings.length > 0 && (
              <FieldRow label="Feelings">
                {t.rulesFeelings.map(v => <Badge key={v} label={v} color="var(--teal)" />)}
              </FieldRow>
            )}
            {t.trend.length > 0 && (
              <FieldRow label="Trend">
                {t.trend.map(v => <Badge key={v} label={v} color="var(--text-secondary)" />)}
              </FieldRow>
            )}
            {t.biasForTheDay.length > 0 && (
              <FieldRow label="Bias">
                {t.biasForTheDay.map(v => <Badge key={v} label={v} color="var(--yellow)" />)}
              </FieldRow>
            )}
            {t.drawInLiquidity.length > 0 && (
              <FieldRow label="Draw">
                {t.drawInLiquidity.map(v => <Badge key={v} label={v} color="var(--blue)" />)}
              </FieldRow>
            )}
            {t.reversalContinuation.length > 0 && (
              <FieldRow label="Rev/Cont">
                {t.reversalContinuation.map(v => <Badge key={v} label={v} color="var(--text-secondary)" />)}
              </FieldRow>
            )}
            {t.lowerTimeEntry.length > 0 && (
              <FieldRow label="LTF Entry">
                {t.lowerTimeEntry.map(v => <Badge key={v} label={v} color="var(--purple)" />)}
              </FieldRow>
            )}
            {t.time && (
              <FieldRow label="Time">
                <span style={{ color: 'var(--text-primary)' }}>{t.time}</span>
              </FieldRow>
            )}
          </div>

          {/* Notes */}
          {t.notes?.trim() && (
            <div className="text-sm p-4 rounded-lg" style={{
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              borderLeft: `3px solid ${resultColor}`,
              lineHeight: 1.75,
            }}>
              {t.notes}
            </div>
          )}

          {/* Links */}
          {(t.tradeIdeaLink || t.oneMTradeLink) && (
            <div className="flex gap-3 pt-1">
              {t.tradeIdeaLink && (
                <a href={t.tradeIdeaLink} target="_blank" rel="noreferrer"
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--blue)' }}>
                  Trade Idea ↗
                </a>
              )}
              {t.oneMTradeLink && (
                <a href={t.oneMTradeLink} target="_blank" rel="noreferrer"
                  className="text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ color: 'var(--blue)' }}>
                  1M Chart ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* Image groups accordion */}
        {groupEntries.map(([label, urls], gi) => {
          const isOpen = expanded[label] ?? false;
          const isLast = gi === groupEntries.length - 1;
          return (
            <div key={label} style={{ borderTop: '1px solid var(--border-color)', borderBottom: isLast ? 'none' : undefined }}>
              <button
                onClick={() => toggle(label)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ textAlign: 'left', background: isOpen ? 'var(--bg-card)' : 'transparent' }}
              >
                <div className="rounded-md overflow-hidden flex-shrink-0 relative"
                  style={{ width: 48, height: 36, border: `1px solid color-mix(in srgb, ${resultColor} 30%, var(--border-color))` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[0]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {!isOpen && urls.length > 1 && (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.52)' }}>
                      <span className="text-[10px] font-bold" style={{ color: 'white' }}>+{urls.length - 1}</span>
                    </div>
                  )}
                </div>
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {urls.length > 1 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                      background: `color-mix(in srgb, ${resultColor} 15%, transparent)`,
                      color: resultColor,
                    }}>{urls.length}</span>
                  )}
                  <span style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    display: 'inline-block',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}>▾</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-2 flex flex-wrap gap-3" style={{ background: 'var(--bg-card)' }}>
                  {urls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setLightbox({ urls, idx, label })}
                      className="rounded-lg overflow-hidden transition-all hover:opacity-80 hover:scale-105"
                      style={{ width: 100, height: 75, border: `1px solid color-mix(in srgb, ${resultColor} 30%, var(--border-color))`, cursor: 'zoom-in', flexShrink: 0 }}
                      aria-label={`${label} — תמונה ${idx + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${label} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={closeLightbox}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
        >
          <div className="relative max-w-5xl w-full mx-4 flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {lightbox.idx + 1} / {lightbox.urls.length}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                  background: `color-mix(in srgb, ${resultColor} 25%, transparent)`,
                  color: resultColor,
                  border: `1px solid color-mix(in srgb, ${resultColor} 35%, transparent)`,
                }}>
                  {lightbox.label}
                </span>
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >✕ סגור</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.urls[lightbox.idx]}
              alt={`${lightbox.label} ${lightbox.idx + 1}`}
              className="rounded-xl w-full h-auto"
              style={{ maxHeight: '80vh', objectFit: 'contain' }}
            />
            {lightbox.urls.length > 1 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setLightbox(l => l ? { ...l, idx: Math.max(l.idx - 1, 0) } : null)}
                  disabled={lightbox.idx === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightbox.idx === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightbox.idx === 0 ? 'default' : 'pointer',
                  }}
                >← הקודם</button>
                <div className="flex gap-1.5">
                  {lightbox.urls.map((_, i) => (
                    <button key={i} onClick={() => setLightbox(l => l ? { ...l, idx: i } : null)}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: i === lightbox.idx ? 'white' : 'rgba(255,255,255,0.3)', cursor: 'pointer', border: 'none', padding: 0 }} />
                  ))}
                </div>
                <button
                  onClick={() => setLightbox(l => l ? { ...l, idx: Math.min(l.idx + 1, l.urls.length - 1) } : null)}
                  disabled={lightbox.idx === lightbox.urls.length - 1}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightbox.idx === lightbox.urls.length - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightbox.idx === lightbox.urls.length - 1 ? 'default' : 'pointer',
                  }}
                >הבא →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NoTradeDayPanel({ entries }: { entries: Trade[] }) {
  const allImages = entries.flatMap(t => t.images);
  const notes     = entries.map(t => t.notes?.trim()).filter(Boolean) as string[];

  // Group images by their Notion property label
  const grouped = allImages.reduce<Record<string, string[]>>((acc, { url, label }) => {
    (acc[label] ??= []).push(url);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped);

  const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox]   = useState<{ urls: string[]; idx: number; label: string } | null>(null);

  const toggle = useCallback((label: string) =>
    setExpanded(prev => ({ ...prev, [label]: !prev[label] })), []);

  const closeLightbox = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setLightbox(null);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(l => l ? { ...l, idx: Math.min(l.idx + 1, l.urls.length - 1) } : null);
      if (e.key === 'ArrowLeft')  setLightbox(l => l ? { ...l, idx: Math.max(l.idx - 1, 0) } : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (groupEntries.length === 0 && notes.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
        אין הערות או תמונות ליום זה
      </p>
    );
  }

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>

        {groupEntries.map(([label, urls], gi) => {
          const isOpen = expanded[label] ?? false;
          const isLast = gi === groupEntries.length - 1 && notes.length === 0;
          return (
            <div key={label} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-color)' }}>

              {/* Section header — click to toggle */}
              <button
                onClick={() => toggle(label)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ textAlign: 'left', background: isOpen ? 'var(--bg-card)' : 'transparent' }}
              >
                {/* Thumbnail preview of first image */}
                <div className="rounded-md overflow-hidden flex-shrink-0 relative"
                  style={{ width: 48, height: 36, border: '1px solid var(--border-color)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[0]} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {/* +N overlay when collapsed and multiple images */}
                  {!isOpen && urls.length > 1 && (
                    <div className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.52)' }}>
                      <span className="text-[10px] font-bold" style={{ color: 'white' }}>+{urls.length - 1}</span>
                    </div>
                  )}
                </div>

                {/* Label */}
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>

                {/* Count badge + chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {urls.length > 1 && (
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                      background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
                      color: 'var(--blue)',
                    }}>
                      {urls.length}
                    </span>
                  )}
                  <span style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    display: 'inline-block',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}>▾</span>
                </div>
              </button>

              {/* Expanded: all thumbnails */}
              {isOpen && (
                <div className="px-4 pb-4 pt-2 flex flex-wrap gap-3" style={{ background: 'var(--bg-card)' }}>
                  {urls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setLightbox({ urls, idx, label })}
                      className="rounded-lg overflow-hidden transition-all hover:opacity-80 hover:scale-105"
                      style={{ width: 100, height: 75, border: '1px solid color-mix(in srgb, var(--blue) 30%, var(--border-color))', cursor: 'zoom-in', flexShrink: 0 }}
                      aria-label={`${label} — תמונה ${idx + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${label} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Notes */}
        {notes.map((note, i) => (
          <div key={i} className="text-sm px-5 py-4" style={{
            color: 'var(--text-primary)',
            borderTop: groupEntries.length > 0 || i > 0 ? '1px solid var(--border-color)' : 'none',
            borderLeft: '3px solid var(--blue)',
            lineHeight: 1.75,
          }}>
            {note}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={closeLightbox}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
        >
          <div className="relative max-w-5xl w-full mx-4 flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {lightbox.idx + 1} / {lightbox.urls.length}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                  background: 'color-mix(in srgb, var(--blue) 25%, transparent)',
                  color: 'var(--blue)',
                  border: '1px solid color-mix(in srgb, var(--blue) 35%, transparent)',
                }}>
                  {lightbox.label}
                </span>
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                ✕ סגור
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.urls[lightbox.idx]}
              alt={`${lightbox.label} ${lightbox.idx + 1}`}
              className="rounded-xl w-full h-auto"
              style={{ maxHeight: '80vh', objectFit: 'contain' }}
            />

            {lightbox.urls.length > 1 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setLightbox(l => l ? { ...l, idx: Math.max(l.idx - 1, 0) } : null)}
                  disabled={lightbox.idx === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightbox.idx === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightbox.idx === 0 ? 'default' : 'pointer',
                  }}
                >← הקודם</button>
                <div className="flex gap-1.5">
                  {lightbox.urls.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(l => l ? { ...l, idx: i } : null)}
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: i === lightbox.idx ? 'white' : 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', border: 'none', padding: 0,
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setLightbox(l => l ? { ...l, idx: Math.min(l.idx + 1, l.urls.length - 1) } : null)}
                  disabled={lightbox.idx === lightbox.urls.length - 1}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightbox.idx === lightbox.urls.length - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightbox.idx === lightbox.urls.length - 1 ? 'default' : 'pointer',
                  }}
                >הבא →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-3">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin mx-auto"
          style={{ borderColor: 'var(--border-hover)', borderTopColor: 'var(--blue)' }}
        />
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading from Notion...</div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-screen">
      <div
        className="rounded-xl p-8 max-w-md w-full mx-4 space-y-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Notion Connection Error
          </div>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{message}</div>
        <div
          className="text-xs p-3 rounded-lg space-y-1"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderLeft: '2px solid var(--blue)' }}
        >
          <div>1. Create a Notion Integration at notion.so/my-integrations</div>
          <div>2. Add the Secret to .env.local as NOTION_API_KEY</div>
          <div>3. Share the database with the Integration</div>
        </div>
      </div>
    </div>
  );
}
