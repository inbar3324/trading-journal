'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import type { Trade, FieldMap } from '@/lib/types';
import { getActualTrades } from '@/lib/utils';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';

type TradeArrayField =
  | 'poi' | 'biasForTheDay' | 'drawInLiquidity' | 'lowerTimeEntry'
  | 'indices' | 'longShort' | 'day' | 'reversalContinuation'
  | 'rulesFeelings' | 'news' | 'rateTrade';

const BASE_fields: { key: TradeArrayField; mapKey: keyof FieldMap; label: string }[] = [
  { key: 'poi',                  mapKey: 'poi',                  label: 'POI' },
  { key: 'biasForTheDay',        mapKey: 'biasForDay',           label: 'Bias' },
  { key: 'drawInLiquidity',      mapKey: 'drawInLiquidity',      label: 'Draw on Liquidity' },
  { key: 'lowerTimeEntry',       mapKey: 'lowerTimeEntry',       label: 'Entry Type' },
  { key: 'indices',              mapKey: 'indices',              label: 'Index' },
  { key: 'longShort',            mapKey: 'direction',            label: 'Direction' },
  { key: 'day',                  mapKey: 'day',                  label: 'Day of Week' },
  { key: 'reversalContinuation', mapKey: 'reversalContinuation', label: 'Reversal/Cont.' },
  { key: 'rulesFeelings',        mapKey: 'rulesFeelings',        label: 'Psychology' },
  { key: 'news',                 mapKey: 'news',                 label: 'News' },
  { key: 'rateTrade',            mapKey: 'rateTrade',            label: 'Trade Rating' },
];

const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#7C3AED',
  '#F43F5E', '#0EA5E9', '#F97316', '#EC4899', '#84CC16',
];

interface CellData {
  wins: number; losses: number; be: number;
  total: number; winRate: number | null;
}

interface TimedTrade {
  trade: Trade; hour: number; min: number; totalMin: number;
  timeStr: string; isWin: boolean; isLoss: boolean;
}

// ── Visual tier system ────────────────────────────────────────────────────────
// n < 3 = not enough data → muted grey; otherwise 3-tier performance color

interface TierStyle {
  color: string; bg: string; border: string;
  shadow: string; label: string; barFill: string;
}

function getTier(wr: number, n: number): TierStyle {
  if (n < 1) return {
    color: '#4A6282', bg: 'rgba(74,98,130,0.10)', border: 'rgba(74,98,130,0.25)',
    shadow: 'none', label: '—', barFill: '#263348',
  };
  if (wr >= 60) return {
    color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)',
    shadow: 'none', label: '↑', barFill: '#10B981',
  };
  if (wr >= 40) return {
    color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)',
    shadow: 'none', label: '→', barFill: '#F59E0B',
  };
  return {
    color: '#F43F5E', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.25)',
    shadow: 'none', label: '↓', barFill: '#F43F5E',
  };
}

function barColor(wr: number) {
  return wr >= 60 ? '#10B981' : wr >= 40 ? '#F59E0B' : '#F43F5E';
}

function uniqueValues(trades: Trade[], field: TradeArrayField): string[] {
  const s = new Set<string>();
  for (const t of trades) for (const v of t[field] as string[]) if (v) s.add(v);
  return Array.from(s).sort();
}

function parseTime(raw: string): { hour: number; min: number; totalMin: number } | null {
  const m = raw?.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = parseInt(m[1]), min = parseInt(m[2]);
  return { hour, min, totalMin: hour * 60 + min };
}


// ── Data Explorer (cross-reference) ──────────────────────────────────────────

