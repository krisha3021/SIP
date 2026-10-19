/** Browser-local watchlist. Scheme codes and names only; nothing leaves this browser. */
import { z } from 'zod';
import { safeStorage } from '@/features/plans/ui/storage';

export const WATCHLIST_KEY = 'lakshya:watchlist:v1';
export const MAX_WATCHLIST = 50;
export const WATCHLIST_EVENT = 'lakshya:watchlist-change';

const itemSchema = z.object({
  schemeCode: z.number().int().positive().max(9_999_999),
  schemeName: z.string().min(1).max(200),
  addedAt: z.string(),
});
export type WatchlistItem = z.infer<typeof itemSchema>;

export function parseWatchlist(raw: string | null): WatchlistItem[] {
  if (!raw) return [];
  try {
    const parsed = z.array(itemSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const readWatchlist = (): WatchlistItem[] => parseWatchlist(safeStorage.get(WATCHLIST_KEY));

function write(items: WatchlistItem[]): boolean {
  const ok = safeStorage.set(WATCHLIST_KEY, JSON.stringify(items));
  if (ok && typeof window !== 'undefined') window.dispatchEvent(new Event(WATCHLIST_EVENT));
  return ok;
}

export type WatchlistOutcome = { ok: true } | { ok: false; reason: 'duplicate' | 'limit' | 'unavailable' | 'invalid' };

export function addToWatchlist(input: { schemeCode: number; schemeName: string }): WatchlistOutcome {
  const items = readWatchlist();
  if (items.some((i) => i.schemeCode === input.schemeCode)) return { ok: false, reason: 'duplicate' };
  if (items.length >= MAX_WATCHLIST) return { ok: false, reason: 'limit' };
  const item = itemSchema.safeParse({ ...input, addedAt: new Date().toISOString() });
  if (!item.success) return { ok: false, reason: 'invalid' };
  return write([item.data, ...items]) ? { ok: true } : { ok: false, reason: 'unavailable' };
}

export function removeFromWatchlist(schemeCode: number): boolean {
  return write(readWatchlist().filter((i) => i.schemeCode !== schemeCode));
}

/** For useSyncExternalStore: re-read on our own change event and on other tabs' storage events. */
export function subscribeWatchlist(onChange: () => void): () => void {
  window.addEventListener(WATCHLIST_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(WATCHLIST_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
export const watchlistSnapshot = (): string => safeStorage.get(WATCHLIST_KEY) ?? '[]';
export const watchlistServerSnapshot = (): string => '[]';
