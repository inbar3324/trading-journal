export interface NotionConfig {
  key: string;
  dbId: string;
}

const STORAGE_KEY = 'tj_notion';

export function getNotionConfig(): NotionConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as NotionConfig;
    return cfg.key && cfg.dbId ? cfg : null;
  } catch {
    return null;
  }
}

export function saveNotionConfig(cfg: NotionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearNotionConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function notionHeaders(cfg: NotionConfig | null): Record<string, string> {
  if (!cfg) return {};
  return { 'x-notion-key': cfg.key, 'x-notion-db': cfg.dbId };
}
