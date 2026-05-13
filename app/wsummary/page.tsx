'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import type { NotionPropDef, NotionPropValue, SelectOption } from '@/lib/notion-page';
import { EditableCell } from '@/components/journal/v2/EditableCell';
import { colWidth } from '@/components/journal/v2/widths';
import { TypeSelector } from '@/components/weekly/TypeSelector';
import type { WColumn, WRow, WStore, WColType } from '@/lib/weekly-types';
import { getNotionConfig, notionHeaders } from '@/lib/notion-config';
import {
  pullDb, patchDbSchema, createPage as apiCreatePage,
  updatePage as apiUpdatePage, archivePage as apiArchivePage,
  notionTypeToWColType, safeJson,
} from '@/lib/weekly-sync-client';
import { colToSchemaEntry } from '@/lib/weekly-notion';

const STORE_KEY = 'tj_wsummary';

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultCell(type: WColType): NotionPropValue {
  switch (type) {
    case 'text': return { type: 'rich_text', text: '' };
    case 'number': return { type: 'number', value: null };
    case 'url': return { type: 'url', value: null };
    case 'select': return { type: 'select', option: null };
    case 'multi_select': return { type: 'multi_select', options: [] };
    case 'date': return { type: 'date', start: null, end: null, hasTime: false };
    case 'checkbox': return { type: 'checkbox', value: false };
    case 'files': return { type: 'files', files: [] };
  }
}

function toPropDef(col: WColumn): NotionPropDef {
  return {
    id: col.id,
    name: col.name,
    type: col.type === 'text' ? 'rich_text' : col.type,
    options: col.options as SelectOption[] | undefined,
  };
}

