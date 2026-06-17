'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Plus, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NotionPropDef, NotionPropValue, SelectOption, FileRef } from '@/lib/notion-page';
import { tagBg, tagFg } from './colors';
import { OptionPopover } from './OptionPopover';

interface Props {
  prop: NotionPropDef;
  value: NotionPropValue;
  // Commit a new value for this property; pass null/undefined to clear.
  onCommit: (next: NotionPropValue) => void;
  // Used only by file uploader.
  onUploadFile?: (file: File) => Promise<void>;
  // Delete a single file by index (files-type cells only).
  onDeleteFile?: (index: number) => Promise<void>;
  // When true, the cell starts in edit mode (used for inline new-row).
  initialEdit?: boolean;
  autoFocus?: boolean;
}

const READONLY_TYPES = new Set([
  'people', 'relation', 'formula', 'rollup',
  'created_time', 'last_edited_time', 'created_by', 'last_edited_by',
  'unique_id', 'unsupported',
]);

export function EditableCell({ prop, value, onCommit, onUploadFile, onDeleteFile, initialEdit, autoFocus }: Props) {
  const [editing, setEditing] = useState(!!initialEdit);
  const [popRect, setPopRect] = useState<DOMRect | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const readOnly = READONLY_TYPES.has(prop.type);
  const files = value.type === 'files' ? value.files : [];

  function startEdit(e: React.MouseEvent) {
    if (readOnly) return;
    e.stopPropagation();
    if (prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status' || prop.type === 'date') {
      if (containerRef.current) setPopRect(containerRef.current.getBoundingClientRect());
      return;
    }
    if (prop.type === 'checkbox') {
      e.preventDefault();
      onCommit({ type: 'checkbox', value: !(value.type === 'checkbox' ? value.value : false) });
      return;
    }
    setEditing(true);
  }

  // ── Lightbox ───────────────────────────────────────────────────────────────
  const lightbox = lightboxIdx !== null && files.length > 0 ? createPortal(
    <div onClick={() => setLightboxIdx(null)}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={() => setLightboxIdx(null)}
        style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} />
      </button>
      {files.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx - 1 + files.length) % files.length); }}
            style={{ position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={22} />
          </button>
          <button onClick={e => { e.stopPropagation(); setLightboxIdx((lightboxIdx + 1) % files.length); }}
            style={{ position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={22} />
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={files[lightboxIdx].url} alt="" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6, boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }} />
    </div>,
    document.body
  ) : null;

  // ── Display mode ───────────────────────────────────────────────────────────
  if (!editing && !popRect) {
    return (
      <>
        {lightbox}
        <div ref={containerRef} onClick={startEdit}
          style={{
            width: '100%', minHeight: 22,
            cursor: readOnly ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          <DisplayValue value={value} onImageClick={prop.type === 'files' ? (i) => setLightboxIdx(i) : undefined} />
        </div>
      </>
    );
  }

  // ── Popover (date range) ───────────────────────────────────────────────────
  if (popRect && prop.type === 'date') {
    return (
      <>
        <div ref={containerRef} style={{ width: '100%', minHeight: 22, display: 'flex', alignItems: 'center' }}>
          <DisplayValue value={value} />
        </div>
        {createPortal(
          <DateRangePopover
            anchorRect={popRect}
            initStart={value.type === 'date' ? (value.start?.split('T')[0] ?? '') : ''}
            initEnd={value.type === 'date' ? (value.end?.split('T')[0] ?? '') : ''}
            onCommit={(s, e) => {
              onCommit({ type: 'date', start: s || null, end: e || null, hasTime: false });
              setPopRect(null);
            }}
            onClose={() => setPopRect(null)}
          />,
          document.body
        )}
      </>
    );
  }

  // ── Popover (select/multi/status) ──────────────────────────────────────────
  if (popRect && (prop.type === 'select' || prop.type === 'multi_select' || prop.type === 'status')) {
    const opts = prop.options ?? [];
    const selected =
      prop.type === 'multi_select' && value.type === 'multi_select' ? value.options.map(o => o.name)
      : prop.type === 'select' && value.type === 'select' ? (value.option ? [value.option.name] : [])
      : prop.type === 'status' && value.type === 'status' ? (value.option ? [value.option.name] : [])
      : [];

    function toggle(name: string) {
      const found: SelectOption | undefined = opts.find(o => o.name === name) ?? { name, color: 'default' };
      if (prop.type === 'multi_select') {
        const cur = (value.type === 'multi_select' ? value.options : []) as SelectOption[];
        const exists = cur.some(o => o.name === name);
        const next = exists ? cur.filter(o => o.name !== name) : [...cur, found];
        onCommit({ type: 'multi_select', options: next });
      } else if (prop.type === 'select') {
        onCommit({ type: 'select', option: found });
      } else if (prop.type === 'status') {
        onCommit({ type: 'status', option: found });
      }
    }

    function clear() {
      if (prop.type === 'select') onCommit({ type: 'select', option: null });
      else if (prop.type === 'status') onCommit({ type: 'status', option: null });
    }

    return (
      <>
        <div ref={containerRef} style={{ width: '100%', minHeight: 22, display: 'flex', alignItems: 'center' }}>
          <DisplayValue value={value} />
        </div>
        {createPortal(
          <OptionPopover
            anchorRect={popRect}
            options={opts}
            selected={selected}
            multi={prop.type === 'multi_select'}
            allowCreate={prop.type !== 'status'}
            onToggle={toggle}
            onClear={prop.type !== 'multi_select' ? clear : undefined}
            onClose={() => setPopRect(null)}
          />,
          document.body
        )}
      </>
    );
  }

  // ── Inline editor ──────────────────────────────────────────────────────────
  return (
    <InlineEditor
      prop={prop}
      value={value}
      autoFocus={autoFocus !== false}
      onCommit={(next) => { onCommit(next); setEditing(false); }}
      onCancel={() => setEditing(false)}
      onUploadFile={onUploadFile}
      onDeleteFile={onDeleteFile}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only display (used inside cells and detail views)
// ─────────────────────────────────────────────────────────────────────────────
function DisplayValue({ value, onImageClick }: { value: NotionPropValue; onImageClick?: (idx: number) => void }) {
  switch (value.type) {
    case 'title':
      return value.text
        ? <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%' }}>{value.text}</span>
        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Untitled</span>;
    case 'rich_text':
      return <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%' }}>{value.text}</span>;
    case 'number':
      if (value.value === null) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>;
      return <span className="tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{value.value}</span>;
    case 'select':
      return value.option
        ? <Tag name={value.option.name} color={value.option.color} />
        : null;
    case 'multi_select':
      if (!value.options.length) return null;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, width: '100%' }}>
          {value.options.map(o => <Tag key={o.id ?? o.name} name={o.name} color={o.color} />)}
        </div>
      );
    case 'status':
      return value.option
        ? <Tag name={value.option.name} color={value.option.color} />
        : null;
    case 'date': {
      if (!value.start) return null;
      const d = formatDate(value.start);
      const e = value.end ? ' → ' + formatDate(value.end) : '';
      return <span style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{d}{e}</span>;
    }
    case 'url':
      return value.value ? <UrlLink url={value.value} /> : null;
    case 'email':
      return value.value ? <a href={`mailto:${value.value}`} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none' }}>{value.value}</a> : null;
    case 'phone_number':
      return value.value ? <a href={`tel:${value.value}`} onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value.value}</a> : null;
    case 'checkbox':
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: 3,
          background: value.value ? 'var(--blue)' : 'transparent',
          border: `1.5px solid ${value.value ? 'var(--blue)' : 'var(--border-hover)'}`,
        }}>
          {value.value && <Check size={11} color="white" strokeWidth={3} />}
        </span>
      );
    case 'files':
      if (!value.files.length) return null;
      return (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {value.files.slice(0, 3).map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={f.url} alt="" onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(i); } : undefined}
              style={{ width: 28, height: 22, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--border-color)', cursor: onImageClick ? 'zoom-in' : 'default' }} />
          ))}
          {value.files.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{value.files.length - 3}</span>}
        </div>
      );
    case 'people':
      if (!value.people.length) return null;
      return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {value.people.slice(0, 3).map(p => (
            <span key={p.id} title={p.name} style={{
              width: 20, height: 20, borderRadius: '50%', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-surface)', fontSize: 10, color: 'var(--text-secondary)',
              backgroundImage: p.avatar_url ? `url(${p.avatar_url})` : undefined,
              backgroundSize: 'cover',
            }}>
              {!p.avatar_url && (p.name ?? '?').slice(0, 1)}
            </span>
          ))}
        </div>
      );
    case 'relation':
      if (!value.ids.length) return null;
      return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{value.ids.length} link{value.ids.length === 1 ? '' : 's'}</span>;
    case 'formula':
    case 'rollup':
      return value.display ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value.display}</span> : null;
    case 'created_time':
    case 'last_edited_time':
      return value.value ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(value.value)}</span> : null;
    case 'created_by':
    case 'last_edited_by':
      return value.user ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{value.user.name ?? '—'}</span> : null;
    case 'unique_id':
      if (value.number === null) return null;
      return <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{value.prefix ? `${value.prefix}-` : ''}{value.number}</span>;
    case 'unsupported':
    default:
      return null;
  }
}

