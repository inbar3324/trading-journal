'use client';

import ThemeToggle from './ThemeToggle';

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
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(232,168,32,0.16) 0%, rgba(200,132,14,0.05) 100%)',
            border: '1px solid rgba(232,168,32,0.24)',
          }}
        >
          <svg viewBox="0 0 20 18" width="14" height="13" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.75" y="10" width="4.5" height="4.5" rx="1" fill="#E8A820" opacity="0.75"/>
            <rect x="7.75" y="6.5" width="4.5" height="7" rx="1" fill="#E8A820" opacity="0.88"/>
            <rect x="13.75" y="2.5" width="4.5" height="9.5" rx="1" fill="#F5C84A"/>
          </svg>
        </div>
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
