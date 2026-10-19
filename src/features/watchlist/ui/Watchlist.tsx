'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { Button, buttonClass } from '@/components/ui/primitives';
import { parseWatchlist, removeFromWatchlist, subscribeWatchlist, watchlistServerSnapshot, watchlistSnapshot } from './storage';

export function Watchlist() {
  const raw = useSyncExternalStore(subscribeWatchlist, watchlistSnapshot, watchlistServerSnapshot);
  const items = useMemo(() => parseWatchlist(raw), [raw]);
  const first4 = items.slice(0, 4).map((i) => i.schemeCode);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Your watchlist stays in this browser. It is not uploaded, synced or shared, and clearing your browser data removes it.</p>
      {items.length === 0 ? (
        <p>
          No schemes on your watchlist yet. Open a scheme in <Link href="/funds">Fund Research</Link> and choose “Add to watchlist”.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {items.map((i) => (
              <li key={i.schemeCode} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <Link href={`/funds/${i.schemeCode}`}>{i.schemeName}</Link>
                  <span className="num ml-2 text-xs text-muted">Scheme code {i.schemeCode}</span>
                </span>
                <Button variant="ghost" onClick={() => removeFromWatchlist(i.schemeCode)} aria-label={`Remove ${i.schemeName} from the watchlist`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {items.length >= 2 && (
            <Link href={`/compare?codes=${first4.join(',')}`} className={buttonClass('primary')}>
              {items.length > 4 ? 'Compare the first 4' : `Compare these ${items.length}`}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
