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
        <div className="px-5 pb-5 space-y-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="pt-4 flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              {selectedDate}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{
              background: `color-mix(in srgb, ${dayColor(selectedDay)} 15%, transparent)`,
              color: dayColor(selectedDay),
              border: `1px solid color-mix(in srgb, ${dayColor(selectedDay)} 25%, transparent)`,
            }}>
              {selectedDay.isTrade ? 'TOOK TRADE' : 'NO TRADE'}
            </span>
          </div>
          {selectedDay.isTrade
            ? selectedDay.entries.filter(t => t.tookTrade.includes('TOOK TRADE')).map(t => <TradeDetailCard key={t.id} trade={t} />)
            : selectedDay.entries.map(t => t.notes?.trim() ? (
                <div key={t.id} className="rounded-xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid color-mix(in srgb, var(--blue) 20%, var(--border-color))' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', borderLeft: '2px solid var(--blue)', paddingLeft: 10 }}>
                    {t.notes}
                  </p>
                </div>
              ) : null)
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
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const closeOnBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setLightboxIdx(null);
  }, []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') setLightboxIdx(i => i !== null ? Math.min(i + 1, t.images.length - 1) : null);
      if (e.key === 'ArrowLeft')  setLightboxIdx(i => i !== null ? Math.max(i - 1, 0) : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, t.images.length]);

  return (
    <>
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-surface)', border: `1px solid color-mix(in srgb, ${resultColor} 20%, var(--border-color))` }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {t.winLose[0] && <Badge label={t.winLose[0].toUpperCase()} color={resultColor} />}
            {t.rateTrade[0] && <Badge label={t.rateTrade[0]} color={ratingColor} />}
            {t.indices.map(i => <Badge key={i} label={i} color="var(--blue)" />)}
            {t.longShort.map(d => <Badge key={d} label={d.toUpperCase()} color={d === 'long' ? 'var(--green)' : 'var(--red)'} />)}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Image thumbnails */}
            {t.images.map((url, idx) => (
              <button
                key={idx}
                onClick={() => setLightboxIdx(idx)}
                className="rounded-lg overflow-hidden transition-all hover:opacity-80 hover:scale-105"
                style={{ width: 48, height: 36, border: `1px solid color-mix(in srgb, ${resultColor} 30%, var(--border-color))`, cursor: 'zoom-in', flexShrink: 0 }}
                aria-label={`תמונה ${idx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`chart ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
            {t.pnl !== null && (
              <span className="text-lg font-bold tabular" style={{ color: resultColor }}>
                {t.pnl >= 0 ? '+' : ''}${t.pnl}
              </span>
            )}
          </div>
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
          <div className="text-xs p-3 rounded-lg leading-relaxed" style={{
            background: 'var(--bg-card)', color: 'var(--text-secondary)',
            borderLeft: `2px solid ${resultColor}`,
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

      {/* Lightbox */}
      {lightboxIdx !== null && t.images[lightboxIdx] && (
        <div
          onClick={closeOnBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
        >
          <div className="relative max-w-5xl w-full mx-4 flex flex-col items-center gap-3">
            {/* Top bar */}
            <div className="flex items-center justify-between w-full">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {lightboxIdx + 1} / {t.images.length}
              </span>
              <button
                onClick={() => setLightboxIdx(null)}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: 'rgba(255,255,255,0.6)' }}
                aria-label="סגור"
              >
                ✕ סגור
              </button>
            </div>

            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.images[lightboxIdx]}
              alt={`chart ${lightboxIdx + 1}`}
              className="rounded-xl w-full h-auto"
              style={{ maxHeight: '80vh', objectFit: 'contain' }}
            />

            {/* Prev / Next */}
            {t.images.length > 1 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setLightboxIdx(i => i !== null ? Math.max(i - 1, 0) : 0)}
                  disabled={lightboxIdx === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightboxIdx === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightboxIdx === 0 ? 'default' : 'pointer',
                  }}
                >
                  ← הקודם
                </button>
                {/* Dot indicators */}
                <div className="flex gap-1.5">
                  {t.images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIdx(i)}
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: i === lightboxIdx ? 'white' : 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', border: 'none', padding: 0,
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setLightboxIdx(i => i !== null ? Math.min(i + 1, t.images.length - 1) : 0)}
                  disabled={lightboxIdx === t.images.length - 1}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: lightboxIdx === t.images.length - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
                    cursor: lightboxIdx === t.images.length - 1 ? 'default' : 'pointer',
                  }}
                >
                  הבא →
                </button>
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
