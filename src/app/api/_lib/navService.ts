import 'server-only';
import { applyFetchAttempt, navFreshness, type DatasetState, type FreshnessState, type Provenance } from '@/contracts';
// The MFAPI adapter is Agent 2's server-side data module. It is not re-exported by @/contracts yet
// (open item: route response envelopes / adapter exports). Only these route helpers import it.
import { fetchNavHistory, searchSchemes, schemeCodeSchema, searchQuerySchema, UpstreamError, type SchemeNavHistory } from '@/lib/data/mfapi';
import { TtlCache, fetchTimeoutMs, todayInIndia } from './server';

const NAV_TTL_MS = 30 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 60 * 1000;

const navCache = new TtlCache<SchemeNavHistory>(NAV_TTL_MS, 100);
const searchCache = new TtlCache<Awaited<ReturnType<typeof searchSchemes>>>(SEARCH_TTL_MS, 300);

export type NavOutcome =
  | {
      ok: true;
      data: SchemeNavHistory;
      provenance: Provenance;
      freshness: FreshnessState;
      lastError: string | null;
      servedFrom: 'upstream' | 'cache' | 'last-known-good';
    }
  | { ok: false; status: number; code: string; message: string };

export { schemeCodeSchema, searchQuerySchema };

function upstreamStatus(e: UpstreamError): { status: number; code: string; message: string } {
  switch (e.kind) {
    case 'not-found':
      return { status: 404, code: 'NOT_FOUND', message: 'The provider has no NAV data for this scheme code.' };
    case 'timeout':
      return { status: 504, code: 'UPSTREAM_TIMEOUT', message: 'The NAV provider did not respond in time. Please try again shortly.' };
    case 'invalid-response':
      return { status: 502, code: 'UPSTREAM_INVALID', message: 'The NAV provider returned data in an unexpected format.' };
    default:
      return { status: 502, code: 'UPSTREAM_ERROR', message: 'The NAV provider could not be reached.' };
  }
}

export async function getNav(code: number): Promise<NavOutcome> {
  const key = String(code);
  const today = todayInIndia();
  const cached = navCache.fresh(key);
  if (cached) {
    const state: DatasetState<unknown> = { data: cached.navs, provenance: cached.provenance, lastAttemptAt: cached.provenance.fetchedAt, lastError: null };
    return { ok: true, data: cached, provenance: cached.provenance, freshness: navFreshness(state, today), lastError: null, servedFrom: 'cache' };
  }

  const prevEntry = navCache.peek(key);
  const prev: DatasetState<SchemeNavHistory> = prevEntry
    ? { data: prevEntry.value, provenance: prevEntry.value.provenance, lastAttemptAt: prevEntry.value.provenance.fetchedAt, lastError: null }
    : { data: null, provenance: null, lastAttemptAt: null, lastError: null };

  try {
    const fresh = await navCache.dedupe(key, () => fetchNavHistory(key, { timeoutMs: fetchTimeoutMs(), retries: 1 }));
    navCache.set(key, fresh);
    const state = applyFetchAttempt(prev, { ok: true, at: new Date().toISOString(), data: fresh, provenance: fresh.provenance });
    return { ok: true, data: fresh, provenance: fresh.provenance, freshness: navFreshness(state, today), lastError: null, servedFrom: 'upstream' };
  } catch (e) {
    const err = e instanceof UpstreamError ? e : new UpstreamError('Could not reach provider', 'network');
    const state = applyFetchAttempt(prev, { ok: false, at: new Date().toISOString(), error: err.message });
    if (state.data && state.provenance) {
      // A failed fetch never advances freshness: we serve the last good copy with its original dates.
      return { ok: true, data: state.data, provenance: state.provenance, freshness: navFreshness(state, today), lastError: state.lastError, servedFrom: 'last-known-good' };
    }
    return { ok: false, ...upstreamStatus(err) };
  }
}

export async function search(q: string) {
  const key = q.toLowerCase();
  const cached = searchCache.fresh(key);
  if (cached) return { ok: true as const, results: cached };
  try {
    const results = await searchCache.dedupe(key, () => searchSchemes(q, { timeoutMs: fetchTimeoutMs(), retries: 1 }));
    searchCache.set(key, results);
    return { ok: true as const, results };
  } catch (e) {
    const err = e instanceof UpstreamError ? e : new UpstreamError('Could not reach provider', 'network');
    return { ok: false as const, ...upstreamStatus(err) };
  }
}
