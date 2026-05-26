'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'dark' | 'light';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const t = (document.documentElement.classList.contains('light') ? 'light' : 'dark') as Theme;
    setTheme(t);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(next);
    try { localStorage.setItem('tj_theme', next); } catch {}
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'מצב יום' : 'מצב לילה'}
      title={theme === 'dark' ? 'מצב יום' : 'מצב לילה'}
      className="flex items-center justify-center rounded-lg"
      style={{
        width: 26,
        height: 26,
        background: 'var(--sidebar-surface)',
        border: '1px solid var(--sidebar-border)',
        color: 'var(--sidebar-text-secondary)',
        transition: 'all 160ms var(--ease-out)',
      }}
    >
      {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
    </button>
  );
}
