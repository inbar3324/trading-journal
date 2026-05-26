'use client';

import { useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import type { NotionPropDef } from '@/lib/notion-page';
import type { NotebookPalette } from './notebookConfig';

interface Props {
  allFields: NotionPropDef[];
  initialOrder: string[];
  palette: NotebookPalette;
  onSave: (columnOrder: string[]) => void;
  onCancel?: () => void;
}

export function NotebookSetup({ allFields, initialOrder, palette, onSave, onCancel }: Props) {
  const validInitial = initialOrder.filter(name => allFields.some(f => f.name === name));
  const [shown, setShown] = useState<string[]>(validInitial);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function toggleField(name: string) {
    setShown(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    setShown(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', padding: 32,
      background: palette.bg,
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
        flex: 1, maxWidth: 880, margin: '0 auto', width: '100%',
      }}>
        {/* Available */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: palette.cardBg, borderRadius: 8,
          border: `1px solid ${palette.border}`, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${palette.border}`,
            fontSize: 11, fontWeight: 600, color: palette.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Available
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {allFields.map(f => {
              const checked = shown.includes(f.name);
              return (
                <label key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: `1px solid ${palette.border}`,
                  fontSize: 13, color: palette.textPrimary,
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleField(f.name)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1 }}>{f.name}</span>
                  <span style={{ fontSize: 10, color: palette.textMuted }}>{f.type}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Shown — drag to reorder */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: palette.cardBg, borderRadius: 8,
          border: `1px solid ${palette.border}`, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${palette.border}`,
            fontSize: 11, fontWeight: 600, color: palette.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Shown</span>
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>drag ↕</span>
          </div>
          <div style={{ overflow: 'auto', flex: 1 }}>
            {shown.length === 0 ? (
              <div style={{ padding: 24, fontSize: 12, color: palette.textMuted, textAlign: 'center' }}>
                ←  select from left
              </div>
            ) : shown.map((name, idx) => (
              <div
                key={name}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px',
                  borderBottom: `1px solid ${palette.border}`,
                  fontSize: 13, color: palette.textPrimary,
                  cursor: 'grab',
                  opacity: dragIdx === idx ? 0.4 : 1,
                  background: dragOverIdx === idx && dragIdx !== idx ? palette.accentBg : 'transparent',
                  borderTop: dragOverIdx === idx && dragIdx !== null && dragIdx > idx ? '2px solid var(--blue)' : '2px solid transparent',
                }}
              >
                <GripVertical size={14} style={{ color: palette.textMuted }} />
                <span style={{ flex: 1 }}>{name}</span>
                <button
                  onClick={() => toggleField(name)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: palette.textMuted, cursor: 'pointer',
                    padding: 2, display: 'flex',
                  }}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        marginTop: 20, maxWidth: 880, marginInline: 'auto', width: '100%',
      }}>
        {onCancel && (
          <button onClick={onCancel}
            style={{
              padding: '8px 16px', fontSize: 13,
              background: 'transparent', color: palette.textSecondary,
              border: `1px solid ${palette.border}`, borderRadius: 5, cursor: 'pointer',
            }}>
            Cancel
          </button>
        )}
        <button
          onClick={() => onSave(shown)}
          disabled={shown.length === 0}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 500,
            background: shown.length === 0 ? palette.cardBg : 'var(--blue)',
            color: shown.length === 0 ? palette.textMuted : 'white',
            border: 'none', borderRadius: 5,
            cursor: shown.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
