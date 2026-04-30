'use client';

import { useState, useMemo } from 'react';
import type { Trade } from '@/lib/types';
import { getCorrelationMatrix } from '@/lib/utils';

const FIELDS: { key: keyof Trade; label: string }[] = [
  { key: 'poi', label: 'POI' },
  { key: 'biasForTheDay', label: 'Bias' },
  { key: 'drawInLiquidity', label: 'Draw on Liquidity' },
  { key: 'lowerTimeEntry', label: 'Entry Type' },
  { key: 'indices', label: 'Index' },
  { key: 'longShort', label: 'Long / Short' },
  { key: 'day', label: 'Day of Week' },
  { key: 'reversalContinuation', label: 'Reversal / Continuation' },
  { key: 'rulesFeelings', label: 'Feelings' },
  { key: 'news', label: 'News' },
  { key: 'rateTrade', label: 'Trade Rating' },
  { key: 'trend', label: 'Trend' },
];

function cellColor(winRate: number | null): string {
  if (winRate === null) return 'transparent';
  if (winRate >= 65) return 'rgba(52, 211, 153, 0.25)';
  if (winRate >= 50) return 'rgba(52, 211, 153, 0.1)';
  if (winRate >= 35) return 'rgba(251, 191, 36, 0.15)';
  return 'rgba(248, 113, 113, 0.2)';
}

function cellTextColor(winRate: number | null): string {
  if (winRate === null) return 'var(--border-color)';
  if (winRate >= 65) return 'var(--green)';
  if (winRate >= 50) return '#a7f3d0';
  if (winRate >= 35) return 'var(--yellow)';
  return 'var(--red)';
}

export default function CorrelationMatrix({ trades }: { trades: Trade[] }) {
  const [fieldA, setFieldA] = useState<keyof Trade>('poi');
  const [fieldB, setFieldB] = useState<keyof Trade>('biasForTheDay');
  const [minSamples, setMinSamples] = useState(2);

  const matrix = useMemo(
    () => getCorrelationMatrix(trades, fieldA, fieldB, minSamples),
    [trades, fieldA, fieldB, minSamples],
  );

  const labelA = FIELDS.find((f) => f.key === fieldA)?.label ?? fieldA;
  const labelB = FIELDS.find((f) => f.key === fieldB)?.label ?? fieldB;

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Correlation Explorer
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            הצלב שני שדות וראה את ה-Win Rate בכל צירוף
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>שדה א׳ (שורות)</label>
            <select
              value={fieldA as string}
              onChange={(e) => setFieldA(e.target.value as keyof Trade)}
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {FIELDS.filter((f) => f.key !== fieldB).map((f) => (
                <option key={f.key as string} value={f.key as string}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="text-lg" style={{ color: 'var(--text-secondary)', marginTop: 18 }}>×</div>

          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>שדה ב׳ (עמודות)</label>
            <select
              value={fieldB as string}
              onChange={(e) => setFieldB(e.target.value as keyof Trade)}
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {FIELDS.filter((f) => f.key !== fieldA).map((f) => (
                <option key={f.key as string} value={f.key as string}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>מינ׳ דגימות</label>
            <select
              value={minSamples}
              onChange={(e) => setMinSamples(Number(e.target.value))}
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {[
          { color: 'rgba(52,211,153,0.25)', text: '≥65%' },
          { color: 'rgba(52,211,153,0.1)', text: '50–65%' },
          { color: 'rgba(251,191,36,0.15)', text: '35–50%' },
          { color: 'rgba(248,113,113,0.2)', text: '<35%' },
        ].map(({ color, text }) => (
          <div key={text} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color, border: '1px solid var(--border-color)' }} />
            {text}
          </div>
        ))}
        <span style={{ color: 'var(--border-color)' }}>— = אין נתונים מספיקים</span>
      </div>

      {/* Matrix */}
      {matrix.rowLabels.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
          אין מספיק נתונים לצירוף הזה — נסה להוריד את מינימום הדגימות
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
            <thead>
              <tr>
                <th
                  className="text-left p-2 font-semibold sticky left-0 z-10"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', minWidth: 120 }}
                >
                  {labelA} \ {labelB}
                </th>
                {matrix.colLabels.map((col) => (
                  <th
                    key={col}
                    className="p-2 font-medium text-center"
                    style={{ color: 'var(--text-secondary)', minWidth: 70, maxWidth: 100 }}
                  >
                    <div style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col}>
                      {col}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rowLabels.map((row) => (
                <tr key={row}>
                  <td
                    className="p-2 font-medium sticky left-0 z-10"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      borderTop: '1px solid var(--border-color)',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={row}
                  >
                    {row}
                  </td>
                  {matrix.colLabels.map((col) => {
                    const cell = matrix.cells[row]?.[col];
                    const wr = cell?.winRate ?? null;
                    return (
                      <td
                        key={col}
                        className="p-2 text-center font-semibold"
                        style={{
                          background: cellColor(wr),
                          color: cellTextColor(wr),
                          borderTop: '1px solid var(--border-color)',
                          borderLeft: '1px solid var(--border-color)',
                        }}
                        title={
                          cell && cell.total > 0
                            ? `${row} × ${col}: ${cell.wins}W / ${cell.losses}L (${cell.total} סה"כ)`
                            : 'אין נתונים'
                        }
                      >
                        {wr !== null ? `${wr}%` : (cell?.total ?? 0) > 0 ? `(${cell!.total})` : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        Hover על תא לפרטים מלאים · {matrix.rowLabels.length} שורות × {matrix.colLabels.length} עמודות
      </div>
    </div>
  );
}
