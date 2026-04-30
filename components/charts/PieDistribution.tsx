'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  wins: number;
  losses: number;
  breakevens: number;
}

export default function PieDistribution({ wins, losses, breakevens }: Props) {
  const data = [
    { name: 'Wins',      value: wins,       color: '#10B981' },
    { name: 'Losses',    value: losses,     color: '#F43F5E' },
    { name: 'Breakeven', value: breakevens, color: '#8A9DB8' },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px]" style={{ color: 'var(--text-secondary)' }}>
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [value, name]}
          contentStyle={{
            background: '#1C1C22',
            border: '1px solid #2E2E3C',
            borderRadius: '8px',
            color: '#E2E8F0',
          }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
