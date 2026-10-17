/**
 * NAV history service: cache → de-duplicated upstream fetch → last-known-good fallback.
 *
 * - A cached dataset whose last SUCCESSFUL fetch is younger than `freshTtlMs` is served without
 *   contacting the provider.
 * - Otherwise concurrent callers share one upstream request (RequestDeduper).
 * - On success, the dataset replaces the stored one (it becomes the new last-known-good).
 * - On failure, `applyFetchAttempt` keeps the previous data, observation date and fetch time
 *   unchanged, marks it 'cached', and records the error. A failed fetch never advances freshness.
 * - After a failure, the provider is not contacted again for `failureCooldownMs`, so an outage does
 *   not turn every page view into a slow, failing upstream call.
 * Freshness is computed from the observation date against today's date in India (IST).
 */
import type { CacheStore } from './cache';
import { RequestDeduper } from './dedupe';
import { toDataError, type DataError } from './errors';
import { fetchNavHistory, schemeCodeSchema, type FetchOptions, type SchemeNavHistory } from './mfapi';
import { applyFetchAttempt, navFreshness, type DatasetState, type FreshnessState } from './provenance';

export type NavSource = 'cache' | 'upstream' | 'last-known-good' | 'none';

export interface NavServiceResult {
  state: DatasetState<SchemeNavHistory>;
  source: NavSource;
  /** The error from this request's upstream attempt, if there was one. */
  error: DataError | null;
  freshness: FreshnessState;
}

export interface NavServiceOptions {
  cache: CacheStore;
  /** Default 6 hours. NAVs change at most once per business day. */
  freshTtlMs?: number;
  /** Default 60 seconds. */
  failureCooldownMs?: number;
  fetchOptions?: Omit<FetchOptions, 'now'>;
  /** Injectable for tests; defaults to the MFAPI adapter. */
  fetchHistory?: (schemeCode: string, opts: FetchOptions) => Promise<SchemeNavHistory>;
  deduper?: RequestDeduper;
  now?: () => Date;
}

const IST_OFFSET_MS = 330 * 60_000;

/** Calendar date in India (UTC+05:30) for a given instant, as ISO 'YYYY-MM-DD'. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const EMPTY: DatasetState<SchemeNavHistory> = { data: null, provenance: null, lastAttemptAt: null, lastError: null };

export const navCacheKey = (schemeCode: number) => `nav:v1:${schemeCode}`;

export function createNavService(opts: NavServiceOptions) {
  const freshTtlMs = opts.freshTtlMs ?? 6 * 3_600_000;
  const cooldownMs = opts.failureCooldownMs ?? 60_000;
  const now = opts.now ?? (() => new Date());
  const deduper = opts.deduper ?? new RequestDeduper();
  const fetchHistory = opts.fetchHistory ?? fetchNavHistory;

  const result = (state: DatasetState<SchemeNavHistory>, source: NavSource, error: DataError | null): NavServiceResult => ({
    state,
    source: state.data ? source : 'none',
    error,
    freshness: navFreshness(state, istDate(now())),
  });

  async function getNavHistory(schemeCodeRaw: string): Promise<NavServiceResult> {
    const code = schemeCodeSchema.safeParse(schemeCodeRaw);
    if (!code.success) {
      return { ...result(EMPTY, 'none', null), error: { code: 'INVALID_REQUEST', message: 'Scheme code must be 1–7 digits.', retryable: false } };
    }
    const key = navCacheKey(code.data);
    const prev = (await opts.cache.get<DatasetState<SchemeNavHistory>>(key))?.value ?? EMPTY;
    const nowMs = now().getTime();

    const fetchedAt = prev.provenance?.fetchedAt ? Date.parse(prev.provenance.fetchedAt) : NaN;
    if (prev.data && prev.lastError === null && nowMs - fetchedAt < freshTtlMs) return result(prev, 'cache', null);

    const lastAttempt = prev.lastAttemptAt ? Date.parse(prev.lastAttemptAt) : NaN;
    if (prev.lastError !== null && nowMs - lastAttempt < cooldownMs) {
      return result(prev, 'last-known-good', { code: 'UPSTREAM_UNAVAILABLE', message: prev.lastError, retryable: true });
    }

    return deduper.run(key, async () => {
      const at = now().toISOString();
      try {
        const history = await fetchHistory(String(code.data), { ...opts.fetchOptions, now });
        const next = applyFetchAttempt(prev, { ok: true, at, data: history, provenance: history.provenance });
        await opts.cache.set(key, next);
        return result(next, 'upstream', null);
      } catch (e) {
        const error = toDataError(e);
        const next = applyFetchAttempt(prev, { ok: false, at, error: error.message });
        await opts.cache.set(key, next);
        return result(next, 'last-known-good', error);
      }
    });
  }

  return { getNavHistory };
}
export type NavService = ReturnType<typeof createNavService>;
