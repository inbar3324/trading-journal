interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'neutral';
  icon?: string; // kept for API compatibility but not rendered
}

const colorMap = {
  green:   { text: 'var(--green)',        accent: 'var(--green)' },
  red:     { text: 'var(--red)',          accent: 'var(--red)' },
  blue:    { text: 'var(--blue)',         accent: 'var(--blue)' },
  purple:  { text: 'var(--purple)',       accent: 'var(--purple)' },
  yellow:  { text: 'var(--yellow)',       accent: 'var(--yellow)' },
  neutral: { text: 'var(--text-primary)', accent: 'var(--border-hover)' },
};

export default function KpiCard({ title, value, subtitle, color = 'neutral' }: KpiCardProps) {
  const c = colorMap[color];
  return (
    /* Outer bezel */
    <div
      style={{
        borderRadius: '1.25rem',
        padding: 5,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      {/* Inner card */}
      <div
        style={{
          borderRadius: 'calc(1.25rem - 5px)',
          padding: '16px 20px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          background: 'var(--bg-card)',
          borderTop: `2px solid ${c.accent}`,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.03)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
          }}
        >
          {title}
        </span>
        <div
          className="tabular"
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: c.text,
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {subtitle && (
          <div
            className="tabular"
            style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
