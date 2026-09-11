import type { NotionDbSchema, NotionPage } from './notion-page';
import { notionHeaders, type NotionConfig } from './notion-config';

export interface JournalSnapshot {
  pages: NotionPage[];
  schema: NotionDbSchema;
  realDbId: string;
}

interface Entry {
  scope: string;
  savedAt: number;
  data: JournalSnapshot;
}

const STORAGE_KEY = 'tj_journal_snapshot_v1';
const MAX_AGE = 15 * 60_000;
let memory: Entry | null = null;
let revision = 0;
let flight: { scope: string; revision: number; promise: Promise<JournalSnapshot> } | null = null;

async function scopeFor(config: NotionConfig): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([config.key, config.dbId]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validSnapshot(data: JournalSnapshot): boolean {
  return Array.isArray(data?.pages) && data.pages.every(page => typeof page.id === 'string' && page.properties)
    && Array.isArray(data.schema?.properties) && data.schema.properties.length > 0
    && typeof data.realDbId === 'string';
}

export async function readJournalSnapshot(config: NotionConfig): Promise<JournalSnapshot | null> {
  const scope = await scopeFor(config);
  try {
    const entry: Entry | null = memory ?? JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!entry || entry.scope !== scope || Date.now() - entry.savedAt > MAX_AGE || !validSnapshot(entry.data)) return null;
    memory = entry;
    return entry.data;
  } catch {
    return null;
  }
}

export async function writeJournalSnapshot(config: NotionConfig, data: JournalSnapshot): Promise<void> {
  const currentRevision = revision;
  const scope = await scopeFor(config);
  if (currentRevision !== revision || !validSnapshot(data)) return;
  memory = { scope, savedAt: Date.now(), data };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
}

export function invalidateJournalSnapshot(): void {
  revision++;
  memory = null;
  flight = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export async function fetchJournalSnapshot(config: NotionConfig): Promise<JournalSnapshot> {
  const currentRevision = revision;
  const scope = await scopeFor(config);
  if (flight?.scope === scope && flight.revision === currentRevision) return flight.promise;
  const promise = (async () => {
    const response = await fetch('/api/notion/pages', { headers: notionHeaders(config) });
    const data = await response.json() as JournalSnapshot & { error?: string };
    if (!response.ok || data.error || !validSnapshot(data)) throw new Error(data.error ?? 'Failed to load Journal');
    if (currentRevision !== revision) throw new DOMException('Journal changed during refresh', 'AbortError');
    await writeJournalSnapshot(config, data);
    return data;
  })();
  flight = { scope, revision: currentRevision, promise };
  try { return await promise; }
  finally { if (flight?.promise === promise) flight = null; }
}
