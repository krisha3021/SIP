// @vitest-environment jsdom
import './setup-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_WATCHLIST, WATCHLIST_KEY, addToWatchlist, readWatchlist, removeFromWatchlist } from '@/features/watchlist/ui/storage';
import { WatchlistButton } from '@/features/watchlist/ui/WatchlistButton';
import { Watchlist } from '@/features/watchlist/ui/Watchlist';

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const item = (code: number) => ({ schemeCode: code, schemeName: `Fixture ${code} - Direct Plan - Growth` });

describe('watchlist storage', () => {
  it('adds, reads and removes schemes, newest first, without duplicates', () => {
    expect(addToWatchlist(item(1)).ok).toBe(true);
    expect(addToWatchlist(item(2)).ok).toBe(true);
    expect(addToWatchlist(item(1))).toEqual({ ok: false, reason: 'duplicate' });
    expect(readWatchlist().map((w) => w.schemeCode)).toEqual([2, 1]);
    expect(removeFromWatchlist(1)).toBe(true);
    expect(readWatchlist().map((w) => w.schemeCode)).toEqual([2]);
  });
  it(`stops at ${50} schemes`, () => {
    expect(MAX_WATCHLIST).toBe(50);
    for (let i = 1; i <= 50; i++) addToWatchlist(item(i));
    expect(addToWatchlist(item(51))).toEqual({ ok: false, reason: 'limit' });
  });
  it('ignores corrupted storage instead of crashing', () => {
    localStorage.setItem(WATCHLIST_KEY, '{not json');
    expect(readWatchlist()).toEqual([]);
  });
  it('reports unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(addToWatchlist(item(1))).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('WatchlistButton', () => {
  it('toggles between add and remove and announces the change', async () => {
    render(<WatchlistButton schemeCode={7} schemeName="Fixture 7" />);
    await userEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    expect(readWatchlist().map((w) => w.schemeCode)).toEqual([7]);
    expect(screen.getByRole('status')).toHaveTextContent(/saved in this browser/i);
    await userEvent.click(screen.getByRole('button', { name: /remove from watchlist/i }));
    expect(readWatchlist()).toEqual([]);
  });
});

describe('Watchlist page component', () => {
  it('shows an empty state that explains local-only storage', () => {
    render(<Watchlist />);
    expect(screen.getByText(/no schemes on your watchlist/i)).toBeInTheDocument();
    expect(screen.getByText(/stays in this browser/i)).toBeInTheDocument();
  });
  it('lists saved schemes and links up to four of them to Compare', () => {
    for (const c of [1, 2, 3, 4, 5]) addToWatchlist(item(c));
    render(<Watchlist />);
    expect(screen.getAllByRole('link', { name: /Fixture \d/ })).toHaveLength(5);
    expect(screen.getByRole('link', { name: /compare the first 4/i })).toHaveAttribute('href', '/compare?codes=5,4,3,2');
  });
});
