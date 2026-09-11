'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Table as TableIcon, Calendar, LayoutGrid, BarChart3, BookOpen, ChevronDown, X, Trash2 } from 'lucide-react';
import type { NotionPage, NotionDbSchema, NotionPropDef, NotionPropValue } from '@/lib/notion-page';
import { getNotionConfig, saveNotionConfig, notionHeaders } from '@/lib/notion-config';
import { EditableCell } from '@/components/journal/v2/EditableCell';
import { colWidth } from '@/components/journal/v2/widths';
import dynamic from 'next/dynamic';
import { fetchJournalSnapshot, invalidateJournalSnapshot, readJournalSnapshot, writeJournalSnapshot } from '@/lib/journal-cache';

const NotebookView = dynamic(() => import('@/components/journal/notebook/NotebookView').then(m => m.NotebookView));

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Parse a fetch Response as JSON, but surface a clean error when the server
// returns an HTML error page (e.g. a 500) instead of JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server error ${res.status} ${res.statusText}`.trim());
  }
}

function emptyValue(type: NotionPropDef['type']): NotionPropValue {
  switch (type) {
    case 'title': return { type: 'title', text: '' };
    case 'rich_text': return { type: 'rich_text', text: '' };
    case 'number': return { type: 'number', value: null };
    case 'select': return { type: 'select', option: null };
    case 'multi_select': return { type: 'multi_select', options: [] };
    case 'status': return { type: 'status', option: null };
    case 'date': return { type: 'date', start: null, end: null, hasTime: false };
    case 'url': return { type: 'url', value: null };
    case 'email': return { type: 'email', value: null };
    case 'phone_number': return { type: 'phone_number', value: null };
    case 'checkbox': return { type: 'checkbox', value: false };
    case 'files': return { type: 'files', files: [] };
    case 'people': return { type: 'people', people: [] };
    case 'relation': return { type: 'relation', ids: [] };
    case 'formula': return { type: 'formula', display: '' };
    case 'rollup': return { type: 'rollup', display: '' };
    case 'created_time': return { type: 'created_time', value: '' };
    case 'last_edited_time': return { type: 'last_edited_time', value: '' };
    case 'created_by': return { type: 'created_by', user: null };
    case 'last_edited_by': return { type: 'last_edited_by', user: null };
    case 'unique_id': return { type: 'unique_id', prefix: null, number: null };
    default: return { type: 'unsupported', raw: '' };
  }
}

function emptyPage(schema: NotionDbSchema): Record<string, NotionPropValue> {
  const out: Record<string, NotionPropValue> = {};
  for (const p of schema.properties) out[p.name] = emptyValue(p.type);
  return out;
}

