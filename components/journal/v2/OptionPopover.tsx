'use client';

import { useEffect, useRef, useState } from 'react';
import type { SelectOption } from '@/lib/notion-page';
import { tagBg, tagFg } from './colors';

interface Props {
  anchorRect: DOMRect;
  options: SelectOption[];
  selected: string[]; // names
  multi: boolean;
  allowCreate?: boolean;
  onToggle: (name: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export function OptionPopover({ anchorRect, options, selected, multi, allowCreate, onToggle, onClear, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    function clickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    setTimeout(() => document.addEventListener('mousedown', clickOut), 0);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', clickOut);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const minWidth = Math.max(anchorRect.width, 240);
  const MAX_H = 320;
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
  const spaceAbove = anchorRect.top - 8;
  const showAbove = spaceBelow < MAX_H && spaceAbove > spaceBelow;
  const maxHeight = showAbove ? Math.min(MAX_H, spaceAbove) : Math.min(MAX_H, spaceBelow);
  const top = showAbove ? anchorRect.top - Math.min(maxHeight, spaceAbove) - 4 : anchorRect.bottom + 4;
  const left = Math.min(anchorRect.left, window.innerWidth - minWidth - 16);
  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  const exactExists = options.some(o => o.name.toLowerCase() === search.toLowerCase());

  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{
      position: 'fixed', top, left, minWidth, maxHeight, zIndex: 1000,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
      borderRadius: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: 6, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 4 }}>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && allowCreate && search.trim() && !exactExists) {
              onToggle(search.trim());
              setSearch('');
              if (!multi) onClose();
            }
          }}
          placeholder={multi ? 'Search or create...' : 'Search...'}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', padding: '2px 4px' }}
        />
        {!multi && selected.length > 0 && onClear && (
          <button onClick={() => { onClear(); onClose(); }}
            style={{ fontSize: 10, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>
      <div style={{ overflow: 'auto', padding: 4 }}>
        {filtered.length === 0 && !allowCreate && (
          <div style={{ padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>No matching options</div>
        )}
        {filtered.map(opt => {
          const checked = selected.includes(opt.name);
          return (
            <div key={opt.id ?? opt.name} onClick={() => {
              onToggle(opt.name);
              if (!multi) onClose();
            }}
              style={{
                padding: '5px 6px', cursor: 'pointer', borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 6,
                background: checked ? 'rgba(59,130,246,0.12)' : 'transparent',
              }}
              onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 500,
                background: tagBg(opt.color), color: tagFg(opt.color),
              }}>{opt.name}</span>
              {checked && <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontSize: 12 }}>✓</span>}
            </div>
          );
        })}
        {allowCreate && search.trim() && !exactExists && (
          <div onClick={() => { onToggle(search.trim()); setSearch(''); if (!multi) onClose(); }}
            style={{
              padding: '5px 6px', cursor: 'pointer', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 11,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Create &quot;{search.trim()}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