function Tag({ name, color }: { name: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 500, lineHeight: '18px',
      background: tagBg(color), color: tagFg(color),
      whiteSpace: 'nowrap',
    }}>{name}</span>
  );
}

function UrlLink({ url }: { url: string }) {
  let display = url;
  try { display = new URL(url).hostname.replace('www.', ''); } catch {}
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--blue)', fontSize: 11, textDecoration: 'none', maxWidth: '100%' }}>
      <ExternalLink size={10} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</span>
    </a>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const onlyDate = iso.split('T')[0];
  const [y, m, d] = onlyDate.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m-1]} ${d}, ${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline editors (simple text-like fields)
// ─────────────────────────────────────────────────────────────────────────────
interface InlineProps {
  prop: NotionPropDef;
  value: NotionPropValue;
  autoFocus: boolean;
  onCommit: (v: NotionPropValue) => void;
  onCancel: () => void;
  onUploadFile?: (file: File) => Promise<void>;
  onDeleteFile?: (index: number) => Promise<void>;
}

function InlineEditor({ prop, value, autoFocus, onCommit, onCancel, onUploadFile, onDeleteFile }: InlineProps) {
  const inputBase: React.CSSProperties = {
    background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 13, width: '100%', fontFamily: 'inherit', padding: 0,
  };

  if (prop.type === 'title') {
    const init = value.type === 'title' ? value.text : '';
    return (
      <TextareaInput
        autoFocus={autoFocus}
        initial={init}
        style={{ ...inputBase, fontWeight: 500 }}
        onCommit={text => onCommit({ type: 'title', text })}
        onCancel={onCancel}
      />
    );
  }
  if (prop.type === 'rich_text') {
    const init = value.type === 'rich_text' ? value.text : '';
    return (
      <TextareaInput
        autoFocus={autoFocus}
        initial={init}
        style={inputBase}
        onCommit={text => onCommit({ type: 'rich_text', text })}
        onCancel={onCancel}
      />
    );
  }
  if (prop.type === 'number') {
    const init = value.type === 'number' && value.value !== null ? String(value.value) : '';
    return (
      <TextInput
        autoFocus={autoFocus}
        initial={init}
        type="number"
        style={{ ...inputBase, textAlign: 'right' }}
        onCommit={text => {
          const n = text === '' ? null : Number(text);
          onCommit({ type: 'number', value: Number.isFinite(n) ? (n as number) : null });
        }}
        onCancel={onCancel}
      />
    );
  }
  if (prop.type === 'date') {
    const init = value.type === 'date' ? (value.start ?? '') : '';
    const onlyDate = init.split('T')[0];
    return (
      <input
        type="date"
        autoFocus={autoFocus}
        defaultValue={onlyDate}
        onClick={e => e.stopPropagation()}
        onBlur={e => onCommit({ type: 'date', start: e.target.value || null, end: null, hasTime: false })}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') onCancel();
        }}
        style={{ ...inputBase, colorScheme: 'dark' }}
      />
    );
  }
  if (prop.type === 'url' || prop.type === 'email' || prop.type === 'phone_number') {
    const tmap = { url: 'url', email: 'email', phone_number: 'phone_number' } as const;
    const k = tmap[prop.type];
    const init =
      (value.type === 'url' || value.type === 'email' || value.type === 'phone_number')
        ? (value.value ?? '')
        : '';
    const placeholder = prop.type === 'url' ? 'https://…' : prop.type === 'email' ? 'name@…' : '+1…';
    return (
      <TextInput
        autoFocus={autoFocus}
        initial={init}
        placeholder={placeholder}
        style={{ ...inputBase, color: prop.type === 'url' ? 'var(--blue)' : 'var(--text-primary)', fontSize: 12 }}
        onCommit={text => {
          const v = text.trim() || null;
          if (k === 'url') onCommit({ type: 'url', value: v });
          else if (k === 'email') onCommit({ type: 'email', value: v });
          else onCommit({ type: 'phone_number', value: v });
        }}
        onCancel={onCancel}
      />
    );
  }
  if (prop.type === 'files') {
    return <FileUploader value={value.type === 'files' ? value.files : []} onUploadFile={onUploadFile} onDeleteFile={onDeleteFile} onClose={onCancel} />;
  }

  // Anything else falls back to display.
  return <DisplayValue value={value} />;
}