// â”€â”€ View tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VIEW_TABS = [
  { id: 'table',    label: 'Table',     icon: TableIcon },
  { id: 'notebook', label: 'Notebook',  icon: BookOpen },
  { id: 'calendar', label: 'Calendar',  icon: Calendar },
  { id: 'gallery',  label: 'Gallery',   icon: LayoutGrid },
  { id: 'stats',    label: 'statistic', icon: BarChart3 },
];

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function JournalPage() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [schema, setSchema] = useState<NotionDbSchema>({ title: '', realDbId: '', properties: [] });
  const [realDbId, setRealDbId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('table');
  const [draft, setDraft] = useState<Record<string, NotionPropValue> | null>(null);
  const [saving, setSaving] = useState(false);
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const readyRef = useRef(false);
  const pendingMutationsRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const fetchingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftRowRef = useRef<HTMLTableRowElement>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headers = useMemo(() => notionHeaders(getNotionConfig()), []);

  // â”€â”€ Fetch pages + schema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchAll = useCallback(async (silent = false) => {
    if (fetchingRef.current || pendingMutationsRef.current) return;
    const config = getNotionConfig();
    if (!config) return;
    const version = mutationVersionRef.current;
    fetchingRef.current = true;
    if (!silent && !readyRef.current) setLoading(true); else setRefreshing(true);
    try {
      const data = await fetchJournalSnapshot(config);
      if (version !== mutationVersionRef.current || pendingMutationsRef.current) return;
      // Drop rows we've archived locally but Notion's query may not reflect yet (eventual consistency).
      setPages((data.pages as NotionPage[]).filter(p => !deletedIdsRef.current.has(p.id)));
      setSchema(data.schema as NotionDbSchema);
      readyRef.current = true;
      if (data.realDbId) {
        setRealDbId(data.realDbId);
        const cfg = getNotionConfig();
        if (cfg && cfg.realDbId !== data.realDbId) saveNotionConfig({ ...cfg, realDbId: data.realDbId });
      }
      setError(null);
    } catch (e) {
      if (version === mutationVersionRef.current && !(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    } finally { fetchingRef.current = false; setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const config = getNotionConfig();
    (async () => {
      const cached = config ? await readJournalSnapshot(config) : null;
      if (!active) return;
      if (cached) {
        setPages(cached.pages);
        setSchema(cached.schema);
        setRealDbId(cached.realDbId);
        readyRef.current = true;
        setLoading(false);
      }
      fetchAll(Boolean(cached));
    })();
    pollRef.current = setInterval(() => { if (!document.hidden) fetchAll(true); }, 15_000);
    return () => { active = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  const beginMutation = useCallback(() => {
    pendingMutationsRef.current++;
    mutationVersionRef.current++;
    invalidateJournalSnapshot();
  }, []);

  const endMutation = useCallback(() => {
    pendingMutationsRef.current--;
    setCacheEpoch(epoch => epoch + 1);
  }, []);

  useEffect(() => {
    const config = getNotionConfig();
    if (cacheEpoch && config && readyRef.current && !pendingMutationsRef.current) {
      void writeJournalSnapshot(config, { pages, schema, realDbId: realDbId ?? schema.realDbId });
    }
  }, [cacheEpoch, pages, schema, realDbId]);

  // â”€â”€ Edit a cell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const commitEdit = useCallback(async (pageId: string, propName: string, next: NotionPropValue) => {
    beginMutation();
    const prev = pages;
    // Optimistic
    setPages(curr => curr.map(p => p.id === pageId
      ? { ...p, properties: { ...p.properties, [propName]: next } }
      : p
    ));
    try {
      const res = await fetch(`/api/notion/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ patch: { [propName]: next } }),
      });
      const data = await readJson(res);
      if (data.error) throw new Error(String(data.error));
      // Replace with server-truth (in case Notion normalized values).
      setPages(curr => curr.map(p => p.id === pageId ? (data.page as NotionPage) : p));
    } catch (e) {
      console.error('[edit] failed', e);
      setPages(prev); // rollback
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally { endMutation(); }
  }, [headers, pages, beginMutation, endMutation]);

  // â”€â”€ Inline new row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startInline = () => setDraft(emptyPage(schema));
  const cancelInline = () => setDraft(null);

  function setDraftProp(propName: string, value: NotionPropValue) {
    setDraft(d => d ? { ...d, [propName]: value } : d);
  }

  const commitInline = useCallback(async () => {
    if (!draft) return;
    beginMutation();
    setSaving(true);
    try {
      const patch: Record<string, NotionPropValue> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (v.type === 'title' && !v.text) continue;
        if (v.type === 'rich_text' && !v.text) continue;
        if (v.type === 'multi_select' && v.options.length === 0) continue;
        if ((v.type === 'select' || v.type === 'status') && !v.option) continue;
        if (v.type === 'date' && !v.start) continue;
        if ((v.type === 'url' || v.type === 'email' || v.type === 'phone_number') && !v.value) continue;
        if (v.type === 'number' && v.value === null) continue;
        if (v.type === 'checkbox' && v.value === false) continue;
        if (v.type === 'files') continue;
        patch[k] = v;
      }
      if (Object.keys(patch).length === 0) { setDraft(null); return; }
      const res = await fetch('/api/notion/pages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ patch, realDbId }),
      });
      const data = await readJson(res);
      if (data.error) throw new Error(String(data.error));
      setPages(curr => [...curr, data.page as NotionPage]);
      setDraft(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); endMutation(); }
  }, [draft, headers, realDbId, beginMutation, endMutation]);

  // Auto-save draft on click outside the draft row
  useEffect(() => {
    if (!draft) return;
    function onMouseDown(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (el.closest('[data-cancel]') || el.closest('[data-popover]')) return;
      if (draftRowRef.current && !draftRowRef.current.contains(el)) commitInline();
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onMouseDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onMouseDown); };
  }, [draft, commitInline]);

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function archiveRow(pageId: string) {
    if (!confirm('Move this row to trash?')) return;
    beginMutation();
    const prev = pages;
    deletedIdsRef.current.add(pageId);
    setPages(curr => curr.filter(p => p.id !== pageId));
    try {
      const res = await fetch(`/api/notion/pages/${pageId}`, { method: 'DELETE', headers });
      const data = await readJson(res);
      if (data.error) throw new Error(String(data.error));
    } catch (e) {
      deletedIdsRef.current.delete(pageId);
      setPages(prev);
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally { endMutation(); }
  }

  // â”€â”€ File upload (for files-type cells) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const uploadFile = useCallback(async (pageId: string, propName: string, file: File) => {
    beginMutation();
    try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prop', propName);
    const res = await fetch(`/api/notion/pages/${pageId}/file`, { method: 'POST', headers, body: fd });
    const data = await readJson(res);
    if (data.error) throw new Error(data.error);
    if (data.page) setPages(curr => curr.map(p => p.id === pageId ? (data.page as NotionPage) : p));
    } finally { endMutation(); }
  }, [headers, beginMutation, endMutation]);

  const deleteFile = useCallback(async (pageId: string, propName: string, index: number) => {
    beginMutation();
    try {
    const res = await fetch(`/api/notion/pages/${pageId}/file?prop=${encodeURIComponent(propName)}&index=${index}`, {
      method: 'DELETE', headers,
    });
    const data = await readJson(res);
    if (data.error) throw new Error(data.error);
    if (data.page) setPages(curr => curr.map(p => p.id === pageId ? (data.page as NotionPage) : p));
    } finally { endMutation(); }
  }, [headers, beginMutation, endMutation]);

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <div className="skeleton" style={{ height: 36, width: 220, borderRadius: 6, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 28, width: 140, borderRadius: 4, marginBottom: 24 }} />
        {[0,1,2,3,4].map(i => (
          <div key={i} className="skeleton" style={{ height: 38, marginBottom: 1, opacity: 1 - i * 0.13 }} />
        ))}
      </div>
    );
  }

  if (error && !readyRef.current) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>âš </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>{error}</div>
          <button onClick={() => fetchAll()} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--blue)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const titleText = schema.title || 'Journal';
  const cols = schema.properties;
  const tableMin = cols.reduce((s, c) => s + colWidth(c.type), 0) + 36; // +36 for action col

  const CELL: React.CSSProperties = {
    padding: '12px 16px',
    height: 64,
    borderBottom: '1px solid var(--border-color)',
    borderRight: '1px solid var(--border-color)',
    verticalAlign: 'middle',
  };
  const TH_BASE: React.CSSProperties = {
    ...CELL,
    position: 'sticky', top: 0, zIndex: 2,
    background: 'var(--bg-card)',
    fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap', cursor: 'default', userSelect: 'none',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Page header */}
      <div style={{ padding: '24px 32px 0 32px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
          {titleText}
        </h1>
      </div>

      {/* DB heading + view tabs */}
      <div style={{ padding: '18px 32px 0 32px', flexShrink: 0 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0, marginBottom: 8 }}>
          {titleText}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {VIEW_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeView === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveView(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '7px 10px', background: 'transparent', border: 'none',
                    cursor: 'pointer', fontSize: 13,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 400,
                    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                    marginBottom: -1,
                  }}>
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 4 }}>
            <button onClick={() => fetchAll(true)} disabled={refreshing} title="Sync from Notion"
              style={{ width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: refreshing ? 'wait' : 'pointer' }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button onClick={startInline}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 4, fontSize: 13, fontWeight: 500, background: 'var(--blue)', color: 'white', border: 'none', cursor: 'pointer' }}>
              New
              <ChevronDown size={12} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="status" style={{ padding: '8px 32px', color: 'var(--yellow)', fontSize: 12 }}>
          Showing saved data — sync failed. {error}
        </div>
      )}

      {activeView === 'notebook' ? (
        <NotebookView pages={pages} schema={schema} dbId={realDbId ?? schema.realDbId ?? ''} />
      ) : activeView !== 'table' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {VIEW_TABS.find(v => v.id === activeView)?.label} view â€” coming soon
        </div>
      ) : (
        <>
          {/* Filter / count row */}
          <div style={{ padding: '8px 32px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{pages.length} rows</span>
          </div>

          {/* Table â€” scrollable */}
          <div className="journal-scroll" style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: tableMin }}>
              <thead>
                <tr>
                  <th style={{ ...TH_BASE, width: 36, minWidth: 36 }} />
                  {cols.map(col => (
                    <th key={col.id} style={{
                      ...TH_BASE,
                      width: colWidth(col.type), minWidth: colWidth(col.type),
                      textAlign: col.type === 'number' ? 'right' : 'left',
                    }}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pages.map(page => (
                  <tr key={page.id}
                    className="journal-data-row"
                  >
                    <td style={{ ...CELL, width: 36, minWidth: 36, textAlign: 'center' }}>
                      <button onClick={() => archiveRow(page.id)}
                        title="Move to trash" aria-label="Move row to trash" className="row-trash"
                        style={{
                          width: 22, height: 22, padding: 0, border: 'none', background: 'transparent',
                          color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 3,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                    {cols.map(col => {
                      const value = page.properties[col.name] ?? emptyValue(col.type);
                      const w = colWidth(col.type);
                      return (
                        <td key={col.id} style={{
                          ...CELL, width: w, minWidth: w,
                          textAlign: col.type === 'number' ? 'right' : 'left',
                        }}>
                          <EditableCell
                            prop={col}
                            value={value}
                            onCommit={(next) => commitEdit(page.id, col.name, next)}
                            onUploadFile={col.type === 'files' ? (f) => uploadFile(page.id, col.name, f) : undefined}
                            onDeleteFile={col.type === 'files' ? (i) => deleteFile(page.id, col.name, i) : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Inline new-row */}
                {draft && (
                  <tr ref={draftRowRef} style={{ background: 'rgba(59,130,246,0.05)' }}>
                    <td style={{ ...CELL, width: 36, minWidth: 36 }} />
                    {cols.map((col, idx) => {
                      const w = colWidth(col.type);
                      const value = draft[col.name] ?? emptyValue(col.type);
                      return (
                        <td key={col.id} style={{
                          ...CELL, width: w, minWidth: w,
                          textAlign: col.type === 'number' ? 'right' : 'left',
                        }}>
                          <EditableCell
                            prop={col}
                            value={value}
                            onCommit={(next) => setDraftProp(col.name, next)}
                            initialEdit={col.type === 'title'}
                            autoFocus={idx === 0}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )}

                {draft && (
                  <tr>
                    <td colSpan={cols.length + 1} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>{saving ? 'Savingâ€¦' : 'Click outside to save'}</span>
                        <button data-cancel="true" onClick={cancelInline}
                          style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <X size={11} /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Always-visible New page button below the table */}
          {!draft && (
            <div onClick={startInline}
              style={{ padding: '8px 32px', flexShrink: 0, borderTop: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = ''; }}
            >
              <Plus size={13} strokeWidth={2} />
              New page
            </div>
          )}
        </>
      )}
    </div>
  );
}
