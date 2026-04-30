'use client';

import { useState } from 'react';
import { TrendingUp, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { saveNotionConfig, type NotionConfig } from '@/lib/notion-config';

interface Props {
  onSave: (cfg: NotionConfig) => void;
}

export default function NotionSetup({ onSave }: Props) {
  const [key, setKey]       = useState('');
  const [dbId, setDbId]     = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const k = key.trim();
    const d = dbId.trim().replace(/-/g, '').replace(
      /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i,
      '$1-$2-$3-$4-$5'
    ) || dbId.trim();

    if (!k) { setError('הכנס Notion Integration Token'); return; }
    if (!d) { setError('הכנס Database ID'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/trades', {
        headers: { 'x-notion-key': k, 'x-notion-db': d },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const cfg = { key: k, dbId: d };
      saveNotionConfig(cfg);
      onSave(cfg);
    } catch {
      setError('לא ניתן להתחבר — בדוק שהמפתח והID נכונים ושחיברת את ה-Integration למסד הנתונים');
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
            הכנס את הפרטים כדי לטעון את הנתונים שלך
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

        {/* DB ID input */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Database ID
          </label>
          <input
            type="text"
            value={dbId}
            onChange={(e) => setDbId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Help */}
        <div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--blue)' }}
          >
            {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            כיצד מקבלים את הפרטים?
          </button>
          {showHelp && (
            <div
              className="mt-3 p-4 rounded-xl text-xs space-y-3"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', lineHeight: 1.7 }}
            >
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Integration Token:</strong>
                <br />
                כנס ל-notion.com/profile/integrations ← &quot;New integration&quot; ← העתק את ה-Token
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Database ID:</strong>
                <br />
                פתח את מסד הנתונים ב-Notion ← העתק את ה-URL.
                ה-ID הוא 32 התווים שמופיעים אחרי שם המשתמש ולפני &quot;?&quot;
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>חשוב:</strong>
                <br />
                כנס למסד הנתונים → לחץ &quot;...&quot; → &quot;Connections&quot; → הוסף את ה-Integration שיצרת
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
