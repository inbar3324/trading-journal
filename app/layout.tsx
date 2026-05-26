import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import MobileNav from '@/components/layout/MobileNav';
import PWAInstall from '@/components/ui/PWAInstall';
import NotionConfigProvider from '@/components/providers/NotionConfigProvider';

export const metadata: Metadata = {
  title: 'Trading Journal 2026',
  description: 'ICT Trading Analytics Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tj_theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}}catch(e){}})();`,
          }}
        />
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#131316" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="TJ 2026" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="h-screen overflow-hidden" style={{ background: 'var(--sidebar-bg)' }}>
        <NotionConfigProvider>
          <Sidebar />
          <TopBar />
          <main
            className="md:ml-[220px] overflow-y-auto"
            style={{
              background: 'var(--bg-primary)',
              marginTop: 'calc(48px + env(safe-area-inset-top))',
              height: 'calc(100vh - 48px - env(safe-area-inset-top))',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
              boxShadow: '0 -1px 0 var(--sidebar-border)',
            }}
          >
            {children}
          </main>
          <MobileNav />
        </NotionConfigProvider>
        <PWAInstall />
      </body>
    </html>
  );
}
