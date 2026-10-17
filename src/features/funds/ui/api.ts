/** Typed client for Lakshya's own /api/funds routes. The browser never calls the provider directly. */
import type { FreshnessState, NavPoint, Provenance } from '@/contracts';

export interface SchemeMetaDto {
  schemeCode: number;
  schemeName: string;
  fundHouse: string | null;
  category: string | null;
  schemeType: string | null;
  isinGrowth: string | null;
  isinReinvestment: string | null;
  plan: Provenance['plan'];
  option: Provenance['option'];
}

export interface SearchResultDto {
  schemeCode: number;
  schemeName: string;
  plan: Provenance['plan'];
  option: Provenance['option'];
}

export interface NavResponse {
  ok: true;
  meta: SchemeMetaDto;
  navs: NavPoint[];
  provenance: Provenance;
  freshness: FreshnessState;
  lastError: string | null;
  servedFrom: 'upstream' | 'cache' | 'last-known-good';
  droppedRows: number;
}

export interface SearchResponse {
  ok: true;
  query: string;
  provider: string;
  results: SearchResultDto[];
}

export type ApiFailure = { ok: false; error: { code: string; message: string } };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | ApiFailure> {
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const body = (await res.json().catch(() => null)) as T | ApiFailure | null;
    if (!body) return { ok: false, error: { code: 'BAD_RESPONSE', message: `Unexpected response (HTTP ${res.status}).` } };
    return body;
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw e;
    return { ok: false, error: { code: 'NETWORK', message: 'Could not reach Lakshya’s server. Check your connection and try again.' } };
  }
}

export const searchFunds = (q: string, signal?: AbortSignal) => getJson<SearchResponse>(`/api/funds/search?q=${encodeURIComponent(q)}`, signal);
export const fetchNav = (code: number | string, signal?: AbortSignal) => getJson<NavResponse>(`/api/funds/${encodeURIComponent(String(code))}/nav`, signal);

/** Display labels for freshness states (docs/CONTRACTS.md rule 6). */
export function freshnessLabel(f: FreshnessState, p: Provenance, servedFrom: NavResponse['servedFrom']): { label: string; tone: 'brand' | 'warning' | 'danger' | 'info' } {
  if (servedFrom === 'last-known-good') return { label: `Cached — last updated ${p.fetchedAt ? formatTimestamp(p.fetchedAt) : 'unknown'}`, tone: 'warning' };
  switch (f) {
    case 'latest-nav':
      return { label: `Latest available NAV · ${p.observedAt}`, tone: 'brand' };
    case 'end-of-day':
      return { label: `End-of-day NAV · ${p.observedAt}`, tone: 'brand' };
    case 'stale':
      return { label: `Stale — newest NAV is from ${p.observedAt}`, tone: 'warning' };
    case 'delayed':
      return { label: `Delayed — as of ${p.observedAt}`, tone: 'warning' };
    case 'historical':
      return { label: 'Historical data', tone: 'info' };
    case 'synthetic':
      return { label: 'Synthetic simulation', tone: 'info' };
    default:
      return { label: 'Not available', tone: 'danger' };
  }
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) + ' IST';
}