function emptyStore(): WStore {
  return { columns: [{ id: 'col_week', name: 'Week', type: 'text' }], rows: [] };
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Column header (inline component) ──────────────────────────────────────────

const TYPE_LABEL: Record<WColType, string> = {
  text: 'Aa', number: '#', url: '↗', select: '◯',
  multi_select: '⊞', date: '📅', checkbox: '☑', files: '🖼',
};

function ColumnHeader({
  col, onRename, onTypeChange, onDelete,
}: {
  col: WColumn;
  onRename: (name: string) => void;
  onTypeChange: (type: WColType) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(col.name);
  const [typeRect, setTypeRect] = useState<DOMRect | null>(null);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { setNameVal(col.name); }, [col.name]);

  function commit() { onRename(nameVal.trim() || col.name); setEditing(false); }

  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', minWidth: 0 }}
    >
      <button
        ref={typeRef}
        onClick={() => setTypeRect(typeRef.current?.getBoundingClientRect() ?? null)}
        title="Change column type"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px',
          borderRadius: 4, flexShrink: 0, lineHeight: 1,
          fontFamily: col.type === 'text' || col.type === 'number' ? 'monospace' : 'inherit',
        }}
      >
        {TYPE_LABEL[col.type]}
      </button>
      {editing ? (
        <input
          ref={inputRef} value={nameVal} onChange={e => setNameVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setNameVal(col.name); setEditing(false); }
          }}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--blue)', color: 'var(--text-primary)',
            fontSize: 12, fontWeight: 500, outline: 'none', minWidth: 0,
          }}
        />
      ) : (
        <span
          onClick={() => { setNameVal(col.name); setEditing(true); }}
          title="Click to rename"
          style={{
            flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
            cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {col.name}
        </span>
      )}
      <button
        onClick={onDelete} title="Delete column"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: '1px 3px', borderRadius: 4,
          opacity: hover ? 0.8 : 0, transition: 'opacity 120ms',
          lineHeight: 1, fontSize: 15, flexShrink: 0,
        }}
      >×</button>
      {typeRect && createPortal(
        <TypeSelector
          current={col.type} anchorRect={typeRect}
          onSelect={type => { onTypeChange(type); setTypeRect(null); }}
          onClose={() => setTypeRect(null)}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WeeklySummaryPage() {
  const [store, setStore] = useState<WStore | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [exportModal, setExportModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const [pages, setPages] = useState<{ id: string; title: string }[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [pagesError, setPagesError] = useState('');
  const [importModal, setImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const [databases, setDatabases] = useState<{ id: string; title: string }[] | null>(null);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [databasesError, setDatabasesError] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'offline'>('offline');
  const [syncError, setSyncError] = useState('');
  const [settingsModal, setSettingsModal] = useState(false);

  const storeRef = useRef<WStore | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(0);
  const addRowBtnRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => { storeRef.current = store; }, [store]);

  // Initial load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const s = raw ? JSON.parse(raw) as WStore : emptyStore();
      setStore(s);
      setSyncStatus(s.notion ? 'idle' : 'offline');
    } catch {
      setStore(emptyStore());
    }
  }, []);

  function upd(fn: (s: WStore) => WStore) {
    setStore(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // ── Sync queue ──────────────────────────────────────────────────────────────
  const enqueue = useCallback((fn: () => Promise<void>) => {
    pendingRef.current += 1;
    setSyncStatus('syncing');
    queueRef.current = queueRef.current.then(async () => {
      try {
        await fn();
        setSyncError('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync error';
        setSyncError(msg);
        setSyncStatus('error');
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) {
          setSyncStatus(prev => prev === 'error' ? 'error' : 'idle');
        }
      }
    });
  }, []);

  // ── Pull & reconcile ────────────────────────────────────────────────────────
  const pullAndReconcile = useCallback(async () => {
    const cur = storeRef.current;
    if (!cur?.notion) return;
    if (pendingRef.current > 0) return; // skip pull while pushing
    try {
      const { schema, pages: nPages, orderFromView } = await pullDb(cur.notion.dbId);
      setStore(prev => {
        if (!prev?.notion) return prev;
        const localByPropId = new Map(
          prev.columns.filter(c => c.notionPropId).map(c => [c.notionPropId!, c] as const),
        );

        // Column order:
        //  - If we already have local synced columns, preserve local order (supports user
        //    drag-to-reorder). New Notion props get appended at the end.
        //  - On first pull (no local synced cols), use Notion's view order or alphabetical.
        const synced: WColumn[] = [];
        const seenPropIds = new Set<string>();
        const hasLocalSynced = prev.columns.some(c => c.notionPropId);

        if (hasLocalSynced) {
          for (const local of prev.columns) {
            if (local.notionPropId) {
              const np = schema.properties.find(p => p.id === local.notionPropId);
              if (!np) continue; // column was deleted in Notion
              const wType = notionTypeToWColType(np.type);
              if (!wType) continue;
              const opts = np.options?.map(o => ({ name: o.name, color: (o.color ?? 'default') as string }));
              synced.push({ ...local, notionType: np.type, name: np.name, type: wType, options: opts });
              seenPropIds.add(np.id);
            } else {
              synced.push(local);
            }
          }
          for (const np of schema.properties) {
            if (seenPropIds.has(np.id)) continue;
            const wType = notionTypeToWColType(np.type);
            if (!wType) continue;
            const opts = np.options?.map(o => ({ name: o.name, color: (o.color ?? 'default') as string }));
            synced.push({ id: uid('col'), notionPropId: np.id, notionType: np.type, name: np.name, type: wType, options: opts });
          }
        } else {
          let ordered: NotionPropDef[];
          if (orderFromView) {
            const titleIdx = schema.properties.findIndex(p => p.type === 'title');
            ordered = titleIdx > 0
              ? [schema.properties[titleIdx], ...schema.properties.filter((_, i) => i !== titleIdx)]
              : schema.properties;
          } else {
            ordered = [...schema.properties].sort((a, b) => {
              if (a.type === 'title') return -1;
              if (b.type === 'title') return 1;
              return a.name.localeCompare(b.name);
            });
          }
          for (const np of ordered) {
            const wType = notionTypeToWColType(np.type);
            if (!wType) continue;
            const opts = np.options?.map(o => ({ name: o.name, color: (o.color ?? 'default') as string }));
            const local = localByPropId.get(np.id);
            synced.push(local
              ? { ...local, notionType: np.type, name: np.name, type: wType, options: opts }
              : { id: uid('col'), notionPropId: np.id, notionType: np.type, name: np.name, type: wType, options: opts });
          }
          for (const c of prev.columns) if (!c.notionPropId) synced.push(c);
        }

        // Follow Notion's row order (created_time ascending from query).
        const localByPageId = new Map(
          prev.rows.filter(r => r.notionPageId).map(r => [r.notionPageId!, r] as const),
        );
        const newRows: WRow[] = [];
        for (const np of nPages) {
          const cells: Record<string, NotionPropValue> = {};
          for (const col of synced) {
            const v = (np.properties as Record<string, NotionPropValue>)[col.name];
            cells[col.id] = v ?? defaultCell(col.type);
          }
          const local = localByPageId.get(np.id);
          newRows.push(local ? { ...local, cells } : { id: uid('row'), notionPageId: np.id, cells });
        }
        // Append local-only rows (pending Notion creation) at bottom.
        for (const r of prev.rows.filter(r => !r.notionPageId)) newRows.push(r);

        const next = { ...prev, columns: synced, rows: newRows };
        try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      setSyncError('');
      setSyncStatus(s => s === 'syncing' ? s : 'idle');
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Pull failed');
      setSyncStatus('error');
    }
  }, []);

  // Polling
  useEffect(() => {
    if (!store?.notion) {
      setSyncStatus('offline');
      return;
    }
    pullAndReconcile();
    const id = setInterval(pullAndReconcile, 15000);
    return () => clearInterval(id);
  }, [store?.notion?.dbId, pullAndReconcile]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function addColumn() {
    if (!store) return;
    const id = uid('col');
    const baseName = `Column ${store.columns.length + 1}`;
    let name = baseName;
    let counter = 1;
    const existing = new Set(store.columns.map(c => c.name));
    while (existing.has(name)) name = `${baseName} (${counter++})`;
    const newCol: WColumn = { id, name, type: 'text' };
    upd(s => ({
      ...s,
      columns: [...s.columns, newCol],
      rows: s.rows.map(r => ({ ...r, cells: { ...r.cells, [id]: defaultCell('text') } })),
    }));
    if (store.notion) {
      enqueue(async () => {
        const { schema } = await patchDbSchema(store.notion!.dbId, { [name]: { rich_text: {} } });
        const np = schema.properties.find(p => p.name === name);
        if (np) {
          upd(s => ({
            ...s,
            columns: s.columns.map(c => c.id === id ? { ...c, notionPropId: np.id } : c),
          }));
        }
      });
    }
  }

  function renameColumn(colId: string, name: string) {
    const cur = storeRef.current;
    const old = cur?.columns.find(c => c.id === colId);
    if (!old || !cur) return;
    if (old.name === name) return;
    upd(s => ({ ...s, columns: s.columns.map(c => c.id === colId ? { ...c, name } : c) }));
    if (cur.notion) {
      const key = old.notionPropId ?? old.name;
      enqueue(async () => {
        await patchDbSchema(cur.notion!.dbId, { [key]: { name } });
      });
    }
  }

  function changeColumnType(colId: string, type: WColType) {
    const cur = storeRef.current;
    const old = cur?.columns.find(c => c.id === colId);
    if (!old || !cur) return;
    if (old.type === type) return;
    const isTitle = old.notionType ? old.notionType === 'title' : cur.columns[0]?.id === colId;
    upd(s => ({
      ...s,
      columns: s.columns.map(c => c.id === colId ? { ...c, type, options: [] } : c),
      rows: s.rows.map(r => ({ ...r, cells: { ...r.cells, [colId]: defaultCell(type) } })),
    }));
    if (cur.notion && old.notionPropId && !isTitle) {
      const tempCol: WColumn = { ...old, type, options: [] };
      enqueue(async () => {
        await patchDbSchema(cur.notion!.dbId, {
          [old.notionPropId!]: colToSchemaEntry(tempCol, false) as Record<string, unknown>,
        });
      });
    }
  }

  function deleteColumn(colId: string) {
    const cur = storeRef.current;
    const old = cur?.columns.find(c => c.id === colId);
    if (!old || !cur) return;
    upd(s => ({
      ...s,
      columns: s.columns.filter(c => c.id !== colId),
      rows: s.rows.map(r => {
        const cells = { ...r.cells };
        delete cells[colId];
        return { ...r, cells };
      }),
    }));
    if (cur.notion && old.notionPropId) {
      enqueue(async () => {
        await patchDbSchema(cur.notion!.dbId, { [old.notionPropId!]: null });
      });
    }
  }

  function addRow() {
    const cur = storeRef.current;
    if (!cur) return;
    const id = uid('row');
    const cells: Record<string, NotionPropValue> = {};
    for (const col of cur.columns) cells[col.id] = defaultCell(col.type);
    upd(s => ({ ...s, rows: [...s.rows, { id, cells }] }));
    setTimeout(() => addRowBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
    if (cur.notion) {
      enqueue(async () => {
        const latest = storeRef.current;
        if (!latest?.notion) return;
        const latestRow = latest.rows.find(r => r.id === id);
        const sendCells = latestRow?.cells ?? cells;
        const { pageId } = await apiCreatePage(latest.notion.dbId, latest.columns, sendCells);
        upd(s => ({
          ...s,
          rows: s.rows.map(r => r.id === id ? { ...r, notionPageId: pageId } : r),
        }));
      });
    }
  }

  function reorderColumns(fromId: string, toId: string) {
    upd(s => {
      const cols = [...s.columns];
      const from = cols.findIndex(c => c.id === fromId);
      const to = cols.findIndex(c => c.id === toId);
      if (from === -1 || to === -1 || from === to) return s;
      const [item] = cols.splice(from, 1);
      cols.splice(to, 0, item);
      return { ...s, columns: cols };
    });
  }

  function reorderRows(fromId: string, toId: string) {
    upd(s => {
      const rows = [...s.rows];
      const from = rows.findIndex(r => r.id === fromId);
      const to = rows.findIndex(r => r.id === toId);
      if (from === -1 || to === -1 || from === to) return s;
      const [item] = rows.splice(from, 1);
      rows.splice(to, 0, item);
      return { ...s, rows };
    });
  }

  function deleteRow(rowId: string) {
    const cur = storeRef.current;
    const old = cur?.rows.find(r => r.id === rowId);
    if (!old || !cur) return;
    upd(s => ({ ...s, rows: s.rows.filter(r => r.id !== rowId) }));
    if (cur.notion && old.notionPageId) {
      enqueue(async () => { await apiArchivePage(old.notionPageId!); });
    }
  }

  function updateCell(rowId: string, colId: string, value: NotionPropValue) {
    const cur = storeRef.current;
    if (!cur) return;
    const row = cur.rows.find(r => r.id === rowId);
    if (!row) return;

    let colsAfter = cur.columns;
    if (value.type === 'multi_select' || value.type === 'select') {
      const newOpts: SelectOption[] =
        value.type === 'multi_select' ? value.options : value.option ? [value.option] : [];
      const col = cur.columns.find(c => c.id === colId);
      if (col) {
        const known = new Set(col.options?.map(o => o.name) ?? []);
        const toAdd = newOpts.filter(o => !known.has(o.name));
        if (toAdd.length > 0) {
          colsAfter = cur.columns.map(c => c.id === colId
            ? { ...c, options: [...(c.options ?? []), ...toAdd.map(o => ({ name: o.name, color: o.color ?? 'default' }))] }
            : c);
        }
      }
    }

    const updatedCells = { ...row.cells, [colId]: value };
    upd(s => ({
      ...s, columns: colsAfter,
      rows: s.rows.map(r => r.id === rowId ? { ...r, cells: updatedCells } : r),
    }));
    if (cur.notion && row.notionPageId) {
      enqueue(async () => {
        const latest = storeRef.current;
        const latestRow = latest?.rows.find(r => r.id === rowId);
        if (!latest || !latestRow?.notionPageId) return;
        await apiUpdatePage(latestRow.notionPageId, latest.columns, latestRow.cells);
      });
    }
  }

  // ── Connect / disconnect ────────────────────────────────────────────────────

  async function loadPages() {
    setPages(null);
    setPagesError('');
    try {
      const cfg = getNotionConfig();
      const res = await fetch('/api/weekly/notion-pages', { headers: notionHeaders(cfg) });
      const data = await safeJson<{ pages?: { id: string; title: string }[]; error?: string }>(res, 'Failed to load pages');
      if (!res.ok) throw new Error(data.error ?? `Failed to load pages (HTTP ${res.status})`);
      setPages(data.pages ?? []);
    } catch (e) {
      setPagesError(e instanceof Error ? e.message : 'Unknown error');
      setPages([]);
    }
  }

  async function loadDatabases() {
    setDatabases(null);
    setDatabasesError('');
    try {
      const cfg = getNotionConfig();
      const res = await fetch('/api/notion/databases', { headers: notionHeaders(cfg) });
      const data = await safeJson<{ databases?: { id: string; title: string }[]; error?: string }>(res, 'Failed to load databases');
      if (!res.ok) throw new Error(data.error ?? `Failed to load databases (HTTP ${res.status})`);
      setDatabases(data.databases ?? []);
    } catch (e) {
      setDatabasesError(e instanceof Error ? e.message : 'Unknown error');
      setDatabases([]);
    }
  }

  async function doImport() {
    if (!selectedDbId) { setImportError('Please select a Notion database'); return; }
    if ((store?.rows.length ?? 0) > 0 || (store?.columns.length ?? 0) > 1) {
      if (!confirm('Importing will replace the current local table with the Notion database content. Continue?')) return;
    }
    setImportStatus('loading');
    setImportError('');
    try {
      const cfg = getNotionConfig();
      const res = await fetch('/api/weekly/import', {
        method: 'POST',
        headers: { ...notionHeaders(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSourceId: selectedDbId }),
      });
      const data = await safeJson<{ dbId?: string; url?: string; error?: string }>(res, 'Import failed');
      if (!res.ok || !data.dbId) throw new Error(data.error ?? `Import failed (HTTP ${res.status})`);
      upd(s => ({
        ...s,
        notion: { dbId: data.dbId!, dbUrl: data.url ?? '' },
        columns: [],
        rows: [],
      }));
      setImportResult(data.url ?? null);
      setImportStatus('done');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Unknown error');
      setImportStatus('error');
    }
  }

  async function doExport() {
    if (!selectedPageId) { setExportError('Please select a Notion page'); return; }
    setExportStatus('loading');
    setExportError('');
    try {
      const cfg = getNotionConfig();
      const res = await fetch('/api/weekly/export', {
        method: 'POST',
        headers: { ...notionHeaders(cfg), 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: store?.columns, rows: store?.rows, parentPageId: selectedPageId }),
      });
      const data = await safeJson<{
        url?: string; dbId?: string;
        columnPropIds?: Record<string, string>;
        rowPageIds?: Record<string, string>;
        error?: string;
      }>(res, 'Export failed');
      if (!res.ok || !data.dbId) throw new Error(data.error ?? `Export failed (HTTP ${res.status})`);
      upd(s => ({
        ...s,
        notion: { dbId: data.dbId!, dbUrl: data.url ?? '' },
        columns: [],
        rows: [],
      }));
      setExportResult(data.url ?? null);
      setExportStatus('done');
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Unknown error');
      setExportStatus('error');
    }
  }

  function openExportModal() {
    setExportStatus('idle'); setExportResult(null); setExportError('');
    setSelectedPageId('');
    setExportModal(true);
    loadPages();
  }

  function openImportModal() {
    setImportStatus('idle'); setImportResult(null); setImportError('');
    setSelectedDbId('');
    setImportModal(true);
    loadDatabases();
  }

  function disconnect() {
    if (!confirm('Disconnect from Notion? Local data stays. Future changes won\'t sync.')) return;
    upd(s => ({
      ...s, notion: null,
      columns: s.columns.map(c => { const x = { ...c }; delete x.notionPropId; return x; }),
      rows: s.rows.map(r => { const x = { ...r }; delete x.notionPageId; return x; }),
    }));
    setSettingsModal(false);
    setSyncStatus('offline');
  }

  if (!store) return null;

  const cols = store.columns;
  const rows = store.rows;
  const minW = cols.reduce((s, c) => s + colWidth(toPropDef(c).type), 0) + 44 + 28;
  const isConnected = !!store.notion;

  // ── Sync indicator ──────────────────────────────────────────────────────────
  const indicator = (() => {
    if (syncStatus === 'offline') return null;
    const colors = {
      idle: { dot: 'var(--green)', text: 'Synced' },
      syncing: { dot: 'var(--yellow)', text: 'Syncing…' },
      error: { dot: 'var(--red)', text: 'Sync error' },
      offline: { dot: 'var(--text-muted)', text: '' },
    } as const;
    const c = colors[syncStatus];
    return (
      <div
        title={syncError || c.text}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-muted)', padding: '0 8px',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: c.dot,
          boxShadow: `0 0 0 2px ${c.dot.replace('var(--', 'rgba(').replace(')', ',0.18)')}`,
        }} />
        {c.text}
      </div>
    );
  })();

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
            Weekly Summary
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 2, alignItems: 'center' }}>
          {indicator}
          <button
            onClick={addColumn}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)', borderRadius: 8, padding: '7px 14px',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            <Plus size={13} strokeWidth={2} /> Add Column
          </button>
          {isConnected ? (
            <button
              onClick={() => setSettingsModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                color: 'var(--green)', borderRadius: 8, padding: '7px 14px',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              ✓ Notion connected
            </button>
          ) : (
            <>
              <button
                onClick={openImportModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.22)',
                  color: 'var(--purple)', borderRadius: 8, padding: '7px 14px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Import from Notion ↙
              </button>
              <button
                onClick={openExportModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.22)',
                  color: 'var(--blue)', borderRadius: 8, padding: '7px 14px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Export to Notion ↗
              </button>
            </>
          )}
        </div>
      </div>

      {syncError && syncStatus === 'error' && (
        <div
          onClick={() => { setSyncError(''); setSyncStatus('idle'); pullAndReconcile(); }}
          style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 7,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: 'var(--red)', fontSize: 12, cursor: 'pointer',
          }}
        >
          Sync error: {syncError} — click to retry
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: minW }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ width: 28, minWidth: 28, borderRight: '1px solid var(--border-color)' }} />
              {cols.map(col => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={e => {
                    const t = e.target as HTMLElement;
                    if (t.tagName === 'INPUT' || t.tagName === 'BUTTON' || t.closest('button')) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    setDragColId(col.id);
                  }}
                  onDragEnd={() => { setDragColId(null); setDragOverColId(null); }}
                  onDragOver={e => {
                    if (!dragColId || dragColId === col.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverColId(col.id);
                  }}
                  onDragLeave={() => { if (dragOverColId === col.id) setDragOverColId(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragColId && dragColId !== col.id) reorderColumns(dragColId, col.id);
                    setDragOverColId(null);
                  }}
                  style={{
                    width: colWidth(toPropDef(col).type),
                    minWidth: colWidth(toPropDef(col).type),
                    padding: '8px 0', textAlign: 'left',
                    borderRight: dragOverColId === col.id
                      ? '2px solid var(--blue)'
                      : '1px solid var(--border-color)',
                    fontWeight: 400,
                    cursor: dragColId ? 'grabbing' : 'grab',
                    opacity: dragColId === col.id ? 0.4 : 1,
                    background: dragOverColId === col.id ? 'rgba(59,130,246,0.07)' : undefined,
                    transition: 'background 80ms, opacity 80ms',
                  }}
                >
                  <ColumnHeader
                    col={col}
                    onRename={name => renameColumn(col.id, name)}
                    onTypeChange={type => changeColumnType(col.id, type)}
                    onDelete={() => deleteColumn(col.id)}
                  />
                </th>
              ))}
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px 16px', fontSize: 13 }}
                >
                  No rows yet — click &quot;+ New row&quot; to get started
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr
                key={row.id}
                onMouseEnter={() => setHoveredRow(row.id)} onMouseLeave={() => setHoveredRow(null)}
                onDragOver={e => { e.preventDefault(); setDragOverRowId(row.id); }}
                onDrop={() => { if (dragRowId && dragRowId !== row.id) reorderRows(dragRowId, row.id); setDragOverRowId(null); }}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  background: dragOverRowId === row.id
                    ? 'rgba(59,130,246,0.07)'
                    : hoveredRow === row.id ? 'rgba(255,255,255,0.018)' : 'transparent',
                  opacity: dragRowId === row.id ? 0.4 : 1,
                  transition: 'background 80ms',
                }}
              >
                <td
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragRowId(row.id); }}
                  onDragEnd={() => { setDragRowId(null); setDragOverRowId(null); }}
                  style={{
                    width: 28, minWidth: 28, textAlign: 'center', verticalAlign: 'middle',
                    borderRight: '1px solid var(--border-color)',
                    cursor: 'grab', color: 'var(--text-muted)', fontSize: 14,
                    opacity: hoveredRow === row.id ? 0.6 : 0,
                    transition: 'opacity 120ms', userSelect: 'none',
                  }}
                >⠿</td>
                {cols.map(col => (
                  <td
                    key={col.id}
                    style={{
                      width: colWidth(toPropDef(col).type),
                      minWidth: colWidth(toPropDef(col).type),
                      padding: '5px 0', verticalAlign: 'middle', borderRight: '1px solid var(--border-color)',
                    }}
                  >
                    <EditableCell
                      prop={toPropDef(col)}
                      value={row.cells[col.id] ?? defaultCell(col.type)}
                      onCommit={next => updateCell(row.id, col.id, next)}
                    />
                  </td>
                ))}
                <td style={{ width: 44, textAlign: 'center', verticalAlign: 'middle' }}>
                  <button
                    onClick={() => deleteRow(row.id)} title="Delete row"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: 4, borderRadius: 4,
                      opacity: hoveredRow === row.id ? 0.7 : 0,
                      transition: 'opacity 120ms',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            <tr ref={addRowBtnRef}>
              <td colSpan={cols.length + 1} style={{ padding: '3px 6px' }}>
                <button
                  onClick={addRow}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 12, padding: '6px 6px',
                  }}
                >
                  <Plus size={12} strokeWidth={2} /> New row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Settings modal (when connected) */}
      {settingsModal && store.notion && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setSettingsModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 24, width: 420,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Notion sync settings
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.6 }}>
              Two-way sync is active. Changes here push immediately, and we pull from Notion every 15s.
            </p>
            {store.notion.dbUrl && (
              <a
                href={store.notion.dbUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'block', padding: '10px 12px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                  borderRadius: 7, color: 'var(--blue)', fontSize: 12,
                  textDecoration: 'none', marginBottom: 16,
                }}
              >
                Open WEEKLY SUMMARY in Notion ↗
              </a>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button
                onClick={disconnect}
                style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                  color: 'var(--red)', borderRadius: 7, padding: '7px 14px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
              <button
                onClick={() => setSettingsModal(false)}
                style={{
                  background: 'none', border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 14px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {exportModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setExportModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 24, width: 440,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Export to Notion
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              Creates a new <strong style={{ color: 'var(--text-secondary)' }}>WEEKLY SUMMARY</strong> database
              and keeps it in two-way sync with this table. Your existing Journal is not affected.
            </p>

            {exportStatus === 'done' && exportResult ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ color: 'var(--green)', fontSize: 15, marginBottom: 14 }}>✓ Connected & synced!</div>
                <a href={exportResult} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--blue)', fontSize: 13 }}>
                  Open in Notion ↗
                </a>
                <br />
                <button
                  onClick={() => setExportModal(false)}
                  style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                >Close</button>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Choose a parent page in your Notion
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Creates a new <strong style={{ color: 'var(--text-secondary)' }}>WEEKLY SUMMARY</strong> database under the chosen page.
                </div>

                {pages === null ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '12px 0' }}>
                    Loading your Notion pages…
                  </div>
                ) : pagesError ? (
                  <div style={{ color: 'var(--red)', fontSize: 12, padding: '8px 0' }}>{pagesError}</div>
                ) : pages.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0', lineHeight: 1.6 }}>
                    No pages found. In Notion, share at least one page with your integration first.
                  </div>
                ) : (
                  <div style={{
                    maxHeight: 220, overflowY: 'auto',
                    border: '1px solid var(--border-color)', borderRadius: 7,
                    background: 'var(--bg-surface)',
                  }}>
                    {pages.map((p, i) => {
                      const sel = p.id === selectedPageId;
                      return (
                        <button
                          key={p.id} onClick={() => setSelectedPageId(p.id)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '9px 12px',
                            background: sel ? 'rgba(59,130,246,0.10)' : 'transparent',
                            border: 'none',
                            borderBottom: i < pages.length - 1 ? '1px solid var(--border-color)' : 'none',
                            color: sel ? 'var(--blue)' : 'var(--text-primary)',
                            fontSize: 12, cursor: 'pointer',
                            fontWeight: sel ? 500 : 400,
                          }}
                        >
                          📄 {p.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                {exportError && (
                  <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{exportError}</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    onClick={() => setExportModal(false)}
                    style={{
                      background: 'none', border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 14px',
                      fontSize: 12, cursor: 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    onClick={doExport}
                    disabled={exportStatus === 'loading' || !selectedPageId}
                    style={{
                      background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)',
                      color: 'var(--blue)', borderRadius: 7, padding: '7px 16px',
                      fontSize: 12, cursor: 'pointer',
                      opacity: exportStatus === 'loading' || !selectedPageId ? 0.5 : 1,
                    }}
                  >
                    {exportStatus === 'loading' ? 'Connecting…' : 'Connect & sync'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import modal */}
      {importModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setImportModal(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 24, width: 440,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Import from Notion
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              Pulls schema and rows from an existing Notion database and keeps it in two-way sync.
              The current local table will be replaced.
            </p>

            {importStatus === 'done' && importResult ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ color: 'var(--green)', fontSize: 15, marginBottom: 14 }}>✓ Imported & synced!</div>
                <a href={importResult} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--blue)', fontSize: 13 }}>
                  Open in Notion ↗
                </a>
                <br />
                <button
                  onClick={() => setImportModal(false)}
                  style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                >Close</button>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Choose an existing Notion database
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  The database must be shared with your integration in Notion.
                </div>

                {databases === null ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '12px 0' }}>
                    Loading your Notion databases…
                  </div>
                ) : databasesError ? (
                  <div style={{ color: 'var(--red)', fontSize: 12, padding: '8px 0' }}>{databasesError}</div>
                ) : databases.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0', lineHeight: 1.6 }}>
                    No databases found. In Notion, share at least one database with your integration first.
                  </div>
                ) : (
                  <div style={{
                    maxHeight: 220, overflowY: 'auto',
                    border: '1px solid var(--border-color)', borderRadius: 7,
                    background: 'var(--bg-surface)',
                  }}>
                    {databases.map((d, i) => {
                      const sel = d.id === selectedDbId;
                      return (
                        <button
                          key={d.id} onClick={() => setSelectedDbId(d.id)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '9px 12px',
                            background: sel ? 'rgba(168,85,247,0.10)' : 'transparent',
                            border: 'none',
                            borderBottom: i < databases.length - 1 ? '1px solid var(--border-color)' : 'none',
                            color: sel ? 'var(--purple)' : 'var(--text-primary)',
                            fontSize: 12, cursor: 'pointer',
                            fontWeight: sel ? 500 : 400,
                          }}
                        >
                          🗂 {d.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                {importError && (
                  <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{importError}</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    onClick={() => setImportModal(false)}
                    style={{
                      background: 'none', border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)', borderRadius: 7, padding: '7px 14px',
                      fontSize: 12, cursor: 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    onClick={doImport}
                    disabled={importStatus === 'loading' || !selectedDbId}
                    style={{
                      background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)',
                      color: 'var(--purple)', borderRadius: 7, padding: '7px 16px',
                      fontSize: 12, cursor: 'pointer',
                      opacity: importStatus === 'loading' || !selectedDbId ? 0.5 : 1,
                    }}
                  >
                    {importStatus === 'loading' ? 'Importing…' : 'Import & sync'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
