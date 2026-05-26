'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { NotionPage, NotionDbSchema, FileRef } from '@/lib/notion-page';
import { NotebookDisplay, isEmpty } from './NotebookDisplay';
import type { NotebookPalette } from './notebookConfig';

interface Props {
  page: NotionPage;
  schema: NotionDbSchema;
  palette: NotebookPalette;
  columnOrder: string[];
  textScale: number;
  imageScale: number;
}

export function NotebookEntry({ page, schema, palette, columnOrder, textScale, imageScale }: Props) {
  const [lightbox, setLightbox] = useState<{ files: FileRef[]; idx: number } | null>(null);

  const sections = columnOrder
    .map(name => {
      const prop = schema.properties.find(p => p.name === name);
      if (!prop) return null;
      const value = page.properties[name];
      if (!value) return null;
      if (isEmpty(value)) return null;
      return { prop, value };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <article style={{ marginBottom: 48 }}>
      {sections.map(({ prop, value }) => (
        <section key={prop.id} style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 11 * textScale,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: palette.textMuted,
            marginBottom: 10,
          }}>
            {prop.name}
          </div>
          <div>
            <NotebookDisplay
              value={value}
              palette={palette}
              textScale={textScale}
              imageScale={imageScale}
              onImageClick={value.type === 'files' ? (i) => setLightbox({ files: value.files, idx: i }) : undefined}
            />
          </div>
        </section>
      ))}

      {lightbox && createPortal(
        <Lightbox files={lightbox.files} idx={lightbox.idx} onClose={() => setLightbox(null)}
          onIdx={(i) => setLightbox({ files: lightbox.files, idx: i })} />,
        document.body
      )}
    </article>
  );
}

function Lightbox({ files, idx, onClose, onIdx }: {
  files: FileRef[]; idx: number; onClose: () => void; onIdx: (i: number) => void;
}) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose}
        style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} />
      </button>
      {files.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onIdx((idx - 1 + files.length) % files.length); }}
            style={{ position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={22} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onIdx((idx + 1) % files.length); }}
            style={{ position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={22} />
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={files[idx].url} alt="" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6, boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }} />
    </div>
  );
}
