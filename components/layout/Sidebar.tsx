'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BarChart2, CalendarDays, BookOpen, Table2, Smartphone } from 'lucide-react';

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
      className="fixed left-0 w-[220px] hidden md:flex flex-col"
      style={{
        top: 'calc(48px + env(safe-area-inset-top))',
        height: 'calc(100% - 48px - env(safe-area-inset-top))',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Nav */}
      <nav className="flex-1 px-3 py-5">
        <div
          className="px-3 mb-3"
          style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sidebar-text-muted)' }}
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
                  background: isActive ? 'var(--sidebar-item-active-bg)' : 'transparent',
                  color: isActive ? 'var(--sidebar-text-primary)' : 'var(--sidebar-text-secondary)',
                  fontWeight: isActive ? 500 : 400,
                  borderLeft: isActive ? '2px solid var(--sidebar-accent)' : '2px solid transparent',
                  transition: 'all 160ms var(--ease-out)',
                  letterSpacing: '-0.01em',
                }}
              >
                <Icon
                  size={15}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  style={{
                    color: isActive ? 'var(--sidebar-accent)' : 'var(--sidebar-text-secondary)',
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
      <div className="px-4 py-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
        <Link
          href="/install"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm"
          style={{
            background: pathname === '/install'
              ? 'var(--sidebar-item-active-bg)'
              : 'var(--sidebar-surface)',
            color: pathname === '/install' ? 'var(--sidebar-text-primary)' : 'var(--sidebar-text-secondary)',
            fontWeight: 500,
            borderLeft: pathname === '/install' ? '2px solid var(--sidebar-accent)' : '2px solid transparent',
            border: pathname === '/install' ? '1px solid var(--sidebar-accent-border)' : '1px solid var(--sidebar-border)',
            transition: 'all 160ms var(--ease-out)',
          }}
        >
          <Smartphone size={14} style={{ color: 'var(--sidebar-accent)', flexShrink: 0 }} />
          הורד לטלפון
        </Link>
        <div className="flex items-center gap-2.5 px-1">
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: 'var(--green)',
              boxShadow: '0 0 0 2px rgba(16,185,129,0.15)',
              animation: 'pulse-dot 2.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: 'var(--sidebar-text-muted)', fontSize: '11px', letterSpacing: '0.02em' }}>
            Notion · Live
          </span>
        </div>
      </div>
    </aside>
  );
}
