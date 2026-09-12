'use client';

import ThemeToggle from './ThemeToggle';
import BrandMark from '@/components/brand/BrandMark';

export default function TopBar() {
  return (
    <header
      className="fixed top-0 right-0 left-0 z-40 flex items-center justify-between px-4 md:px-6"
      style={{
        height: 'calc(48px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--sidebar-bg)',
        borderBottom: '1px solid var(--sidebar-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <BrandMark size={28} />
        <span
          className="font-semibold text-sm"
          style={{ color: 'var(--sidebar-text-primary)', letterSpacing: '-0.02em' }}
        >
          TradeJournal
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
