'use client';

import { useEffect, useRef } from 'react';
import { Type, Hash, Link2, Circle, Tag, Calendar, CheckSquare, Image } from 'lucide-react';
import type { WColType } from '@/lib/weekly-types';

const TYPE_OPTIONS: { type: WColType; icon: React.ElementType; label: string }[] = [
  { type: 'text', icon: Type, label: 'Text' },
  { type: 'number', icon: Hash, label: 'Number' },
  { type: 'url', icon: Link2, label: 'URL' },
  { type: 'select', icon: Circle, label: 'Select' },
  { type: 'multi_select', icon: Tag, label: 'Multi-select' },
  { type: 'date', icon: Calendar, label: 'Date' },
  { type: 'checkbox', icon: CheckSquare, label: 'Checkbox' },
  { type: 'files', icon: Image, label: 'Photo' },
];

interface Props {
  current: WColType;
  anchorRect: DOMRect;
  onSelect: (type: WColType) => void;
  onClose: () => void;
}

export function TypeSelector({ current, anchorRect, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 280);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top,
        left: anchorRect.left,
        zIndex: 9000,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 10,
        padding: 8,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 4,
        minWidth: 220,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          gridColumn: '1 / -1',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          padding: '2px 4px 6px',
        }}
      >
        Column type
      </div>
      {TYPE_OPTIONS.map(({ type, icon: Icon, label }) => {
        const active = type === current;
        return (
          <button
            key={type}
            onClick={() => onSelect(type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 7,
              border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              cursor: 'pointer',
              background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
              color: active ? 'var(--blue)' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              textAlign: 'left',
              width: '100%',
              transition: 'background 100ms, color 100ms',
            }}
            onMouseEnter={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={e => {
              if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <Icon size={13} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
