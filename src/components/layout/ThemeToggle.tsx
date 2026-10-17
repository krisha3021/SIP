'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { safeStorage } from '@/features/plans/ui/storage';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'lakshya:theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

const listeners = new Set<() => void>();

function readTheme(): Theme {
  const v = safeStorage.get(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

/** Inline script run before paint so the stored theme applies without a flash. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readTheme,
    () => 'system' as Theme,
  );

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => {
        if (next === 'system') safeStorage.remove(KEY);
        else safeStorage.set(KEY, next);
        applyTheme(next);
        listeners.forEach((l) => l());
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-text hover:bg-surface-2"
      aria-label={`${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`${LABEL[theme]} (click for ${LABEL[next].toLowerCase()})`}
    >
      <Icon aria-hidden="true" size={18} />
    </button>
  );
}
