/**
 * Provenance and freshness for every displayed financial dataset.
 *
 * Freshness is derived ONLY from `observedAt` (the date of the data itself) and `fetchedAt` of
 * the last SUCCESSFUL upstream retrieval. Pressing "refresh" or a failed fetch never advances them.
 */

export type DataClassification = 'observed' | 'estimated' | 'synthetic' | 'delayed' | 'cached';

export type FreshnessState =
  | 'latest-nav' // latest NAV the provider has published, within the expected cadence
  | 'end-of-day'
  | 'delayed'
  | 'historical'
  | 'stale' // cached data older than the provider cadence allows
  | 'synthetic'
  | 'unavailable';

export interface Provenance {
  provider: string;
  providerUrl: string;
  /** Scheme or instrument identifier at the provider. */
  identifier: string;
  /** Date the newest observation refers to (ISO date). */
  observedAt: string | null;
  /** When the data was last successfully retrieved from upstream (ISO timestamp). */
  fetchedAt: string | null;
  coverage: { from: string; to: string; observations: number } | null;
  plan: 'Direct' | 'Regular' | 'Unknown';
  option: 'Growth' | 'IDCW' | 'Unknown';
  currency: 'INR';
  units: string;
  classification: DataClassification;
  notes: string[];
}

export interface FetchAttempt<T> {
  ok: boolean;
  at: string;
  data?: T;
  provenance?: Provenance;
  error?: string;
}

export interface DatasetState<T> {
  data: T | null;
  provenance: Provenance | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Applies a fetch attempt. On failure, the previous data and provenance are kept unchanged:
 * the observation date and the successful-fetch timestamp do not move, and only the error is recorded.
 */
export function applyFetchAttempt<T>(prev: DatasetState<T>, attempt: FetchAttempt<T>): DatasetState<T> {
  if (attempt.ok && attempt.data !== undefined && attempt.provenance) {
    return { data: attempt.data, provenance: attempt.provenance, lastAttemptAt: attempt.at, lastError: null };
  }
  return {
    ...prev,
    provenance: prev.provenance ? { ...prev.provenance, classification: prev.data ? 'cached' : prev.provenance.classification } : null,
    lastAttemptAt: attempt.at,
    lastError: attempt.error ?? 'Upstream request failed',
  };
}

/** Count of weekdays (Mon–Fri) strictly after `fromIso` up to and including `toIso`. */
function weekdaysBetween(fromIso: string, toIso: string): number {
  let count = 0;
  const d = new Date(fromIso + 'T00:00:00Z');
  const end = new Date(toIso + 'T00:00:00Z');
  for (d.setUTCDate(d.getUTCDate() + 1); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

/**
 * Classifies a NAV dataset. Mutual-fund NAVs are published once per business day, usually in the
 * evening. A NAV is "latest" if at most `graceBusinessDays` weekdays have passed since its
 * observation date. Holidays are not modelled, so the grace period absorbs them.
 */
export function navFreshness(
  state: DatasetState<unknown>,
  todayIso: string,
  graceBusinessDays = 3,
): FreshnessState {
  const p = state.provenance;
  if (!p || !p.observedAt || !state.data) return 'unavailable';
  if (p.classification === 'synthetic') return 'synthetic';
  const lag = weekdaysBetween(p.observedAt, todayIso);
  if (lag <= graceBusinessDays) return state.lastError ? 'stale' : 'latest-nav';
  return 'stale';
}
