'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CALCULATORS, type CalculatorEntry } from './registry';

function matches(c: CalculatorEntry, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [c.title, c.summary, c.category, ...c.keywords].join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function CalculatorDirectory() {
  const id = useId();
  const [q, setQ] = useState('');
  const shown = useMemo(() => CALCULATORS.filter((c) => matches(c, q)), [q]);
  const groups = useMemo(() => {
    const g = new Map<string, CalculatorEntry[]>();
    for (const c of shown) g.set(c.category, [...(g.get(c.category) ?? []), c]);
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="space-y-6">
      <div role="search" className="max-w-xl">
        <label htmlFor={id} className="block text-sm font-medium">
          Search calculators
        </label>
        <div className="mt-1 flex items-center rounded-md border border-line-strong bg-surface focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)]">
          <Search aria-hidden="true" size={18} className="ml-3 text-muted" />
          <input
            id={id}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. retirement, step up, tax"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none"
            aria-describedby={`${id}-count`}
          />
        </div>
        <p id={`${id}-count`} role="status" aria-live="polite" className="mt-1 text-sm text-muted">
          {shown.length === CALCULATORS.length ? `${shown.length} calculators` : `${shown.length} of ${CALCULATORS.length} calculators match`}
        </p>
      </div>
      {groups.length === 0 && <p>No calculator matches “{q}”. Try a broader word such as “SIP” or “goal”.</p>}
      {groups.map(([category, items]) => (
        <section key={category} aria-labelledby={`${id}-${category}`}>
          <h2 id={`${id}-${category}`} className="text-xl font-semibold">
            {category}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <li key={c.slug}>
                <Link href={`/calculators/${c.slug}`} className="block h-full rounded-xl border border-line bg-surface p-4 text-text no-underline hover:border-brand hover:bg-brand-soft">
                  <span className="block font-semibold text-brand">{c.title}</span>
                  <span className="mt-1 block text-sm text-muted">{c.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
