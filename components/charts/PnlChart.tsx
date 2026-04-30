'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import type { PnlPoint } from '@/lib/types';

interface Props {
  data: PnlPoint[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PnlPoint }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPositive = d.pnl >= 0;
  return (
    <div
      className="rounded-lg p-3 text-sm"
      style={{ background: '#1C1C22', border: '1px solid var(--border-color)' }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>{d.date}</div>
      <div style={{ color: isPositive ? 'var(--green)' : 'var(--red)' }}>
        Trade: {isPositive ? '+' : ''}${d.pnl.toFixed(2)}
      </div>
      <div style={{ color: d.cumulative >= 0 ? 'var(--blue)' : 'var(--red)' }}>
        Cumulative: {d.cumulative >= 0 ? '+' : ''}${d.cumulative.toFixed(2)}
      </div>
    </div>
  );
}

export default function PnlChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px]" style={{ color: 'var(--text-secondary)' }}>
        No data to display
      </div>
    );
  }

  const isPositive = data[data.length - 1]?.cumulative >= 0;
  const lineColor = isPositive ? '#10B981' : '#F43F5E';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.20} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fill: '#8A9DB8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#8A9DB8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}`}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.10)" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke={lineColor}
          strokeWidth={2}
          fill="url(#pnlGradient)"
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
