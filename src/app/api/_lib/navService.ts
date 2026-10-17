import 'server-only';
import {
  DATA_ERROR_HTTP_STATUS,
  InMemoryCacheStore,
  RequestDeduper,
  createNavService,
  schemeCodeSchema,
  searchQuerySchema,
  searchSchemes,
  type DataError,
  type NavServiceResult,
} from '@/contracts/server';
import { fetchTimeoutMs } from './server';

/**
 * Route-side wiring of Agent 2's NAV service (cache → de-duplication → last-known-good).
 * One module-level instance per server instance; the in-memory store is lost on a cold start
 * until a shared store is provisioned (owner decision).
 */
const navService = createNavService({
  cache: new InMemoryCacheStore({ maxEntries: 200 }),
  fetchOptions: { timeoutMs: fetchTimeoutMs(), retries: 1 },
});

const SEARCH_TTL_MS = 60 * 60 * 1000;
const searchCache = new InMemoryCacheStore({ maxEntries: 300 });
const searchDeduper = new RequestDeduper();

export { schemeCodeSchema, searchQuerySchema };

export type NavOutcome =
  | { ok: true; result: NavServiceResult & { state: { data: NonNullable<NavServiceResult['state']['data']> } } }
  | { ok: false; status: number; code: string; message: string };

function failure(error: DataError | null): NavOutcome {
  const e = error ?? { code: 'INTERNAL' as const, message: 'NAV data is not available.', retryable: false };
  return { ok: false, status: DATA_ERROR_HTTP_STATUS[e.code], code: e.code, message: e.message };
}

/** Maps the service result: an error becomes an HTTP failure only when there is no data at all. */
export async function getNav(code: string): Promise<NavOutcome> {
  const r = await navService.getNavHistory(code);
  if (!r.state.data || !r.state.provenance) return failure(r.error);
  return { ok: true, result: r as Extract<NavOutcome, { ok: true }>['result'] };
}

/** The response envelope consumed by src/features/funds/ui/api.ts. */
export function navEnvelope(r: Extract<NavOutcome, { ok: true }>['result'], includeNavs: boolean) {
  const d = r.state.data;
  return {
    ok: true as const,
    meta: d.meta,
    ...(includeNavs ? { navs: d.navs } : {}),
    provenance: r.state.provenance,
    freshness: r.freshness,
    lastError: r.state.lastError,
    servedFrom: r.source as 'cache' | 'upstream' | 'last-known-good',
    droppedRows: d.droppedRows,
  };
}

type SearchResults = Awaited<ReturnType<typeof searchSchemes>>;

export async function search(q: string): Promise<{ ok: true; results: SearchResults } | { ok: false; status: number; code: string; message: string }> {
  const key = `search:v1:${q.toLowerCase()}`;
  const cached = await searchCache.get<SearchResults>(key);
  if (cached) return { ok: true, results: cached.value };
  try {
    const results = await searchDeduper.run(key, () => searchSchemes(q, { timeoutMs: fetchTimeoutMs(), retries: 1 }));
    await searchCache.set(key, results, SEARCH_TTL_MS);
    return { ok: true, results };
  } catch {
    return { ok: false, status: 502, code: 'UPSTREAM_UNAVAILABLE', message: 'The fund search provider could not be reached. Please try again shortly.' };
  }
}
