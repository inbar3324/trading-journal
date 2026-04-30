'use client';

import { useState, useEffect } from 'react';
import { getNotionConfig, clearNotionConfig, type NotionConfig } from '@/lib/notion-config';
import NotionSetup from '@/components/ui/NotionSetup';

interface Props {
  children: React.ReactNode;
}

export default function NotionConfigProvider({ children }: Props) {
  const [config, setConfig] = useState<NotionConfig | null | 'loading'>('loading');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      clearNotionConfig();
      window.history.replaceState({}, '', window.location.pathname);
      setConfig(null);
      return;
    }
    setConfig(getNotionConfig());
  }, []);

  if (config === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-hover)', borderTopColor: 'var(--blue)' }}
        />
      </div>
    );
  }

  if (!config) {
    return <NotionSetup onSave={(cfg) => setConfig(cfg)} />;
  }

  return <>{children}</>;
}