function DateRangePopover({
  anchorRect, initStart, initEnd, onCommit, onClose,
}: {
  anchorRect: DOMRect;
  initStart: string;
  initEnd: string;
  onCommit: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(initStart);
  const [end, setEnd] = useState(initEnd);
  const [hasEnd, setHasEnd] = useState(!!initEnd);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = initStart || toISO(new Date());
    const [y, m] = base.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const popRef = useRef<HTMLDivElement>(null);

  const popWidth = 268;
  const estHeight = hasEnd ? 380 : 348;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const spaceBelow = vh - anchorRect.bottom - 8;
  const top = spaceBelow > estHeight ? anchorRect.bottom + 6 : Math.max(8, anchorRect.top - 6 - estHeight);
  const left = Math.min(anchorRect.left, vw - popWidth - 12);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onCommit(start, hasEnd ? end : '');
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [start, end, hasEnd, onCommit, onClose]);

  const todayISO = toISO(new Date());
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function pickDay(iso: string) {
    if (!hasEnd) { setStart(iso); onCommit(iso, ''); return; }
    // range mode
    if (!start || (start && end)) { setStart(iso); setEnd(''); return; }
    if (iso < start) { setStart(iso); return; }
    setEnd(iso); onCommit(start, iso);
  }

  // Build the 6×7 grid for the displayed month.
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: { iso: string; inMonth: boolean; day: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - firstWeekday + i);
    cells.push({ iso: toISO(d), inMonth: d.getMonth() === month, day: d.getDate() });
  }

  function navBtnStyle(): React.CSSProperties {
    return {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
      background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    };
  }

  return (
    <div
      ref={popRef}
      data-popover
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top, left, zIndex: 9999, width: popWidth,
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        padding: '12px 12px 10px',
      }}
    >
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          style={navBtnStyle()}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label="Previous month"
        ><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {months[month]} {year}
        </div>
        <button
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          style={navBtnStyle()}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          aria-label="Next month"
        ><ChevronRight size={16} /></button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {weekdays.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{w}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(c => {
          const isStart = !!start && c.iso === start;
          const isEnd = !!end && c.iso === end;
          const inRange = hasEnd && !!start && !!end && c.iso > start && c.iso < end;
          const isToday = c.iso === todayISO;
          const selected = isStart || isEnd;
          return (
            <button
              key={c.iso}
              onClick={() => pickDay(c.iso)}
              style={{
                position: 'relative', height: 30, border: 'none', cursor: 'pointer',
                borderRadius: 6, fontSize: 12.5,
                fontWeight: selected ? 600 : (isToday ? 600 : 400),
                background: selected ? 'var(--blue)' : (inRange ? 'color-mix(in srgb, var(--blue) 22%, transparent)' : 'transparent'),
                color: selected ? '#fff'
                  : c.inMonth ? (isToday ? 'var(--blue)' : 'var(--text-primary)')
                  : 'var(--text-muted)',
                opacity: c.inMonth ? 1 : 0.45,
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.background = inRange ? 'color-mix(in srgb, var(--blue) 30%, transparent)' : 'var(--bg-surface)'; }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.background = inRange ? 'color-mix(in srgb, var(--blue) 22%, transparent)' : 'transparent'; }}
            >
              {c.day}
            </button>
          );
        })}
      </div>

      {/* Selected summary */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, minHeight: 16 }}>
        {start ? formatDate(start) : <span style={{ color: 'var(--text-muted)' }}>No date selected</span>}
        {hasEnd && end ? ` → ${formatDate(end)}` : ''}
      </div>

      {/* End date toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8, userSelect: 'none' }}>
        <div
          onClick={() => { setHasEnd(h => !h); if (hasEnd) setEnd(''); }}
          style={{
            width: 28, height: 16, borderRadius: 8, flexShrink: 0,
            background: hasEnd ? 'var(--blue)' : 'var(--border-hover)',
            position: 'relative', cursor: 'pointer', transition: 'background 150ms',
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: hasEnd ? 14 : 2,
            width: 12, height: 12, borderRadius: '50%',
            background: 'white', transition: 'left 150ms', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>End date</span>
      </label>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 2 }}>
        {(start || end) ? (
          <button
            onClick={() => { setStart(''); setEnd(''); setHasEnd(false); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
          >Clear</button>
        ) : <span />}
        <button
          onClick={() => onCommit(start, hasEnd ? end : '')}
          style={{
            background: 'var(--blue)', border: 'none', color: 'white',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            padding: '5px 14px', borderRadius: 6,
          }}
        >Apply</button>
      </div>
    </div>
  );
}

function toISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function TextareaInput({
  initial, autoFocus, style, onCommit, onCancel,
}: {
  initial: string;
  autoFocus: boolean;
  style: React.CSSProperties;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [val]);

  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      value={val}
      rows={1}
      onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={() => onCommit(val)}
      onKeyDown={e => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{ ...style, resize: 'none', overflow: 'hidden', lineHeight: '1.5', display: 'block' }}
    />
  );
}

function TextInput({
  initial, autoFocus, type = 'text', placeholder, style, onCommit, onCancel,
}: {
  initial: string;
  autoFocus: boolean;
  type?: string;
  placeholder?: string;
  style: React.CSSProperties;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <input
      type={type}
      autoFocus={autoFocus}
      value={val}
      placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={() => onCommit(val)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') onCancel();
      }}
      style={style}
    />
  );
}

function FileUploader({
  value, onUploadFile, onDeleteFile, onClose,
}: {
  value: FileRef[];
  onUploadFile?: (file: File) => Promise<void>;
  onDeleteFile?: (index: number) => Promise<void>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);

  async function handleFile(f: File | null | undefined) {
    if (!f || !onUploadFile) return;
    setUploading(true);
    try { await onUploadFile(f); }
    finally { setUploading(false); onClose(); }
  }

  async function handleDelete(i: number) {
    if (!onDeleteFile || deletingIdx !== null) return;
    setDeletingIdx(i);
    try { await onDeleteFile(i); }
    catch { /* parent surfaces errors */ }
    finally { setDeletingIdx(null); }
  }

  // Paste image from clipboard
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find(it => it.type.startsWith('image/'));
      if (imgItem) {
        e.preventDefault();
        handleFile(imgItem.getAsFile());
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUploadFile]);

  // Close (reset to display mode) when clicking outside this cell.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {value.map((f, i) => (
            <div key={i} style={{ position: 'relative', width: 40, height: 30 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt=""
                style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--border-color)', opacity: deletingIdx === i ? 0.4 : 1 }} />
              {onDeleteFile && (
                <button onClick={() => handleDelete(i)} disabled={deletingIdx !== null}
                  title="Delete image"
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 16, height: 16, padding: 0, borderRadius: '50%',
                    border: '1px solid var(--border-color)', background: 'var(--red)', color: '#fff',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                ><X size={10} strokeWidth={3} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => inputRef.current?.click()} disabled={uploading || !onUploadFile}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
          }}
        >
          <Plus size={11} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {value.length > 0 ? `${value.length} file${value.length === 1 ? '' : 's'}` : 'Ctrl+V to paste'}
        </span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}
