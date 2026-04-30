'use client';

import { useState } from 'react';
import { TrendingUp, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { saveNotionConfig, type NotionConfig } from '@/lib/notion-config';

const DEFAULT_DB_ID = '2e08160b-8d3f-81ec-87ce-000b07c34e0e';

interface Props {
  onSave: (cfg: NotionConfig) => void;
}

export default function NotionSetup({ onSave }: Props) {
  const [key, setKey]           = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSave() {
    const k = key.trim();
    if (!k) { setError('הכנס Notion Integration Token'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/trades', {
        headers: { 'x-notion-key': k, 'x-notion-db': DEFAULT_DB_ID },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const cfg = { key: k, dbId: DEFAULT_DB_ID };
      saveNotionConfig(cfg);
      onSave(cfg);
    } catch {
      setError('לא ניתן להתחבר — בדוק שהטוקן נכון ושחיברת את ה-Integration למסד הנתונים');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 space-y-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <TrendingUp size={18} color="var(--blue)" strokeWidth={2} />
          </div>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Trading Journal</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>ICT · 2026</div>
          </div>
        </div>

        <div>
          <div className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
            חבר את ה-Notion שלך
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            הכנס את ה-Integration Token כדי לטעון את הנתונים שלך
          </div>
        </div>

        {/* Token input */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Notion Integration Token
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="ntn_..."
              className="w-full px-3 py-2.5 rounded-lg text-sm pr-10 outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Help */}
        <div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--blue)' }}
          >
            {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            איך מקבלים Integration Token?
          </button>
          {showHelp && (
            <div
              className="mt-3 p-4 rounded-xl text-xs space-y-3"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', lineHeight: 1.7 }}
            >
              <div>
                1. כנס ל-notion.com/profile/integrations
              </div>
              <div>
                2. לחץ &quot;New integration&quot; ← תן שם ← לחץ Save
              </div>
              <div>
                3. העתק את ה-&quot;Internal Integration Secret&quot;
              </div>
              <div>
                4. פתח את מסד הנתונים ב-Notion ← לחץ &quot;...&quot; ← &quot;Connections&quot; ← הוסף את ה-Integration
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="text-xs p-3 rounded-lg"
            style={{ background: 'rgba(244,63,94,0.08)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.2)' }}
          >
            {error}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
          style={{ background: 'var(--blue)', color: 'white' }}
        >
          {loading ? 'מתחבר...' : 'כנס לדאשבורד ←'}
        </button>
      </div>
    </div>
  );
}
