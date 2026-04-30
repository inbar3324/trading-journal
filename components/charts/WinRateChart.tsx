'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import type { GroupStat } from '@/lib/types';

interface Props {
  data: GroupStat[];
  title: string;
  maxItems?: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GroupStat }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg p-3 text-sm space-y-1"
      style={{ background: '#1a1a2e', border: '1px solid var(--border-color)' }}
    >
      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</div>
      <div style={{ color: 'var(--green)' }}>Win Rate: {d.winRate}%</div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {d.wins}W / {d.losses}L / {d.breakevens}BE ({d.total} total)
      </div>
      <div style={{ color: d.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
        PNL: {d.totalPnl >= 0 ? '+' : ''}${d.totalPnl.toFixed(2)}
      </div>
    </div>
  );
}

export default function WinRateChart({ data, title, maxItems = 10 }: Props) {
  const sliced = data.slice(0, maxItems);

  if (sliced.length === 0) {
    return (
      <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</div>
        <div className="flex items-center justify-center h-[200px] text-sm" style={{ color: 'var(--text-secondary)' }}>
          אין נתונים מספיקים
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sliced} margin={{ top: 5, right: 5, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e35" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#8892a4', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#8892a4', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {sliced.map((entry) => (
              <Cell
                key={entry.label}
                fill={entry.winRate >= 60 ? '#34d399' : entry.winRate >= 40 ? '#fbbf24' : '#f87171'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
