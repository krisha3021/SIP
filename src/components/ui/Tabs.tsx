'use client';

import { useId, useRef, useState } from 'react';

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
}

/** WAI-ARIA tabs with automatic activation: Arrow keys, Home and End move between tabs. */
export function Tabs({ tabs, label, initial }: { tabs: TabDef[]; label: string; initial?: string }) {
  const uid = useId();
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    if (!t) return;
    setActive(t.id);
    refs.current[(i + tabs.length) % tabs.length]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="no-print flex gap-1 border-b border-line">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') focusTab(i + 1);
                else if (e.key === 'ArrowLeft') focusTab(i - 1);
                else if (e.key === 'Home') focusTab(0);
                else if (e.key === 'End') focusTab(tabs.length - 1);
                else return;
                e.preventDefault();
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                selected ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${uid}-panel-${t.id}`}
          aria-labelledby={`${uid}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
