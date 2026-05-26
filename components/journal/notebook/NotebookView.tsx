'use client';

import { useEffect, useMemo, useState } from 'react';
import type { NotionPage, NotionDbSchema } from '@/lib/notion-page';
import { Sun, Moon, Menu } from 'lucide-react';
import {
  type NotebookConfig, DEFAULT_CONFIG,
  getNotebookConfig, saveNotebookConfig, getPalette,
} from './notebookConfig';
import { NotebookSetup } from './NotebookSetup';
import { NotebookSidebar } from './NotebookSidebar';
import { NotebookEntry } from './NotebookEntry';

interface Props {
  pages: NotionPage[];
  schema: NotionDbSchema;
  dbId: string;
}

function sortPagesByDate(pages: NotionPage[], schema: NotionDbSchema): NotionPage[] {
  const dateProp = schema.properties.find(p => p.type === 'date');
  if (!dateProp) return pages;
  const dateName = dateProp.name;
  const dated: NotionPage[] = [];
  const undated: NotionPage[] = [];
  for (const p of pages) {
    const v = p.properties[dateName];
    if (v && v.type === 'date' && v.start) dated.push(p);
    else undated.push(p);
  }
  dated.sort((a, b) => {
    const va = a.properties[dateName];
    const vb = b.properties[dateName];
    const sa = va && va.type === 'date' ? (va.start ?? '') : '';
    const sb = vb && vb.type === 'date' ? (vb.start ?? '') : '';
    return sb.localeCompare(sa);
  });
  return [...dated, ...undated];
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export function NotebookView({ pages, schema, dbId }: Props) {
  const [config, setConfig] = useState<NotebookConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSetup, setEditingSetup] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!dbId) return;
    const cfg = getNotebookConfig(dbId) ?? { ...DEFAULT_CONFIG };
    setConfig(cfg);
    setLoaded(true);
  }, [dbId]);

  const sortedPages = useMemo(() => sortPagesByDate(pages, schema), [pages, schema]);

  useEffect(() => {
    if (!sortedPages.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !sortedPages.some(p => p.id === selectedId)) {
      setSelectedId(sortedPages[0].id);
    }
  }, [sortedPages, selectedId]);

  if (!loaded || !config) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        …
      </div>
    );
  }

  const palette = getPalette(config.theme);
  const showSetup = !config.setupComplete || editingSetup;

  if (showSetup) {
    return (
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <NotebookSetup
          allFields={schema.properties}
          initialOrder={config.columnOrder}
          palette={palette}
          onCancel={editingSetup && config.setupComplete ? () => setEditingSetup(false) : undefined}
          onSave={(columnOrder) => {
            const next: NotebookConfig = { ...config, columnOrder, setupComplete: true };
            setConfig(next);
            saveNotebookConfig(dbId, next);
            setEditingSetup(false);
          }}
        />
      </div>
    );
  }

  const selectedPage = sortedPages.find(p => p.id === selectedId) ?? null;

  function updateConfig(patch: Partial<NotebookConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    saveNotebookConfig(dbId, next);
  }

  const toggleTheme = () => updateConfig({ theme: config.theme === 'light' ? 'dark' : 'light' });

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (isMobile) setDrawerOpen(false);
  };

  const sidebarMobileStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    top: 0, bottom: 0, left: 0,
    width: 'min(86vw, 320px)',
    zIndex: 1100,
    transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 220ms ease',
    boxShadow: drawerOpen ? '0 12px 40px rgba(0,0,0,0.4)' : 'none',
  } : {};

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, background: palette.bg, position: 'relative' }}>
      <div style={sidebarMobileStyle}>
        <NotebookSidebar
          pages={sortedPages}
          schema={schema}
          palette={palette}
          selectedId={selectedId}
          onSelect={handleSelect}
          textScale={config.textScale}
          imageScale={config.imageScale}
          onTextScale={(v) => updateConfig({ textScale: v })}
          onImageScale={(v) => updateConfig({ imageScale: v })}
          onOpenSetup={() => setEditingSetup(true)}
          isMobile={isMobile}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      </div>

      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
        />
      )}

      <div style={{ flex: 1, overflow: 'auto', position: 'relative', width: '100%' }}>
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(true)}
            title="Entries"
            style={{
              position: 'absolute', top: 12, left: 12, zIndex: 10,
              width: 34, height: 34, borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: palette.controlBg,
              border: `1px solid ${palette.border}`,
              color: palette.textSecondary,
              cursor: 'pointer',
            }}
          >
            <Menu size={16} />
          </button>
        )}

        <button
          onClick={toggleTheme}
          title={config.theme === 'light' ? 'Switch to dark' : 'Switch to white'}
          style={{
            position: 'absolute',
            top: isMobile ? 12 : 16,
            right: isMobile ? 12 : 20,
            zIndex: 10,
            width: isMobile ? 34 : 30, height: isMobile ? 34 : 30, borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: palette.controlBg,
            border: `1px solid ${palette.border}`,
            color: palette.textSecondary,
            cursor: 'pointer',
            boxShadow: config.theme === 'light' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}
        >
          {config.theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>

        {selectedPage ? (
          <div style={{
            maxWidth: 820,
            margin: '0 auto',
            padding: isMobile ? '58px 14px 24px' : '48px 56px',
          }}>
            <NotebookEntry
              page={selectedPage}
              schema={schema}
              palette={palette}
              columnOrder={config.columnOrder}
              textScale={config.textScale}
              imageScale={config.imageScale}
            />
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.textMuted, fontSize: 13 }}>
            —
          </div>
        )}
      </div>
    </div>
  );
}
