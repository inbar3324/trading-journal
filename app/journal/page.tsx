'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Trade, TradeInput, NotionSchema } from '@/lib/types';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';
import { Plus, RefreshCw } from 'lucide-react';
import EntryDrawer from '@/components/journal/EntryDrawer';

type Filter = 'all' | 'trade' | 'notrade' | 'win' | 'loss' | 'be';

const FILTER_OPTIONS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Took Trade' },
  { key: 'notrade', label: 'No Trade' },
  { key: 'win', label: 'Win' },
  { key: 'loss', label: 'Loss' },
  { key: 'be', label: 'BE' },
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function formatDate(dateStr: string): { day: string; month: string; num: string; year: string; dow: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d).padStart(2, '0'),
    month: MONTH_NAMES[m - 1],
    num: String(d),
    year: String(y),
    dow: DAY_NAMES[date.getDay()],
  };
}

function tradeResult(t: Trade): 'win' | 'loss' | 'be' | 'notrade' {
  if (!t.tookTrade.includes('TOOK TRADE')) return 'notrade';
  if (t.winLose.some((w) => w === 'win')) return 'win';
  if (t.winLose.some((w) => w === 'lose')) return 'loss';
  return 'be';
}

function resultColor(r: 'win' | 'loss' | 'be' | 'notrade'): string {
  if (r === 'win') return 'var(--green)';
  if (r === 'loss') return 'var(--red)';
  if (r === 'be') return 'var(--yellow)';
  return 'var(--blue)';
}

