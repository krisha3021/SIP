'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { addToWatchlist, parseWatchlist, removeFromWatchlist, subscribeWatchlist, watchlistServerSnapshot, watchlistSnapshot } from './storage';

const REASONS = { duplicate: 'Already on your watchlist.', limit: 'Your watchlist is full (50 schemes). Remove one first.', unavailable: 'This browser is not allowing local storage, so the watchlist cannot be saved.', invalid: 'This scheme could not be saved.' };

export function WatchlistButton({ schemeCode, schemeName }: { schemeCode: number; schemeName: string }) {
  const raw = useSyncExternalStore(subscribeWatchlist, watchlistSnapshot, watchlistServerSnapshot);
  const watched = useMemo(() => parseWatchlist(raw).some((i) => i.schemeCode === schemeCode), [raw, schemeCode]);
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        aria-pressed={watched}
        onClick={() => {
          if (watched) {
            removeFromWatchlist(schemeCode);
            setNote('Removed from your watchlist.');
          } else {
            const r = addToWatchlist({ schemeCode, schemeName });
            setNote(r.ok ? 'Added. Your watchlist is saved in this browser only.' : REASONS[r.reason]);
          }
        }}
      >
        <Star size={16} aria-hidden="true" fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Remove from watchlist' : 'Add to watchlist'}
      </Button>
      <span role="status" className="text-xs text-muted">
        {note}
      </span>
    </div>
  );
}
