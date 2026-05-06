'use client';

import { useState } from 'react';
import { TrendingUp, Eye, EyeOff, ChevronDown, ChevronUp, Database, ArrowLeft } from 'lucide-react';
import { saveNotionConfig, type NotionConfig } from '@/lib/notion-config';

interface DbOption {
  id: string;
  title: string;
}

interface Props {
  onSave: (cfg: NotionConfig) => void;
}

export default function NotionSetup({ onSave }: Props) {
  const [step, setStep]         = useState<'token' | 'db'>('token');
  const [key, setKey]           = useState('');
  const [databases, setDatabases] = useState<DbOption[]>([]);
  const [showKey, setShowKey]   = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleConnect() {
    const k = key.trim();
    if (!k) { setError('הכנס Notion Integration Token'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/notion/databases', {
        headers: { 'x-notion-key': k },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const dbs: DbOption[] = data.databases;

      if (dbs.length === 0) {
        throw new Error('לא נמצאו Databases — וודא שחיברת את ה-Integration לפחות ל-Database אחד ב-Notion');
      } else if (dbs.length === 1) {
        await saveWithRealDb(k, dbs[0].id);
      } else {
        setDatabases(dbs);
        setStep('db');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה לא ידועה';
      setError(msg.includes('Unauthorized') || msg.includes('API token')
        ? 'הטוקן שגוי — בדוק שהעתקת נכון'
        : msg);
    } finally {
      setLoading(false);
    }
  }

  async function saveWithRealDb(k: string, dbId: string) {
    let realDbId: string | undefined;
    try {
      const res = await fetch('/api/notion/discover-realdb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k, dbId }),
      });
      const data = await res.json();
      if (data.realDbId) realDbId = data.realDbId;
    } catch { /* proceed without realDbId — app will discover it on first load */ }
    const cfg = { key: k, dbId, realDbId };
    saveNotionConfig(cfg);
    onSave(cfg);
  }

  function handleSelectDb(db: DbOption) {
    saveWithRealDb(key.trim(), db.id);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Ambient radial glow */}
      <div
        style={{
          position: 'fixed',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          height: 500,
          background: 'radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Outer bezel */}
      <div
        className="w-full relative z-10"
        style={{
          maxWidth: 440,
          borderRadius: '2rem',
          padding: 6,
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Inner card */}
        <div
          style={{
            borderRadius: 'calc(2rem - 6px)',
            padding: '2rem',
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.035)',
          }}
        >
          {step === 'token' ? (
            <div className="space-y-6">
              {/* Logo + brand */}
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.05) 100%)',
                    border: '1px solid rgba(59,130,246,0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
                  }}
                >
                  <TrendingUp size={18} color="var(--blue)" strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    TradeJournal
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    ICT · 2026
                  </div>
                </div>
              </div>

              {/* Heading */}
              <div>
                <h1
                  style={{
                    fontSize: 24, fontWeight: 700, color: 'var(--text-primary)',
                    letterSpacing: '-0.03em', lineHeight: 1.25, margin: 0,
                  }}
                >
                  חבר את ה-Notion שלך
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.65 }}>
                  הכנס את ה-Integration Token כדי לטעון את הנתונים שלך
                </p>
              </div>

              {/* Token input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label
                  style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: 'var(--text-muted)',
                  }}
                >
                  Notion Integration Token
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder="ntn_..."
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 14px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      transition: 'border-color 160ms var(--ease-out)',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    style={{
                      position: 'absolute', right: 12, top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 4,
                      transition: 'color 150ms',
                    }}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Help accordion */}
              <div>
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 12, color: 'var(--blue)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, transition: 'opacity 150ms',
                  }}
                >
                  {showHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  איך מקבלים Integration Token?
                </button>
                {showHelp && (
                  <div
                    style={{
                      marginTop: 12, padding: '14px 16px', borderRadius: 12,
                      fontSize: 12, lineHeight: 1.9,
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div>1. כנס ל-notion.com/profile/integrations</div>
                    <div>2. לחץ &quot;New integration&quot; ← תן שם ← לחץ Save</div>
                    <div>3. העתק את ה-&quot;Internal Integration Secret&quot;</div>
                    <div>4. פתח את מסד הנתונים ← לחץ &quot;...&quot; ← &quot;Connections&quot; ← הוסף את ה-Integration</div>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    fontSize: 12, padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(244,63,94,0.06)', color: 'var(--red)',
                    border: '1px solid rgba(244,63,94,0.18)', lineHeight: 1.6,
                  }}
                >
                  {error}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleConnect}
                disabled={loading}
                style={{
                  width: '100%', padding: '13px 20px', borderRadius: 12,
                  fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em',
                  background: loading ? 'rgba(59,130,246,0.45)' : 'var(--blue)',
                  color: 'white', border: 'none',
                  cursor: loading ? 'wait' : 'pointer',
                  transition: 'all 160ms var(--ease-out)',
                  boxShadow: loading ? 'none' : '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 16px rgba(59,130,246,0.2)',
                }}
                onMouseDown={(e) => { if (!loading) e.currentTarget.style.transform = 'scale(0.98) translateY(1px)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
              >
                {loading ? 'מתחבר...' : 'כנס לדאשבורד ←'}
              </button>
            </div>
          ) : (
            /* Step 2 — DB selector */
            <div className="space-y-5">
              {/* Back + heading */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setStep('token'); setError(''); }}
                  style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    transition: 'all 150ms var(--ease-out)',
                  }}
                  aria-label="חזור"
                >
                  <ArrowLeft size={14} />
                </button>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    בחר Database
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    נמצאו {databases.length} Databases — בחר את זה שמכיל את יומן המסחר
                  </div>
                </div>
              </div>

              {/* DB list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {databases.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => handleSelectDb(db)}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12,
                      display: 'flex', alignItems: 'center', gap: 12,
                      textAlign: 'right',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 150ms var(--ease-out)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)';
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--blue) 6%, var(--bg-surface))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.background = 'var(--bg-surface)';
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.99) translateY(1px)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; }}
                  >
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(59,130,246,0.08)',
                        border: '1px solid rgba(59,130,246,0.18)',
                      }}
                    >
                      <Database size={14} color="var(--blue)" />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                        {db.title}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, fontFamily: 'monospace' }}>
                        {db.id.slice(0, 8)}…
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      <path d="M5 2.5L9 7l-4 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
