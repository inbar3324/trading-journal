'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BarChart2, CalendarDays, BookOpen, Table2, Smartphone } from 'lucide-react';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/journal', icon: BookOpen, label: 'Journal' },
  { href: '/analytics', icon: BarChart2, label: 'Analytics' },
  { href: '/weekly', icon: CalendarDays, label: 'Recap' },
  { href: '/wsummary', icon: Table2, label: 'Summary' },
  { href: '/install', icon: Smartphone, label: 'הורד', highlight: true },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex md:hidden z-50"
      style={{
        background: 'linear-gradient(180deg, #0B0B0F 0%, #0E0E13 100%)',
        borderTop: '1px solid var(--border-color)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        const color = isActive ? 'var(--blue)' : item.highlight ? 'var(--yellow)' : 'var(--text-muted)';
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5"
            style={{
              color,
              fontSize: '9px',
              fontWeight: isActive ? 600 : 400,
              transition: 'color 160ms var(--ease-out)',
              letterSpacing: '0.02em',
            }}
          >
            <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} color={color} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
