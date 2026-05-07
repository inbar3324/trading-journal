// Notion → CSS color mapping (mirrors Notion UI palette).

export const NC_BG: Record<string, string> = {
  red: 'rgba(255,80,80,0.2)', green: 'rgba(50,200,90,0.18)',
  blue: 'rgba(59,130,246,0.2)', yellow: 'rgba(234,179,8,0.2)',
  orange: 'rgba(249,115,22,0.2)', purple: 'rgba(168,85,247,0.2)',
  pink: 'rgba(236,72,153,0.2)', gray: 'rgba(150,150,160,0.16)',
  brown: 'rgba(180,120,60,0.22)', default: 'rgba(150,150,160,0.12)',
};

export const NC_TXT: Record<string, string> = {
  red: '#f87171', green: '#4ade80', blue: '#60a5fa', yellow: '#fbbf24',
  orange: '#fb923c', purple: '#c084fc', pink: '#f472b6',
  gray: '#9ca3af', brown: '#d97706', default: '#9ca3af',
};

export function tagBg(color?: string) { return NC_BG[color ?? 'default'] ?? NC_BG.default; }
export function tagFg(color?: string) { return NC_TXT[color ?? 'default'] ?? NC_TXT.default; }
