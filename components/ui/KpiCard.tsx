interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'neutral';
  icon?: string; // kept for API compatibility but not rendered
}

const colorMap = {
  green:   { text: 'var(--green)',   accent: 'var(--green)' },
  red:     { text: 'var(--red)',     accent: 'var(--red)' },
  blue:    { text: 'var(--blue)',    accent: 'var(--blue)' },
  purple:  { text: 'var(--purple)',  accent: 'var(--purple)' },
  yellow:  { text: 'var(--yellow)',  accent: 'var(--yellow)' },
  neutral: { text: 'var(--text-primary)', accent: 'var(--border-hover)' },
};

export default function KpiCard({ title, value, subtitle, color = 'neutral' }: KpiCardProps) {
  const c = colorMap[color];
  return (
    <div
      className="rounded-xl px-5 pt-4 pb-5 flex flex-col gap-2"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderTop: `2px solid ${c.accent}`,
      }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
      >
        {title}
      </span>
      <div
        className="text-2xl font-bold tabular"
        style={{ color: c.text, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-xs tabular" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
