'use client';

import { Settings, Image as ImageIcon, X } from 'lucide-react';
import type { NotionPage, NotionDbSchema } from '@/lib/notion-page';
import { TEXT_SCALES, IMAGE_SCALES, stepScale, type NotebookPalette } from './notebookConfig';

interface Props {
  pages: NotionPage[];
  schema: NotionDbSchema;
  palette: NotebookPalette;
  selectedId: string | null;
  onSelect: (id: string) => void;
  textScale: number;
  imageScale: number;
  onTextScale: (next: number) => void;
  onImageScale: (next: number) => void;
  onOpenSetup: () => void;
  isMobile?: boolean;
  onCloseDrawer?: () => void;
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const onlyDate = iso.split('T')[0];
  const [y, m, d] = onlyDate.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m-1]} ${d}, ${y}`;
}

function entryLabel(page: NotionPage, schema: NotionDbSchema): { primary: string; secondary: string } {
  const titleProp = schema.properties.find(p => p.type === 'title');
  const dateProp = schema.properties.find(p => p.type === 'date');

  let primary = '';
  if (titleProp) {
    const v = page.properties[titleProp.name];
    if (v && v.type === 'title' && v.text) primary = v.text;
  }

  // Fallback: first rich_text column with content
  if (!primary) {
    const firstText = schema.properties.find(p => p.type === 'rich_text');
    if (firstText) {
      const v = page.properties[firstText.name];
      if (v && v.type === 'rich_text' && v.text) primary = v.text;
    }
  }

  let secondary = '';
  if (dateProp) {
    const v = page.properties[dateProp.name];
    if (v && v.type === 'date' && v.start) secondary = formatDateShort(v.start);
  }

  if (!primary) primary = secondary || '—';

  return { primary, secondary: secondary && secondary !== primary ? secondary : '' };
}

export function NotebookSidebar({
  pages, schema, palette, selectedId, onSelect,
  textScale, imageScale, onTextScale, onImageScale, onOpenSetup,
  isMobile, onCloseDrawer,
}: Props) {
  const btn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 4,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: palette.controlBg, border: `1px solid ${palette.border}`,
    color: palette.textSecondary, cursor: 'pointer',
    fontSize: 11, fontWeight: 600,
  };
  const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.4, cursor: 'not-allowed' };

  const textAtMin = textScale <= TEXT_SCALES[0];
  const textAtMax = textScale >= TEXT_SCALES[TEXT_SCALES.length - 1];
  const imgAtMin = imageScale <= IMAGE_SCALES[0];
  const imgAtMax = imageScale >= IMAGE_SCALES[IMAGE_SCALES.length - 1];

  return (
    <div style={{
      width: isMobile ? '100%' : 280,
      height: isMobile ? '100%' : undefined,
      flexShrink: 0,
      borderRight: isMobile ? 'none' : `1px solid ${palette.border}`,
      background: palette.sidebarBg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Controls */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${palette.border}`,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <button onClick={onOpenSetup} title="Configure fields"
          style={btn}>
          <Settings size={13} />
        </button>

        {isMobile && onCloseDrawer && (
          <button onClick={onCloseDrawer} title="Close" style={{ ...btn, marginLeft: 'auto' }}>
            <X size={13} />
          </button>
        )}

        <div style={{ display: 'inline-flex', gap: 0, marginLeft: 4 }}>
          <button onClick={() => onTextScale(stepScale(textScale, TEXT_SCALES, -1))}
            disabled={textAtMin} title="Smaller text"
            style={textAtMin ? btnDisabled : btn}>A−</button>
          <button onClick={() => onTextScale(stepScale(textScale, TEXT_SCALES, 1))}
            disabled={textAtMax} title="Larger text"
            style={{ ...(textAtMax ? btnDisabled : btn), marginLeft: -1 }}>A+</button>
        </div>

        <div style={{ display: 'inline-flex', gap: 0 }}>
          <button onClick={() => onImageScale(stepScale(imageScale, IMAGE_SCALES, -1))}
            disabled={imgAtMin} title="Smaller images"
            style={{ ...(imgAtMin ? btnDisabled : btn), gap: 2 }}>
            <ImageIcon size={11} />−
          </button>
          <button onClick={() => onImageScale(stepScale(imageScale, IMAGE_SCALES, 1))}
            disabled={imgAtMax} title="Larger images"
            style={{ ...(imgAtMax ? btnDisabled : btn), marginLeft: -1, gap: 2 }}>
            <ImageIcon size={11} />+
          </button>
        </div>
      </div>

      {/* Entry list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {pages.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: palette.textMuted }}>—</div>
        ) : pages.map(page => {
          const { primary, secondary } = entryLabel(page, schema);
          const active = page.id === selectedId;
          return (
            <button
              key={page.id}
              onClick={() => onSelect(page.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px',
                background: active ? palette.cardBg : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${palette.border}`,
                borderLeft: active ? '2px solid var(--blue)' : '2px solid transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = palette.accentBg; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                fontSize: 13, fontWeight: active ? 600 : 500,
                color: palette.textPrimary,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {primary}
              </div>
              {secondary && (
                <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 2 }}>
                  {secondary}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