function DataExplorer({ trades, fields }: { trades: Trade[]; fields: { key: TradeArrayField; label: string }[] }) {
  const [fieldA, setFieldA] = useState<TradeArrayField>('biasForTheDay');
  const [fieldB, setFieldB] = useState<TradeArrayField | 'none'>('news');
  const [selA, setSelA] = useState<string[]>([]);
  const [selB, setSelB] = useState<string[]>([]);
  const [view, setView] = useState<'matrix' | 'chart'>('matrix');

  const isNoneB = fieldB === 'none';

  const valuesA = useMemo(() => uniqueValues(trades, fieldA), [trades, fieldA]);
  const valuesB = useMemo(() => isNoneB ? [] : uniqueValues(trades, fieldB as TradeArrayField), [trades, fieldB, isNoneB]);

  // Reset selections when field changes
  useMemo(() => { setSelA([]); }, [fieldA]); // eslint-disable-line
  useMemo(() => { setSelB([]); }, [fieldB]); // eslint-disable-line

  const activeA = selA.length > 0 ? selA : valuesA;
  const activeB = selB.length > 0 ? selB : valuesB;

  // Single-field stats (when fieldB === 'none')
  const singleStats = useMemo(() => {
    if (!isNoneB) return [];
    return activeA.map((a) => {
      const tds = trades.filter((t) => (t[fieldA] as string[]).includes(a));
      const w = tds.filter((t) => t.winLose.includes('win')).length;
      const l = tds.filter((t) => t.winLose.includes('lose')).length;
      const be = tds.filter((t) => t.winLose.includes('BRAKEVEN')).length;
      const d = w + l;
      return { label: a, wins: w, losses: l, be, total: tds.length, winRate: d > 0 ? Math.round(w / d * 100) : null };
    }).filter((s) => s.total > 0).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  }, [trades, fieldA, activeA, isNoneB]);

  const matrix = useMemo(() => {
    if (isNoneB) return { rows: [], cols: [], cells: {} };
    const cells: Record<string, Record<string, CellData>> = {};
    for (const a of activeA) {
      cells[a] = {};
      for (const b of activeB) {
        const tds = trades.filter(
          (t) => (t[fieldA] as string[]).includes(a) && (t[fieldB as TradeArrayField] as string[]).includes(b),
        );
        const w = tds.filter((t) => t.winLose.includes('win')).length;
        const l = tds.filter((t) => t.winLose.includes('lose')).length;
        const be = tds.filter((t) => t.winLose.includes('BRAKEVEN')).length;
        const d = w + l;
        cells[a][b] = { wins: w, losses: l, be, total: tds.length, winRate: d > 0 ? Math.round(w / d * 100) : null };
      }
    }
    return { rows: activeA, cols: activeB, cells };
  }, [trades, fieldA, fieldB, activeA, activeB, isNoneB]);

  const chartData = useMemo(
    () => isNoneB
      ? singleStats.map((s) => ({ label: s.label, winRate: s.winRate ?? 0 }))
      : matrix.rows.map((row) => ({
          label: row,
          ...Object.fromEntries(matrix.cols.map((col) => [col, matrix.cells[row][col]?.winRate ?? 0])),
        })),
    [matrix, singleStats, isNoneB],
  );

  const toggleA = (v: string) => setSelA((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);
  const toggleB = (v: string) => setSelB((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);
  const labelOf = (k: TradeArrayField | 'none') => k === 'none' ? 'ללא' : fields.find((f) => f.key === k)?.label ?? k;

  const hasData = isNoneB
    ? singleStats.length > 0
    : matrix.rows.some((r) => matrix.cols.some((c) => matrix.cells[r][c]?.total > 0));

  return (
    <div className="rounded-xl p-5 space-y-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>

      {/* Title + view toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Data Explorer</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            בחר שדות ותת-קטגוריות להצלבה ← ← תרשים ניתוח
          </div>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          {(['matrix', 'chart'] as const).map((m) => (
            <button key={m}
              onClick={() => setView(m)}
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-all"
              style={{
                background: view === m ? 'var(--blue)' : 'transparent',
                color: view === m ? 'white' : 'var(--text-secondary)',
              }}>
              {m === 'matrix' ? 'Matrix' : 'Chart'}
            </button>
          ))}
        </div>
      </div>

      {/* Field selectors */}
      <div className="grid grid-cols-2 gap-4">
        {/* Field A */}
        <div className="rounded-lg p-3 space-y-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3b82f6' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>שורות (Field A)</span>
            </div>
            {selA.length > 0 && (
              <button className="text-xs" style={{ color: 'var(--text-secondary)' }} onClick={() => setSelA([])}>
                נקה
              </button>
            )}
          </div>
          <select
            value={fieldA}
            onChange={(e) => { setFieldA(e.target.value as TradeArrayField); setSelA([]); }}
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          >
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {valuesA.map((v) => {
              const on = selA.length === 0 || selA.includes(v);
              return (
                <button key={v} onClick={() => toggleA(v)}
                  className="text-xs px-2 py-0.5 rounded-md transition-all"
                  style={{
                    background: on ? 'rgba(59,130,246,0.2)' : 'var(--bg-card)',
                    border: `1px solid ${on ? '#3b82f6' : 'var(--border-color)'}`,
                    color: on ? '#93c5fd' : 'var(--text-muted)',
                    opacity: selA.length > 0 && !selA.includes(v) ? 0.45 : 1,
                  }}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        {/* Field B */}
        <div className="rounded-lg p-3 space-y-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#8b5cf6' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>עמודות (Field B)</span>
            </div>
            {selB.length > 0 && (
              <button className="text-xs" style={{ color: 'var(--text-secondary)' }} onClick={() => setSelB([])}>
                נקה
              </button>
            )}
          </div>
          <select
            value={fieldB}
            onChange={(e) => { setFieldB(e.target.value as TradeArrayField | 'none'); setSelB([]); }}
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          >
            <option value="none">— ללא (ניתוח יחיד) —</option>
            {fields.filter((f) => f.key !== fieldA).map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          {!isNoneB && (
            <div className="flex flex-wrap gap-1.5">
              {valuesB.map((v) => {
                const on = selB.length === 0 || selB.includes(v);
                return (
                  <button key={v} onClick={() => toggleB(v)}
                    className="text-xs px-2 py-0.5 rounded-md transition-all"
                    style={{
                      background: on ? 'rgba(139,92,246,0.2)' : 'var(--bg-card)',
                      border: `1px solid ${on ? '#8b5cf6' : 'var(--border-color)'}`,
                      color: on ? '#c4b5fd' : 'var(--text-muted)',
                      opacity: selB.length > 0 && !selB.includes(v) ? 0.45 : 1,
                    }}>
                    {v}
                  </button>
                );
              })}
            </div>
          )}
          {isNoneB && (
            <div className="text-xs py-1" style={{ color: 'var(--text-muted)' }}>
              מציג ניתוח יחיד — win rate לכל ערך של Field A
            </div>
          )}
        </div>
      </div>

      {/* Current cross label */}
      <div className="text-xs font-medium text-center py-1"
        style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        מציג: <span style={{ color: '#93c5fd' }}>{labelOf(fieldA)}</span>
        {selA.length > 0 && <span style={{ color: 'var(--text-muted)' }}> [{selA.join(', ')}]</span>}
        {!isNoneB && (
          <>
            <span className="mx-2" style={{ color: 'var(--text-muted)' }}>×</span>
            <span style={{ color: '#c4b5fd' }}>{labelOf(fieldB)}</span>
            {selB.length > 0 && <span style={{ color: 'var(--text-muted)' }}> [{selB.join(', ')}]</span>}
          </>
        )}
      </div>

      {/* ── Matrix view ── */}
      {view === 'matrix' && isNoneB && (
        !hasData ? (
          <div className="flex items-center justify-center h-28 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            אין נתונים
          </div>
        ) : (
          <div className="space-y-2">
            {singleStats.map((s) => {
              const tier = getTier(s.winRate ?? 0, s.winRate === null ? 0 : s.total);
              return (
                <div key={s.label} className="flex items-center gap-4 rounded-lg px-4 py-3"
                  style={{ background: tier.bg, border: `1px solid ${tier.border}`, boxShadow: tier.shadow }}>
                  <div className="font-semibold text-sm flex-1" style={{ color: tier.color }}>{s.label}</div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm" style={{ color: 'var(--green)' }}>{s.wins}W</span>
                    <span style={{ color: 'var(--border-hover)' }}>/</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--red)' }}>{s.losses}L</span>
                    {s.be > 0 && <>
                      <span style={{ color: 'var(--border-hover)' }}>/</span>
                      <span className="font-bold text-sm" style={{ color: 'var(--yellow)' }}>{s.be}BE</span>
                    </>}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                      {s.total} סה״כ
                    </span>
                  </div>
                  <div className="font-bold text-base w-14 text-right" style={{ color: tier.color }}>
                    {s.winRate !== null ? `${s.winRate}%` : '—'}
                    <span style={{ fontSize: 11, marginLeft: 3 }}>{tier.label}</span>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {[['rgba(16,185,129,0.08)', 'rgba(16,185,129,0.25)', '≥60%'],
                ['rgba(245,158,11,0.08)', 'rgba(245,158,11,0.25)', '40–60%'],
                ['rgba(244,63,94,0.08)', 'rgba(244,63,94,0.25)', '<40%']].map(([bg, border, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-5 h-4 rounded" style={{ background: bg, border: `1px solid ${border}` }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {view === 'matrix' && !isNoneB && (
        !hasData ? (
          <div className="flex items-center justify-center h-28 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            אין נתונים להצלבה הזו
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
              <thead>
                <tr>
                  {/* Corner cell */}
                  <th className="pb-1 pr-2 font-medium text-left"
                    style={{ color: 'var(--text-muted)', minWidth: 90 }}>
                    {labelOf(fieldA)} ↓ / {labelOf(fieldB)} →
                  </th>
                  {matrix.cols.map((col) => (
                    <th key={col} className="pb-1 px-1 font-semibold text-center"
                      style={{ color: '#c4b5fd', minWidth: 74 }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row}>
                    <td className="py-1 pr-3 font-semibold" style={{ color: '#93c5fd' }}>{row}</td>
                    {matrix.cols.map((col) => {
                      const c = matrix.cells[row][col];
                      if (!c || c.total === 0) {
                        return (
                          <td key={col} className="text-center rounded-lg px-2 py-2"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            —
                          </td>
                        );
                      }
                      const tier = getTier(c.winRate ?? 0, c.winRate === null ? 0 : c.total);
                      return (
                        <td key={col} className="text-center rounded-lg px-2 py-2"
                          style={{ background: tier.bg, border: `1px solid ${tier.border}`, boxShadow: tier.shadow }}
                          title={`${row} × ${col}: ${c.wins}W / ${c.losses}L / ${c.be}BE`}>
                          <div className="font-bold leading-none"
                            style={{ fontSize: 17, color: tier.color }}>
                            {c.winRate !== null ? `${c.winRate}%` : '—'}
                            <span style={{ fontSize: 11, marginLeft: 2 }}>{tier.label}</span>
                          </div>
                          <div className="mt-1 leading-none" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {c.wins}W {c.losses}L
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                            n={c.total}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {[['rgba(34,197,94,0.15)', 'rgba(34,197,94,0.45)', '≥60% Win Rate'],
                ['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.45)', '40–60%'],
                ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.45)', '<40%']].map(([bg, border, label]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-5 h-4 rounded"
                    style={{ background: bg, border: `1px solid ${border}` }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Chart view ── */}
      {view === 'chart' && (
        !hasData ? (
          <div className="flex items-center justify-center h-28 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            אין נתונים
          </div>
        ) : isNoneB ? (
          // Single-field: clean CSS bars, no recharts noise
          <div className="space-y-2 pt-1">
            {singleStats.map((s) => {
              const pct = s.winRate ?? 0;
              const color = barColor(pct);
              const bgColor = pct >= 60 ? 'rgba(34,197,94,0.12)' : pct >= 40 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="text-xs font-medium flex-shrink-0 text-right"
                    style={{ color: 'var(--text-secondary)', width: 120 }}>
                    {s.label}
                  </div>
                  <div className="flex-1 relative h-8 rounded-lg overflow-hidden"
                    style={{ background: 'var(--bg-surface)' }}>
                    {/* 50% reference mark */}
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: '50%', background: 'rgba(255,255,255,0.08)' }} />
                    {/* bar */}
                    <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-300"
                      style={{ width: `${Math.max(pct, 2)}%`, background: bgColor, borderRight: `2px solid ${color}` }}>
                    </div>
                    {/* inline stats */}
                    <div className="absolute inset-0 flex items-center px-3 gap-2 pointer-events-none">
                      <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>{s.wins}W</span>
                      <span style={{ color: 'var(--border-hover)', fontSize: 10 }}>/</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>{s.losses}L</span>
                      {s.be > 0 && <>
                        <span style={{ color: 'var(--border-hover)', fontSize: 10 }}>/</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--yellow)' }}>{s.be}BE</span>
                      </>}
                      <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>({s.total})</span>
                    </div>
                  </div>
                  <div className="text-sm font-bold flex-shrink-0 w-10 text-left"
                    style={{ color }}>
                    {pct > 0 ? `${pct}%` : '—'}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-1 pt-1" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              <div className="w-px h-3 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
              50% reference
            </div>
          </div>
        ) : matrix.cols.length > 7 ? (
          // Too many series to render cleanly
          <div className="flex flex-col items-center justify-center h-24 gap-1 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            יותר מ-7 ערכים ב-Field B — קשה להציג גרף
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>סנן ערכים או עבור לתצוגת מטריצה</span>
          </div>
        ) : (
          // Cross-field: grouped vertical bar chart
          <>
            {/* Custom legend above chart */}
            <div className="flex flex-wrap gap-3 pb-2">
              {matrix.cols.map((col, i) => (
                <div key={col} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{col}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 20, right: 12, left: 0, bottom: 52 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="5 3" />
                <XAxis dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  angle={-28} textAnchor="end" interval={0} />
                <YAxis domain={[0, 100]} tick={{ fill: '#4a5f76', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v}%`} width={30} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg p-3 text-xs space-y-1.5"
                        style={{ background: '#1C1C22', border: '1px solid var(--border-color)', minWidth: 150 }}>
                        <div className="font-semibold pb-1.5 mb-0.5"
                          style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                          {label}
                        </div>
                        {payload.filter((p) => Number(p.value) > 0).map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-sm" style={{ background: p.fill as string }} />
                              <span style={{ color: 'var(--text-secondary)' }}>{String(p.dataKey)}</span>
                            </div>
                            <span className="font-bold" style={{ color: p.fill as string }}>{Number(p.value)}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {matrix.cols.map((col, i) => (
                  <Bar key={col} dataKey={col} fill={PALETTE[i % PALETTE.length]}
                    radius={[3, 3, 0, 0]} maxBarSize={20} fillOpacity={0.8}
                    label={{
                      position: 'top',
                      formatter: (v: unknown) => Number(v) > 0 ? `${v}%` : '',
                      fill: '#475569', fontSize: 9,
                    }}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        )
      )}
    </div>
  );
}



// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [fieldMap, setFieldMap]   = useState<FieldMap | null>(null);

  const [newsOpen, setNewsOpen]             = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [timeTradesOpen, setTimeTradesOpen] = useState(false);

  useEffect(() => {
    fetch('/api/trades', { headers: notionHeaders(getNotionConfig()) })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setAllTrades(data.trades);
        if (data.fieldMap) setFieldMap(data.fieldMap);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fields = useMemo(() =>
    BASE_fields.map(f => ({
      key: f.key,
      label: fieldMap ? (fieldMap[f.mapKey] as string) : f.label,
    })),
  [fieldMap]);

  const actual = useMemo(() => getActualTrades(allTrades), [allTrades]);

  // Time analysis
  const timeAnalysis = useMemo(() => {
    const timedTrades: TimedTrade[] = [];
    for (const t of actual) {
      const p = parseTime(t.time);
      if (!p) continue;
      timedTrades.push({
        trade: t, ...p,
        timeStr: `${String(p.hour).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`,
        isWin:  t.winLose.includes('win'),
        isLoss: t.winLose.includes('lose'),
      });
    }
    const buckets: Record<string, { wins: number; losses: number; total: number; sortKey: number }> = {};
    for (const tt of timedTrades) {
      const bMin = Math.floor(tt.min / 30) * 30;
      const key  = `${String(tt.hour).padStart(2, '0')}:${String(bMin).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { wins: 0, losses: 0, total: 0, sortKey: tt.hour * 60 + bMin };
      if (tt.isWin)       buckets[key].wins++;
      else if (tt.isLoss) buckets[key].losses++;
      buckets[key].total++;
    }
    const bucketData = Object.entries(buckets)
      .map(([label, b]) => {
        const d = b.wins + b.losses;
        return { label, ...b, winRate: d > 0 ? Math.round(b.wins / d * 100) : 0 };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    const minToTime = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const avgMin = timedTrades.length > 0
      ? Math.round(timedTrades.reduce((s, t) => s + t.totalMin, 0) / timedTrades.length)
      : null;
    const avgTime = avgMin !== null ? minToTime(avgMin) : null;

    const avgOf = (arr: TimedTrade[]) =>
      arr.length > 0 ? minToTime(Math.round(arr.reduce((s, t) => s + t.totalMin, 0) / arr.length)) : null;

    const avgWinTime  = avgOf(timedTrades.filter((t) => t.isWin));
    const avgLossTime = avgOf(timedTrades.filter((t) => t.isLoss));
    const avgBeTime   = avgOf(timedTrades.filter((t) => !t.isWin && !t.isLoss));

    return { bucketData, timedTrades: [...timedTrades].sort((a, b) => a.totalMin - b.totalMin), avgTime, avgWinTime, avgLossTime, avgBeTime };
  }, [actual]);

  // News analysis
  const newsAnalysis = useMemo(() => {
    const allEvents = Array.from(new Set(actual.flatMap((t) => t.news.filter((n) => n.trim())))).sort();
    const stat = (arr: Trade[]) => {
      const w = arr.filter((t) => t.winLose.includes('win')).length;
      const l = arr.filter((t) => t.winLose.includes('lose')).length;
      const d = w + l;
      return { wins: w, losses: l, total: arr.length, winRate: d > 0 ? Math.round(w / d * 100) : 0 };
    };
    const eventStats = allEvents.map((name) => ({ name, ...stat(actual.filter((t) => t.news.includes(name))) }));
    return {
      withNews: stat(actual.filter((t) => t.news.some((n) => n.trim()))),
      noNews:   stat(actual.filter((t) => !t.news.some((n) => n.trim()))),
      eventStats, allEvents,
    };
  }, [actual]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin mx-auto"
            style={{ borderColor: 'var(--border-hover)', borderTopColor: 'var(--blue)' }}
          />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Computing statistics...</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div style={{ color: 'var(--red)' }}>שגיאה: {error}</div>
      </div>
    );
  }

  const toggleEvent = (name: string) =>
    setSelectedEvents((p) => p.includes(name) ? p.filter((e) => e !== name) : [...p, name]);
  const newsChartData = newsAnalysis.eventStats.filter((e) => selectedEvents.includes(e.name));

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between pb-1" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div>
          <h1
            className="font-bold"
            style={{ fontSize: 22, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
          >
            Analytics
          </h1>
          <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-secondary)', letterSpacing: '0.01em' }}>
            הצלבת נתונים — {actual.length} עסקאות
          </p>
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 11 }}>
          {([['var(--green)', '≥60%'], ['var(--yellow)', '40–60%'], ['var(--red)', '<40%']] as const).map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ DATA EXPLORER ═══ */}
      <DataExplorer trades={actual} fields={fields} />

      {/* ═══ NEWS IMPACT ═══ */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>News Impact</div>

        {/* Trigger button */}
        <div>
          <button
            onClick={() => setNewsOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: newsOpen ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              color: newsOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: `1px solid ${newsOpen ? 'var(--border-hover)' : 'var(--border-color)'}`,
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            {newsOpen ? 'Close' : 'Select News Events'}
            <span style={{ fontSize: 11, marginLeft: 2, opacity: 0.6 }}>{newsOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        {newsOpen && (
          <div className="space-y-2">
            {newsAnalysis.allEvents.length === 0 ? (
              <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>אין אירועי חדשות</div>
            ) : (
              <>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                  {newsAnalysis.allEvents.map((name, i) => {
                    const on = selectedEvents.includes(name);
                    const ev = newsAnalysis.eventStats.find((e) => e.name === name);
                    const tier = ev && ev.total >= 3 ? getTier(ev.winRate, ev.total) : null;
                    return (
                      <button key={name} onClick={() => toggleEvent(name)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                        style={{
                          background: on ? 'rgba(245,158,11,0.1)' : i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                          borderBottom: i < newsAnalysis.allEvents.length - 1 ? '1px solid var(--border-color)' : 'none',
                        }}>
                        <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                          style={{
                            background: on ? 'var(--yellow)' : 'transparent',
                            border: `1.5px solid ${on ? 'var(--yellow)' : 'var(--border-hover)'}`,
                          }}>
                          {on && <span style={{ fontSize: 10, color: '#000', fontWeight: 700 }}>✓</span>}
                        </div>
                        <span className="flex-1 text-sm font-medium" style={{ color: on ? 'var(--yellow)' : 'var(--text-primary)' }}>
                          {name}
                        </span>
                        {ev && (
                          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              background: tier ? tier.bg : 'var(--bg-surface)',
                              color: tier ? tier.color : 'var(--text-muted)',
                              border: `1px solid ${tier ? tier.border : 'var(--border-color)'}`,
                            }}>
                            {ev.total > 0 ? `${ev.winRate}% · ${ev.total}` : ev.total}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedEvents.length > 0 && (
                  <div className="flex justify-end">
                    <button className="text-xs px-3 py-1 rounded-lg transition-all"
                      style={{ color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}
                      onClick={() => setSelectedEvents([])}>
                      נקה בחירה ({selectedEvents.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {newsChartData.length > 0 && (
          <ResponsiveContainer width="100%" height={Math.max(160, newsChartData.length * 44)}>
            <BarChart data={newsChartData} layout="vertical" margin={{ top: 4, right: 56, left: 140, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={135} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof newsChartData[number];
                  return (
                    <div className="rounded-lg p-3 text-xs space-y-1"
                      style={{ background: '#1C1C22', border: '1px solid var(--border-color)' }}>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>{d.wins}W / {d.losses}L ({d.total})</div>
                      <div style={{ color: barColor(d.winRate) }}>Win Rate: {d.winRate}%</div>
                    </div>
                  );
                }}
                cursor={{ fill: 'rgba(255,255,255,0.02)' }}
              />
              <Bar dataKey="winRate" radius={[0, 4, 4, 0]} maxBarSize={26}
                label={{ position: 'right', formatter: (v: unknown) => `${v}%`, fill: '#94a3b8', fontSize: 11 }}>
                {newsChartData.map((e, i) => (
                  <Cell key={i} fill={getTier(e.winRate, e.total).barFill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ═══ TIME OF DAY ═══ */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Time of Day Analysis</div>

        {timeAnalysis.bucketData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            אין נתוני שעה — ודא שעמודת Time ממולאת ב-Notion
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-4 text-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Overall Avg Entry</div>
                <div className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {timeAnalysis.avgTime ?? '—'}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {timeAnalysis.timedTrades.length} עסקאות
                </div>
              </div>
              <div className="rounded-lg p-4 text-center"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.22)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--green)' }}>Avg Entry — Win</div>
                <div className="text-2xl font-bold font-mono" style={{ color: 'var(--green)' }}>
                  {timeAnalysis.avgWinTime ?? '—'}
                </div>
              </div>
              <div className="rounded-lg p-4 text-center"
                style={{ background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.22)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--red)' }}>Avg Entry — Loss</div>
                <div className="text-2xl font-bold font-mono" style={{ color: 'var(--red)' }}>
                  {timeAnalysis.avgLossTime ?? '—'}
                </div>
              </div>
              <div className="rounded-lg p-4 text-center"
                style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.22)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--yellow)' }}>Avg Entry — BE</div>
                <div className="text-2xl font-bold font-mono" style={{ color: 'var(--yellow)' }}>
                  {timeAnalysis.avgBeTime ?? '—'}
                </div>
              </div>
            </div>

            <div>
              <button
                onClick={() => setTimeTradesOpen(v => !v)}
                className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <span>{timeTradesOpen ? '▾' : '▸'}</span>
                <span>All trades by entry time</span>
                <span style={{ color: 'var(--text-muted)' }}>({timeAnalysis.timedTrades.length})</span>
              </button>
              {timeTradesOpen && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                        {['שעה', 'תאריך', 'תוצאה', 'PNL'].map((h) => (
                          <th key={h} className="text-left pb-2 pr-4 font-medium uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeAnalysis.timedTrades.map((tt, i) => {
                        const color = tt.isWin ? 'var(--green)' : tt.isLoss ? 'var(--red)' : 'var(--text-secondary)';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td className="py-2 pr-4 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{tt.timeStr}</td>
                            <td className="py-2 pr-4" style={{ color: 'var(--text-secondary)' }}>{tt.trade.date ?? '—'}</td>
                            <td className="py-2 pr-4 font-semibold" style={{ color }}>{tt.isWin ? 'Win' : tt.isLoss ? 'Loss' : 'BE'}</td>
                            <td className="py-2 font-semibold tabular" style={{ color }}>
                              {tt.trade.pnl !== null ? `${tt.trade.pnl >= 0 ? '+' : ''}$${tt.trade.pnl.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
