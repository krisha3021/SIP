'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Building2, ExternalLink, Search } from 'lucide-react';
import { amcCity, type AmcRecord } from '@/lib/data/amc/registry';

type Sort = 'name' | 'oldest' | 'newest';

const yearOf = (iso: string) => iso.slice(0, 4);

/** Filterable grid of SEBI-registered mutual funds. Every value shown comes from the SEBI register snapshot. */
export function AmcDirectory({ amcs }: { amcs: readonly AmcRecord[] }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? amcs.filter((a) => `${a.displayName} ${a.sebiName} ${a.registrationNo} ${amcCity(a)}`.toLowerCase().includes(needle)) : [...amcs];
    if (sort === 'name') list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en-IN'));
    else list.sort((a, b) => (sort === 'oldest' ? a.registeredOn.localeCompare(b.registeredOn) : b.registeredOn.localeCompare(a.registeredOn)));
    return list;
  }, [amcs, q, sort]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor={`${id}-q`} className="block text-sm font-medium">
            Filter fund houses
          </label>
          <div className="relative mt-1">
            <Search aria-hidden="true" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              id={`${id}-q`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, city or SEBI number"
              className="w-full rounded-lg border border-line-strong bg-surface py-2 pr-3 pl-9 text-text"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-sort`} className="block text-sm font-medium">
            Sort by
          </label>
          <select
            id={`${id}-sort`}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="mt-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-text"
          >
            <option value="name">Name (A–Z)</option>
            <option value="oldest">Registered earliest</option>
            <option value="newest">Registered most recently</option>
          </select>
        </div>
        <p role="status" className="text-sm text-muted sm:ml-auto">
          Showing {shown.length} of {amcs.length}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No registered fund house matches “{q.trim()}”.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <li key={a.registrationNo} className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0">
                  <Link href={`/amcs/${a.slug}`} className="font-semibold text-text no-underline hover:text-brand hover:underline">
                    {a.displayName}
                  </Link>
                  <p className="text-xs text-muted">{amcCity(a)}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">SEBI no.</dt>
                <dd className="num font-medium">{a.registrationNo}</dd>
                <dt className="text-muted">Registered</dt>
                <dd className="num">{yearOf(a.registeredOn)}</dd>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-sm">
                <Link href={`/amcs/${a.slug}`} className="font-medium">
                  Profile <span className="sr-only">of {a.displayName}</span>
                </Link>
                {a.website ? (
                  <a href={a.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                    Official site <ExternalLink aria-hidden="true" size={13} />
                    <span className="sr-only">of {a.displayName} (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="text-muted">Website not recorded</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
