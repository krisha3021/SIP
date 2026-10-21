'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, Button, Notice } from '@/components/ui/primitives';
import { searchFunds, type SearchResultDto } from './api';

type State =
  | { status: 'idle' }
  | { status: 'loading'; q: string }
  | { status: 'error'; message: string }
  | { status: 'done'; q: string; provider: string; results: SearchResultDto[] };

/**
 * Scheme search over /api/funds/search. `hrefFor` decides where a result links (detail page or backtest).
 * `onPick` (optional) turns results into buttons instead of links.
 */
export function FundSearch({
  hrefFor,
  onPick,
  label = 'Search mutual fund schemes',
  initialQuery,
}: {
  hrefFor?: (code: number) => string;
  onPick?: (r: SearchResultDto) => void;
  label?: string;
  /** Runs this search once on mount (e.g. an AMC page listing its schemes). */
  initialQuery?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(initialQuery ?? '');
  const [state, setState] = useState<State>({ status: 'idle' });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState({ status: 'error', message: 'Enter at least 2 characters.' });
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: 'loading', q: trimmed });
    try {
      const r = await searchFunds(trimmed, c.signal);
      if (!r.ok) setState({ status: 'error', message: r.error.message });
      else setState({ status: 'done', q: r.query, provider: r.provider, results: r.results });
    } catch {
      /* aborted by a newer search */
    }
  };

  useEffect(() => {
    if (!initialQuery) return;
    // Deferred so the search starts after mount; cleared if the component unmounts first (e.g. StrictMode remount).
    const t = setTimeout(() => void run(initialQuery), 0);
    return () => clearTimeout(t);
    // Run once for the initial query only; later searches come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex max-w-2xl flex-wrap items-end gap-2"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-sm font-medium">
            {label}
          </label>
          <input
            id={id}
            type="search"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. parag parikh flexi cap direct"
            className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2"
          />
        </div>
        <Button type="submit" variant="primary">
          <Search aria-hidden="true" size={16} /> Search
        </Button>
      </form>
      <div role="status" aria-live="polite">
        {state.status === 'loading' && <p className="text-sm text-muted">Searching for “{state.q}”…</p>}
        {state.status === 'error' && <Notice tone="danger" title="Search failed">{state.message}</Notice>}
        {state.status === 'done' && (
          <p className="text-sm text-muted">
            {state.results.length === 0 ? `No schemes match “${state.q}”.` : `${state.results.length} scheme(s) match “${state.q}”${state.results.length === 50 ? ' (first 50 shown — refine your search)' : ''}. Source: ${state.provider}.`}
          </p>
        )}
      </div>
      {state.status === 'done' && state.results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {state.results.map((r) => {
            const body = (
              <>
                <span className="block font-medium">{r.schemeName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="num">Scheme code {r.schemeCode}</span>
                  <Badge tone={r.plan === 'Direct' ? 'brand' : 'neutral'}>{r.plan === 'Unknown' ? 'Plan not stated' : `${r.plan} plan`}</Badge>
                  <Badge>{r.option === 'Unknown' ? 'Option not stated' : r.option}</Badge>
                </span>
              </>
            );
            return (
              <li key={r.schemeCode}>
                {onPick ? (
                  <button type="button" onClick={() => onPick(r)} className="block w-full px-4 py-3 text-left hover:bg-surface-2">
                    {body}
                  </button>
                ) : (
                  <Link href={hrefFor ? hrefFor(r.schemeCode) : `/funds/${r.schemeCode}`} className="block px-4 py-3 text-text no-underline hover:bg-surface-2">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
