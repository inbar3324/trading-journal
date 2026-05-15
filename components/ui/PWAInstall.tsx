'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone;

    if (standalone) {
      setInstalled(true);
      return;
    }

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    if (ios && !localStorage.getItem('pwa-ios-dismissed')) {
      setShowIOSBanner(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (installed) return null;
  if (!prompt && !showIOSBanner) return null;

  const handleInstall = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setPrompt(null);
      setInstalled(true);
    }
  };

  const dismissIOS = () => {
    setShowIOSBanner(false);
    setShowIOSModal(false);
    localStorage.setItem('pwa-ios-dismissed', '1');
  };

  if (isIOS && showIOSModal) {
    return (
      <>
        <div
          onClick={() => setShowIOSModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.65)',
          }}
        />
        <div
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border-color)',
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(232,168,32,0.14), rgba(200,132,14,0.05))',
                border: '1px solid rgba(232,168,32,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg viewBox="0 0 20 18" width="16" height="14" fill="none">
                  <rect x="1.75" y="10" width="4.5" height="4.5" rx="1" fill="#E8A820" opacity="0.75"/>
                  <rect x="7.75" y="6.5" width="4.5" height="7" rx="1" fill="#E8A820" opacity="0.88"/>
                  <rect x="13.75" y="2.5" width="4.5" height="9.5" rx="1" fill="#F5C84A"/>
                </svg>
              </div>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
                התקן TradeJournal
              </span>
            </div>
            <button
              onClick={() => setShowIOSModal(false)}
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <InstallStep num={1} text='פתח בדפדפן Safari' />
            <InstallStep num={2} text='לחץ על כפתור השיתוף ⎙ בתחתית המסך' />
            <InstallStep num={3} text='בחר "הוסף למסך הבית"' />
            <InstallStep num={4} text='לחץ "הוסף" בפינה העליונה ימין' />
          </div>

          <button
            onClick={dismissIOS}
            style={{
              width: '100%', padding: '12px',
              borderRadius: 10, border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            לא עכשיו
          </button>
        </div>
      </>
    );
  }

  if (isIOS && showIOSBanner) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(64px + env(safe-area-inset-bottom))',
          left: 12, right: 12,
          zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          borderRadius: 12,
          border: '1px solid var(--accent-border)',
          background: 'var(--bg-elevated)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(232,168,32,0.14), rgba(200,132,14,0.05))',
          border: '1px solid rgba(232,168,32,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 20 18" width="15" height="13" fill="none">
            <rect x="1.75" y="10" width="4.5" height="4.5" rx="1" fill="#E8A820" opacity="0.75"/>
            <rect x="7.75" y="6.5" width="4.5" height="7" rx="1" fill="#E8A820" opacity="0.88"/>
            <rect x="13.75" y="2.5" width="4.5" height="9.5" rx="1" fill="#F5C84A"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>TradeJournal</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>הוסף למסך הבית</div>
        </div>
        <button
          onClick={() => setShowIOSModal(true)}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: '1px solid var(--accent-border)',
            background: 'var(--accent-dim)', color: 'var(--blue)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          הורד
        </button>
        <button
          onClick={dismissIOS}
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleInstall}
      title="התקן את האפליקציה"
      style={{
        position: 'fixed', bottom: '24px', left: '24px', zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', borderRadius: '10px',
        border: '1px solid var(--accent-border)', background: 'var(--bg-elevated)',
        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
        cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        transition: 'opacity 0.2s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      <Download size={14} color="var(--blue)" />
      התקן
    </button>
  );
}

function InstallStep({ num, text }: { num: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--blue)', fontSize: 12, fontWeight: 700,
      }}>
        {num}
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{text}</span>
    </div>
  );
}
