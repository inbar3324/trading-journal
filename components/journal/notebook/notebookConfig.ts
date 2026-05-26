export type NotebookTheme = 'dark' | 'light';

export interface NotebookConfig {
  setupComplete: boolean;
  columnOrder: string[];
  textScale: number;
  imageScale: number;
  theme: NotebookTheme;
}

export const TEXT_SCALES = [0.85, 1.0, 1.15, 1.3, 1.5] as const;
export const IMAGE_SCALES = [0.5, 0.7, 0.85, 1.0] as const;

export const DEFAULT_CONFIG: NotebookConfig = {
  setupComplete: false,
  columnOrder: [],
  textScale: 1.0,
  imageScale: 1.0,
  theme: 'dark',
};

export interface NotebookPalette {
  bg: string;
  sidebarBg: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderHover: string;
  accentBg: string;
  controlBg: string;
}

export function getPalette(theme: NotebookTheme): NotebookPalette {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      sidebarBg: '#f5f6f7',
      cardBg: '#f9fafb',
      textPrimary: '#1f2937',
      textSecondary: '#4b5563',
      textMuted: '#9ca3af',
      border: '#e5e7eb',
      borderHover: '#d1d5db',
      accentBg: 'rgba(59,130,246,0.08)',
      controlBg: '#ffffff',
    };
  }
  return {
    bg: 'rgba(255,255,255,0.04)',
    sidebarBg: 'rgba(255,255,255,0.03)',
    cardBg: 'var(--bg-card)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    border: 'var(--border-color)',
    borderHover: 'var(--border-hover)',
    accentBg: 'rgba(59,130,246,0.08)',
    controlBg: 'transparent',
  };
}

function key(dbId: string) {
  return `tj_notebook_${dbId}`;
}

export function getNotebookConfig(dbId: string): NotebookConfig | null {
  if (typeof window === 'undefined' || !dbId) return null;
  try {
    const raw = window.localStorage.getItem(key(dbId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotebookConfig>;
    return {
      setupComplete: !!parsed.setupComplete,
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : [],
      textScale: typeof parsed.textScale === 'number' ? parsed.textScale : 1.0,
      imageScale: typeof parsed.imageScale === 'number' ? parsed.imageScale : 1.0,
      theme: parsed.theme === 'light' ? 'light' : 'dark',
    };
  } catch {
    return null;
  }
}

export function saveNotebookConfig(dbId: string, cfg: NotebookConfig): void {
  if (typeof window === 'undefined' || !dbId) return;
  try {
    window.localStorage.setItem(key(dbId), JSON.stringify(cfg));
  } catch {}
}

export function resetNotebookConfig(dbId: string): void {
  if (typeof window === 'undefined' || !dbId) return;
  try {
    window.localStorage.removeItem(key(dbId));
  } catch {}
}

export function stepScale(current: number, scales: readonly number[], dir: 1 | -1): number {
  const idx = scales.findIndex(s => Math.abs(s - current) < 0.001);
  const safeIdx = idx < 0 ? scales.indexOf(1.0) : idx;
  const next = Math.max(0, Math.min(scales.length - 1, safeIdx + dir));
  return scales[next];
}
