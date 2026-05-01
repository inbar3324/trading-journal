import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import PWAInstall from '@/components/ui/PWAInstall';
import NotionConfigProvider from '@/components/providers/NotionConfigProvider';

export const metadata: Metadata = {
  title: 'Trading Journal 2026',
  description: 'ICT Trading Analytics Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#131316" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="TJ 2026" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <NotionConfigProvider>
          <Sidebar />
          <main className="flex-1 ml-[220px] overflow-y-auto" style={{ background: 'var(--bg-primary)' }}>
            {children}
          </main>
        </NotionConfigProvider>
        <PWAInstall />
      </body>
    </html>
  );
}
