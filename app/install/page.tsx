'use client';

import { useEffect, useState } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

interface DeferredPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

const steps = {
  ios: [
    { icon: '🌐', text: 'פתח את האתר ב-Safari (לא Chrome)' },
    { icon: '⎙', text: 'לחץ על כפתור השיתוף בתחתית המסך' },
    { icon: '📲', text: 'גלול ובחר "הוסף למסך הבית"' },
    { icon: '✅', text: 'לחץ "הוסף" — האפליקציה תופיע על המסך!' },
  ],
  android: [
    { icon: '⋮', text: 'לחץ על תפריט Chrome (שלוש נקודות) בפינה הימנית העליונה' },
    { icon: '📲', text: 'בחר "הוסף למסך הבית" או "התקן אפליקציה"' },
    { icon: '✅', text: 'לחץ "הוסף" — האפליקציה תופיע על המסך!' },
  ],
  desktop: [
    { icon: '📱', text: 'פתח את האתר על הטלפון שלך' },
    { icon: '⎙', text: 'iOS Safari: לחץ על כפתור השיתוף → "הוסף למסך הבית"' },
    { icon: '⋮', text: 'Android Chrome: תפריט שלוש נקודות → "התקן אפליקציה"' },
  ],
};

const platformLabels: Record<string, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  desktop: 'כל מכשיר',
};

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<'ios' | 'android' | 'desktop'>('android');

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setSelectedPlatform(p === 'unknown' ? 'android' : p === 'desktop' ? 'desktop' : p);

    if (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone) {
      setInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as DeferredPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
  };

  if (installed) {
    return (
      <div style={{
        minHeight: '80vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
        textAlign: 'center',
      }}>
        <CheckCircle2 size={56} color="var(--green)" strokeWidth={1.5} />
        <div style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 700 }}>
          האפליקציה מותקנת!
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          תמצא אותה על מסך הבית שלך
        </div>
      </div>
    );
  }

  const currentSteps = steps[selectedPlatform];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 16px 32px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, rgba(232,168,32,0.14), rgba(200,132,14,0.05))',
          border: '1px solid rgba(232,168,32,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 20 18" width="28" height="24" fill="none">
            <line x1="4" y1="16.5" x2="16" y2="16.5" stroke="#E8A820" strokeWidth="1" strokeLinecap="round" opacity="0.35"/>
            <line x1="4" y1="10" x2="4" y2="8.5" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="4" y1="14.5" x2="4" y2="16" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="1.75" y="10" width="4.5" height="4.5" rx="1" fill="#E8A820" opacity="0.75"/>
            <line x1="10" y1="6.5" x2="10" y2="4.5" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="10" y1="13.5" x2="10" y2="15.5" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="7.75" y="6.5" width="4.5" height="7" rx="1" fill="#E8A820" opacity="0.88"/>
            <line x1="16" y1="2.5" x2="16" y2="1" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="16" y1="12" x2="16" y2="13.5" stroke="#F5C84A" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="13.75" y="2.5" width="4.5" height="9.5" rx="1" fill="#F5C84A"/>
          </svg>
        </div>
        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          הורד את TradeJournal
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          התקן על הטלפון שלך וגש מהר לכל מקום
        </div>
      </div>

      {/* Platform tabs */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 24,
        background: 'var(--bg-card)', borderRadius: 12,
        padding: 4, border: '1px solid var(--border-color)',
      }}>
        {(['ios', 'android', 'desktop'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPlatform(p)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: selectedPlatform === p ? 'var(--bg-elevated)' : 'transparent',
              color: selectedPlatform === p ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 160ms',
              boxShadow: selectedPlatform === p ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
            }}
          >
            {platformLabels[p]}
          </button>
        ))}
      </div>

      {/* Steps */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14,
        border: '1px solid var(--border-color)',
        overflow: 'hidden', marginBottom: 20,
      }}>
        {currentSteps.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
              borderBottom: i < currentSteps.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {step.icon}
            </div>
            <div style={{ paddingTop: 2 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: 'var(--blue)',
                marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                שלב {i + 1}
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5 }}>
                {step.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Android direct install button */}
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: '1px solid var(--accent-border)',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08))',
            color: 'var(--blue)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 12,
          }}
        >
          <Download size={16} />
          התקן עכשיו
        </button>
      )}

      {/* Info card */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--border-color)', padding: '14px 16px',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
          האפליקציה עובדת כ-PWA — אין צורך בחנות אפליקציות.
          {selectedPlatform === 'ios' && ' חשוב: חייב להיות ב-Safari (לא Chrome) על iOS.'}
          {selectedPlatform === 'android' && ' עובד על Chrome, Edge, ו-Samsung Internet.'}
        </div>
      </div>

      {/* Desktop: site URL hint */}
      {(platform === 'desktop' || platform === 'unknown') && (
        <div style={{
          marginTop: 16, background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border-color)', padding: '14px 16px',
          textAlign: 'center',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>
            כתובת האתר לפתיחה בטלפון:
          </div>
          <div style={{
            color: 'var(--blue)', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            trading-journal-beige-beta.vercel.app
          </div>
        </div>
      )}
    </div>
  );
}
