'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BarChart2, CalendarDays, BookOpen, Table2 } from 'lucide-react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/journal', icon: BookOpen, label: 'Journal' },
  { href: '/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/weekly', icon: CalendarDays, label: 'Recap' },
  { href: '/wsummary', icon: Table2, label: 'W. Summary' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-full w-[220px] flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0B0B0F 0%, #0E0E13 60%, #0C0C10 100%)',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-6 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(232,168,32,0.14) 0%, rgba(200,132,14,0.05) 100%)',
            border: '1px solid rgba(232,168,32,0.22)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <svg viewBox="0 0 20 18" width="18" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <div>
          <div
            className="font-semibold text-sm"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            TradeJournal
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.06em', marginTop: 1 }}>
            ICT · 2026
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5">
        <div
          className="px-3 mb-3"
          style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
        >
          Navigation
        </div>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm"
                style={{
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 100%)'
                    : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 500 : 400,
                  borderLeft: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                  transition: 'all 160ms var(--ease-out)',
                  letterSpacing: '-0.01em',
                }}
              >
                <Icon
                  size={15}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  style={{
                    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2.5 px-1">
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'var(--green)',
              boxShadow: '0 0 0 2px rgba(16,185,129,0.15)',
              animation: 'pulse-dot 2.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '11px', letterSpacing: '0.02em' }}>
            Notion · Live
          </span>
        </div>
      </div>
    </aside>
  );
}
