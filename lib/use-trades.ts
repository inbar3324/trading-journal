import { useEffect, useState } from 'react';
import type { Trade, FieldMap } from './types';
import { getNotionConfig, saveNotionConfig, notionHeaders, type NotionConfig } from './notion-config';

export interface TradesSnapshot {
  trades: Trade[];
  fieldMap: FieldMap;
  dbTitle: string;
  realDbId: string;
}

interface Entry {
  scope: string;
  savedAt: number;
  data: TradesSnapshot;
}

const STORAGE_KEY = 'tj_trades_snapshot_v1';
const MAX_AGE = 15 * 60_000;
let memory: Entry | null = null;
let revision = 0;
let flight: { scope: string; revision: number; promise: Promise<TradesSnapshot> } | null = null;

async function scopeFor(config: NotionConfig): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([config.key, config.dbId]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validSnapshot(data: TradesSnapshot): boolean {
  return Array.isArray(data?.trades) && data.trades.every(trade => typeof trade.id === 'string')
    && typeof data.realDbId === 'string' && typeof data.fieldMap?.notes === 'string';
}

export async function readTradesSnapshot(config: NotionConfig): Promise<TradesSnapshot | null> {
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

export async function writeTradesSnapshot(config: NotionConfig, data: TradesSnapshot): Promise<void> {
  const currentRevision = revision;
  const scope = await scopeFor(config);
  if (currentRevision !== revision || !validSnapshot(data)) return;
  memory = { scope, savedAt: Date.now(), data };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch {}
}

export function invalidateTradesSnapshot(): void {
  revision++;
  memory = null;
  flight = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export async function fetchTradesSnapshot(config: NotionConfig): Promise<TradesSnapshot> {
  const currentRevision = revision;
  const scope = await scopeFor(config);
  if (flight?.scope === scope && flight.revision === currentRevision) return flight.promise;
  const promise = (async () => {
    const response = await fetch('/api/trades', { headers: notionHeaders(config), signal: AbortSignal.timeout(12000) });
    const data = await response.json() as TradesSnapshot & { error?: string };
    if (!response.ok || data.error || !validSnapshot(data)) throw new Error(data.error ?? 'Failed to load Trades');
    if (currentRevision !== revision) throw new DOMException('Trades changed during refresh', 'AbortError');
    await writeTradesSnapshot(config, data);
    return data;
  })();
  flight = { scope, revision: currentRevision, promise };
  try { return await promise; }
  finally { if (flight?.promise === promise) flight = null; }
}

export function useTrades() {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let hasSnapshot = false;
    const config = getNotionConfig();
    if (!config) {
      setError('Missing Notion configuration');
      setLoading(false);
      return;
    }
    const apply = (data: TradesSnapshot) => {
      if (!active) return;
      hasSnapshot = true;
      setAllTrades(data.trades);
      setLoading(false);
      const current = getNotionConfig();
      if (current?.key === config.key && current.dbId === config.dbId) {
        saveNotionConfig({ ...current, fieldMap: data.fieldMap, realDbId: data.realDbId });
      }
    };
    (async () => {
      try {
        const cached = await readTradesSnapshot(config);
        if (!active) return;
        if (cached) apply(cached);
        const fresh = await fetchTradesSnapshot(config);
        apply(fresh);
      } catch (e) {
        if (!active) return;
        const message = e instanceof Error ? e.message : 'Failed to load trades';
        if (hasSnapshot) setSyncError(message); else setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { allTrades, loading, error, syncError };
}