function resultLabel(r: 'win' | 'loss' | 'be' | 'notrade'): string {
  if (r === 'win') return 'WIN';
  if (r === 'loss') return 'LOSS';
  if (r === 'be') return 'BE';
  return 'NO TRADE';
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function EntryCard({
  trade,
  isSelected,
  onClick,
}: {
  trade: Trade;
  isSelected: boolean;
  onClick: () => void;
}) {
  const result = tradeResult(trade);
  const color = resultColor(result);
  const isTrade = result !== 'notrade';
  const fmt = trade.date ? formatDate(trade.date) : null;

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: '1.15rem',
        padding: 4,
        background: isSelected
          ? `color-mix(in srgb, ${color} 6%, rgba(255,255,255,0.025))`
          : 'rgba(255,255,255,0.018)',
        border: `1px solid ${isSelected ? `color-mix(in srgb, ${color} 30%, var(--border-color))` : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isSelected ? `0 0 0 1px color-mix(in srgb, ${color} 18%, transparent)` : 'none',
        cursor: 'pointer',
        transition: 'all 160ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.018)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      <div
        style={{
          borderRadius: 'calc(1.15rem - 4px)',
          padding: '14px 16px',
          background: 'var(--bg-card)',
          borderLeft: `3px solid ${color}`,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.025)',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}
      >
        {/* Date column */}
        <div
          style={{
            flexShrink: 0,
            width: 44,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 2,
          }}
        >
          {fmt ? (
            <>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.04em',
                }}
              >
                {fmt.num}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', marginTop: 1 }}>
                {fmt.month}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{fmt.dow}</span>
            </>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-color)', flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* Row 1: badges + PNL */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Badge label={resultLabel(result)} color={color} />
            {trade.rateTrade[0] && <Badge label={trade.rateTrade[0]} color="var(--purple)" />}
            {trade.indices.map((idx) => (
              <Badge key={idx} label={idx} color="var(--blue)" />
            ))}
            {trade.longShort.map((dir) => (
              <Badge key={dir} label={dir.toUpperCase()} color={dir === 'long' ? 'var(--green)' : 'var(--red)'} />
            ))}
            {isTrade && trade.pnl !== null && (
              <span
                className="tabular"
                style={{
                  marginLeft: 'auto',
                  fontSize: 15,
                  fontWeight: 700,
                  color: result === 'win' ? 'var(--green)' : result === 'loss' ? 'var(--red)' : 'var(--yellow)',
                  letterSpacing: '-0.03em',
                  flexShrink: 0,
                }}
              >
                {trade.pnl >= 0 ? '+' : ''}${trade.pnl}
              </span>
            )}
          </div>

          {/* Row 2: secondary info */}
          {isTrade && (trade.poi.length > 0 || trade.biasForTheDay.length > 0 || trade.trend.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {trade.poi.slice(0, 2).map((v) => (
                <span key={v} style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                  POI: {v}
                </span>
              ))}
              {trade.biasForTheDay.slice(0, 1).map((v) => (
                <span key={v} style={{ fontSize: 10, color: 'var(--text-muted)' }}>· Bias: {v}</span>
              ))}
            </div>
          )}

          {/* Row 3: notes preview */}
          {trade.notes?.trim() && (
            <p
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                margin: 0,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                letterSpacing: '0.01em',
              }}
            >
              {trade.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsBar({ entries }: { entries: Trade[] }) {
  const trades = entries.filter((t) => t.tookTrade.includes('TOOK TRADE'));
  const wins = trades.filter((t) => t.winLose.includes('win')).length;
  const losses = trades.filter((t) => t.winLose.includes('lose')).length;
  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;

  const items = [
    { label: 'Entries', value: String(entries.length) },
    { label: 'Trades', value: String(trades.length) },
    { label: 'Win Rate', value: trades.length > 0 ? `${wr.toFixed(1)}%` : '—', color: wr >= 50 ? 'var(--green)' : 'var(--red)' },
    { label: 'W / L', value: `${wins} / ${losses}` },
    {
      label: 'Net PNL',
      value: trades.length > 0 ? `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(0)}` : '—',
      color: totalPnl > 0 ? 'var(--green)' : totalPnl < 0 ? 'var(--red)' : undefined,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRight: i < items.length - 1 ? '1px solid var(--border-color)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
            {item.label}
          </span>
          <span
            className="tabular"
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: item.color ?? 'var(--text-primary)',
            }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function JournalPage() {
  const [allEntries, setAllEntries] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<NotionSchema>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [filePropNames, setFilePropNames] = useState<string[]>([]);
  const [realDbId, setRealDbId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headers = useMemo(() => notionHeaders(getNotionConfig()), []);

  const fetchEntries = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/trades', { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllEntries([...(data.trades as Trade[])].reverse());
      if (data.realDbId) setRealDbId(data.realDbId);
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headers]);

  const fetchSchema = useCallback(async () => {
    try {
      const res = await fetch('/api/notion/schema', { headers });
      const data = await res.json();
      if (data.schema) setSchema(data.schema);
    } catch {}
  }, [headers]);

  useEffect(() => {
    fetchEntries();
    fetchSchema();
    pollRef.current = setInterval(() => fetchEntries(true), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchEntries, fetchSchema]);

  const derivedSchema = useMemo((): NotionSchema => {
    const fieldMap: Array<[keyof Trade, string]> = [
      ['tookTrade', 'Took a trade today?'],
      ['indices', 'indices'],
      ['longShort', 'long/short'],
      ['news', 'NEWS'],
      ['reversalContinuation', 'reversal/continuation '],
      ['drawInLiquidity', 'draw in liquidity'],
      ['poi', 'POI'],
      ['lowerTimeEntry', 'LOWER TIME ENTRY'],
      ['rulesFeelings', 'RULES/feeling'],
      ['trend', 'TREND'],
      ['biasForTheDay', 'BIAS FOR THE DAY'],
      ['rateTrade', 'RATE TRADE'],
      ['winLose', 'win/lose'],
      ['day', 'day'],
    ];
    const result: NotionSchema = {};
    for (const [tradeKey, schemaKey] of fieldMap) {
      const seen = new Set<string>();
      for (const trade of allEntries) {
        const val = trade[tradeKey as keyof Trade];
        if (Array.isArray(val)) {
          for (const v of val) if (v) seen.add(v as string);
        }
      }
      if (seen.size > 0) result[schemaKey] = [...seen].map((name) => ({ name }));
    }
    return result;
  }, [allEntries]);

  const effectiveSchema = useMemo((): NotionSchema => {
    if (Object.keys(schema).length > 0) {
      // API schema loaded: it is authoritative (Notion-defined order + all options).
      // Add any entry-derived values that aren't already present (edge cases).
      const merged: NotionSchema = { ...schema };
      for (const [key, derivedOpts] of Object.entries(derivedSchema)) {
        if (!merged[key]) {
          merged[key] = derivedOpts;
        } else {
          const existing = new Set(merged[key].map((o) => o.name));
          const extras = derivedOpts.filter((o) => !existing.has(o.name));
          if (extras.length > 0) merged[key] = [...merged[key], ...extras];
        }
      }
      return merged;
    }
    // API schema unavailable: fall back to values actually seen in entries.
    return derivedSchema;
  }, [schema, derivedSchema]);

  const filtered = useMemo(() => {
    return allEntries.filter((t) => {
      const r = tradeResult(t);
      if (filter === 'all') return true;
      if (filter === 'trade') return r !== 'notrade';
      if (filter === 'notrade') return r === 'notrade';
      return r === filter;
    });
  }, [allEntries, filter]);

  const selectedTrade = allEntries.find((t) => t.id === selectedId) ?? null;

  function openCreate() {
    setSelectedId(null);
    setDrawerMode('create');
  }

  function openEdit(id: string) {
    setSelectedId(id);
    setDrawerMode('edit');
    setFilePropNames([]);
    fetch(`/api/trades/${id}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.trade) {
          setAllEntries((prev) =>
            prev.map((t) => (t.id === id ? { ...t, images: data.trade.images } : t)),
          );
        }
        if (data.filePropNames) setFilePropNames(data.filePropNames);
      })
      .catch(() => {});
  }

  function closeDrawer() {
    setDrawerMode(null);
  }

  async function handleSave(input: TradeInput) {
    setSaving(true);
    try {
      if (drawerMode === 'create') {
        const res = await fetch('/api/trades/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(realDbId ? { ...input, realDbId } : input),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setAllEntries((prev) => [data.trade, ...prev]);
      } else if (drawerMode === 'edit' && selectedId) {
        const res = await fetch(`/api/trades/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(input),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setAllEntries((prev) => prev.map((t) => (t.id === selectedId ? data.trade : t)));
      }
      closeDrawer();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(tradeId: string, prop: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prop', prop);
    const res = await fetch(`/api/trades/${tradeId}/image`, {
      method: 'POST',
      headers,
      body: fd,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.trade) {
      setAllEntries((prev) =>
        prev.map((t) => (t.id === tradeId ? { ...t, images: data.trade.images } : t)),
      );
    }
    if (data.filePropNames) setFilePropNames(data.filePropNames);
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllEntries((prev) => prev.filter((t) => t.id !== id));
      closeDrawer();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
          <div className="skeleton" style={{ height: 26, width: 120, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 10 }} />
        </div>
        <div className="skeleton" style={{ height: 56, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 40, width: 380, borderRadius: 10 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 90, borderRadius: 18 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚠</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{error}</div>
          <button
            onClick={() => fetchEntries()}
            style={{ padding: '8px 18px', borderRadius: 10, background: 'var(--blue)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Overlay when drawer is open */}
      {drawerMode && (
        <div
          onClick={closeDrawer}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
            transition: 'opacity 200ms',
          }}
        />
      )}

      {/* Drawer */}
      <EntryDrawer
        mode={drawerMode}
        trade={drawerMode === 'edit' ? selectedTrade : null}
        schema={effectiveSchema}
        saving={saving}
        filePropNames={filePropNames}
        onSave={handleSave}
        onDelete={handleDelete}
        onImageUpload={handleImageUpload}
        onClose={closeDrawer}
      />

      {/* Main content */}
      <div className="p-6 space-y-5">
        {/* Header */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border-color)' }}
        >
          <div>
            <h1
              style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2 }}
            >
              Journal
            </h1>
            <p style={{ fontSize: 12, marginTop: 3, color: 'var(--text-secondary)' }}>
              {allEntries.length} entries · synced with Notion
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => fetchEntries(true)}
              disabled={refreshing}
              title="Sync from Notion"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: refreshing ? 'wait' : 'pointer',
                transition: 'all 150ms',
              }}
            >
              <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={openCreate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                background: 'var(--blue)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 14px rgba(59,130,246,0.25)',
                transition: 'all 160ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97) translateY(1px)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
            >
              <Plus size={14} strokeWidth={2.5} />
              New Entry
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <StatsBar entries={filtered} />

        {/* Filter tabs */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            width: 'fit-content',
          }}
        >
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '5px 13px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: filter === key ? 600 : 400,
                letterSpacing: filter === key ? '-0.01em' : '0',
                background: filter === key ? 'var(--blue)' : 'transparent',
                color: filter === key ? 'white' : 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                boxShadow: filter === key ? '0 1px 4px rgba(59,130,246,0.3)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Entry list */}
        {filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 24px',
              color: 'var(--text-muted)',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 32, opacity: 0.4 }}>◯</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {filter === 'all' ? 'No journal entries yet' : `No ${filter} entries`}
            </div>
            {filter === 'all' && (
              <button
                onClick={openCreate}
                style={{
                  marginTop: 8,
                  padding: '8px 20px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'var(--blue)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Add first entry
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((trade) => (
              <EntryCard
                key={trade.id}
                trade={trade}
                isSelected={selectedId === trade.id && drawerMode === 'edit'}
                onClick={() => openEdit(trade.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
