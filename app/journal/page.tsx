'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Table as TableIcon, Calendar, LayoutGrid, BarChart3, ChevronDown, X, Trash2 } from 'lucide-react';
import type { NotionPage, NotionDbSchema, NotionPropDef, NotionPropValue } from '@/lib/notion-page';
import { getNotionConfig, saveNotionConfig, notionHeaders } from '@/lib/notion-config';
import { EditableCell } from '@/components/journal/v2/EditableCell';
import { colWidth } from '@/components/journal/v2/widths';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── View tabs (decorative — only Table works) ────────────────────────────────
const VIEW_TABS = [
  { id: 'table',    label: 'Table',     icon: TableIcon },
  { id: 'calendar', label: 'Calendar',  icon: Calendar },
  { id: 'gallery',  label: 'Gallery',   icon: LayoutGrid },
  { id: 'stats',    label: 'statistic', icon: BarChart3 },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function JournalPage() {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [schema, setSchema] = useState<NotionDbSchema>({ title: '', realDbId: '', properties: [] });
  const [realDbId, setRealDbId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>('table');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, NotionPropValue> | null>(null);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headers = useMemo(() => notionHeaders(getNotionConfig()), []);

  // ── Fetch pages + schema ───────────────────────────────────────────────────
  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const sh: Record<string, string> = { ...headers };
      if (realDbId) sh['x-notion-realdb'] = realDbId;
      const res = await fetch('/api/notion/pages', { headers: sh });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPages(data.pages as NotionPage[]);
      setSchema(data.schema as NotionDbSchema);
      if (data.realDbId) {
        setRealDbId(data.realDbId);
        const cfg = getNotionConfig();
        if (cfg && cfg.realDbId !== data.realDbId) saveNotionConfig({ ...cfg, realDbId: data.realDbId });
      }
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); setRefreshing(false); }
  }, [headers, realDbId]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(() => fetchAll(true), 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  // ── Edit a cell ────────────────────────────────────────────────────────────
  const commitEdit = useCallback(async (pageId: string, propName: string, next: NotionPropValue) => {
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
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Replace with server-truth (in case Notion normalized values).
      setPages(curr => curr.map(p => p.id === pageId ? (data.page as NotionPage) : p));
    } catch (e) {
      console.error('[edit] failed', e);
      setPages(prev); // rollback
      alert(e instanceof Error ? e.message : 'Save failed');
    }
  }, [headers, pages]);

  // ── Inline new row ─────────────────────────────────────────────────────────
  const startInline = () => setDraft(emptyPage(schema));
  const cancelInline = () => setDraft(null);

  function setDraftProp(propName: string, value: NotionPropValue) {
    setDraft(d => d ? { ...d, [propName]: value } : d);
  }

  async function commitInline() {
    if (!draft) return;
    setSaving(true);
    try {
      // Strip read-only / empty values where appropriate (server also strips, but be tidy)
      const patch: Record<string, NotionPropValue> = {};
      for (const [k, v] of Object.entries(draft)) {
        // Skip totally-empty values to avoid clobbering Notion defaults.
        if (v.type === 'title' && !v.text) continue;
        if (v.type === 'rich_text' && !v.text) continue;
        if (v.type === 'multi_select' && v.options.length === 0) continue;
        if ((v.type === 'select' || v.type === 'status') && !v.option) continue;
        if (v.type === 'date' && !v.start) continue;
        if ((v.type === 'url' || v.type === 'email' || v.type === 'phone_number') && !v.value) continue;
        if (v.type === 'number' && v.value === null) continue;
        if (v.type === 'checkbox' && v.value === false) continue;
        if (v.type === 'files') continue; // upload after create
        patch[k] = v;
      }
      const res = await fetch('/api/notion/pages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ patch, realDbId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPages(curr => [...curr, data.page as NotionPage]);
      setDraft(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Create failed');
    } finally { setSaving(false); }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function archiveRow(pageId: string) {
    if (!confirm('Move this row to trash?')) return;
    const prev = pages;
    setPages(curr => curr.filter(p => p.id !== pageId));
    try {
      const res = await fetch(`/api/notion/pages/${pageId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      setPages(prev);
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  // ── File upload (for files-type cells) ─────────────────────────────────────
  const uploadFile = useCallback(async (pageId: string, propName: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('prop', propName);
    const res = await fetch(`/api/notion/pages/${pageId}/file`, { method: 'POST', headers, body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.page) setPages(curr => curr.map(p => p.id === pageId ? (data.page as NotionPage) : p));
  }, [headers]);

  // ── Render ─────────────────────────────────────────────────────────────────
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

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.4 }}>⚠</div>
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
    padding: '7px 10px',
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

      {activeView !== 'table' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {VIEW_TABS.find(v => v.id === activeView)?.label} view — coming soon
        </div>
      ) : (
        <>
          {/* Filter / count row */}
          <div style={{ padding: '8px 32px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{pages.length} rows</span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: tableMin }}>
              <thead>
                <tr>
                  {cols.map(col => (
                    <th key={col.id} style={{
                      ...TH_BASE,
                      width: colWidth(col.type), minWidth: colWidth(col.type),
                      textAlign: col.type === 'number' ? 'right' : 'left',
                    }}>
                      {col.name}
                    </th>
                  ))}
                  <th style={{ ...TH_BASE, width: 36, minWidth: 36 }} />
                </tr>
              </thead>

              <tbody>
                {pages.map(page => (
                  <tr key={page.id}
                    onMouseEnter={() => setHoveredId(page.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ background: hoveredId === page.id ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                  >
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
                          />
                        </td>
                      );
                    })}
                    <td style={{ ...CELL, width: 36, minWidth: 36, textAlign: 'center' }}>
                      <button onClick={() => archiveRow(page.id)}
                        title="Move to trash"
                        style={{
                          width: 22, height: 22, padding: 0, border: 'none', background: 'transparent',
                          color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 3,
                          opacity: hoveredId === page.id ? 1 : 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Inline new-row */}
                {draft && (
                  <tr style={{ background: 'rgba(59,130,246,0.05)' }}>
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
                    <td style={{ ...CELL, width: 36, minWidth: 36 }} />
                  </tr>
                )}

                {/* Footer "+ New page" / draft action bar */}
                {!draft ? (
                  <tr>
                    <td onClick={startInline} colSpan={cols.length + 1}
                      style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={13} strokeWidth={2} />
                        New page
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={cols.length + 1} style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        <span>Fill row, then Save · Escape to cancel</span>
                        <button onClick={commitInline} disabled={saving}
                          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'var(--blue)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelInline}
                          style={{ padding: '4px 8px', fontSize: 11, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <X size={11} /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
