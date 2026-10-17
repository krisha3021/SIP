/**
 * MFAPI (https://www.mfapi.in) adapter — server-side only.
 *
 * MFAPI is an independent third-party service that republishes AMFI NAV data. It is NOT an official
 * AMFI service. See docs/DATA-SOURCES.md for terms, reliability, and redistribution caveats.
 *
 * Security: request URLs are built only from a fixed base URL plus a validated numeric scheme
 * code or an encoded, length-limited search query. This module never proxies arbitrary URLs.
 */
import { z } from 'zod';
import { ddmmyyyyToIso } from '../finance/dates';
import type { NavPoint } from '../finance/navSeries';
import type { Provenance } from './provenance';

export const MFAPI_BASE = 'https://api.mfapi.in' as const;
export const PROVIDER_NAME = 'MFAPI.in (third-party mirror of AMFI NAV data)';

export const schemeCodeSchema = z
  .string()
  .regex(/^\d{1,7}$/, 'Scheme code must be 1–7 digits')
  .transform(Number);

export const searchQuerySchema = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(80, 'Search is limited to 80 characters')
  .regex(/^[\p{L}\p{N} .&()'\-/]+$/u, 'Search contains unsupported characters');

const navHistorySchema = z.object({
  meta: z.object({
    fund_house: z.string().nullable().optional(),
    scheme_type: z.string().nullable().optional(),
    scheme_category: z.string().nullable().optional(),
    scheme_code: z.union([z.number(), z.string()]),
    scheme_name: z.string(),
    isin_growth: z.string().nullable().optional(),
    isin_div_reinvestment: z.string().nullable().optional(),
  }),
  data: z.array(z.object({ date: z.string(), nav: z.string() })),
  status: z.string().optional(),
});

const searchResultSchema = z.array(z.object({ schemeCode: z.number(), schemeName: z.string() })).max(5000);

export interface SchemeMeta {
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

export interface SchemeNavHistory {
  meta: SchemeMeta;
  navs: NavPoint[];
  provenance: Provenance;
  droppedRows: number;
}

/** Plan and option inferred from the scheme name. Returns 'Unknown' rather than guessing. */
export function inferPlanOption(name: string): { plan: Provenance['plan']; option: Provenance['option'] } {
  const n = name.toLowerCase();
  const plan = /\bdirect\b/.test(n) ? 'Direct' : /\bregular\b/.test(n) ? 'Regular' : 'Unknown';
  const option = /\bgrowth\b/.test(n)
    ? 'Growth'
    : /\b(idcw|dividend|payout|reinvest(ment)?|bonus)\b/.test(n)
      ? 'IDCW'
      : 'Unknown';
  return { plan, option };
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'http' | 'invalid-response' | 'not-found',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  now?: () => Date;
}

async function getJson(path: string, opts: FetchOptions): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = Math.min(15_000, Math.max(2_000, opts.timeoutMs ?? 8_000));
  const retries = Math.min(2, Math.max(0, opts.retries ?? 1));
  const url = `${MFAPI_BASE}${path}`;
  let lastErr: UpstreamError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json', 'User-Agent': 'Lakshya/0.1 (educational)' },
        cache: 'no-store',
      });
      if (res.status === 404) throw new UpstreamError('Scheme not found at provider', 'not-found', 404);
      if (!res.ok) {
        lastErr = new UpstreamError(`Provider responded with HTTP ${res.status}`, 'http', res.status);
        if (res.status >= 500 || res.status === 429) continue;
        throw lastErr;
      }
      try {
        return await res.json();
      } catch {
        throw new UpstreamError('Provider returned malformed JSON', 'invalid-response');
      }
    } catch (e) {
      if (e instanceof UpstreamError && (e.kind === 'not-found' || e.kind === 'invalid-response' || (e.kind === 'http' && (e.status ?? 0) < 500 && e.status !== 429))) throw e;
      const name = (e as { name?: string })?.name;
      lastErr =
        e instanceof UpstreamError
          ? e
          : name === 'TimeoutError' || name === 'AbortError'
            ? new UpstreamError(`Provider did not respond within ${timeoutMs} ms`, 'timeout')
            : new UpstreamError('Could not reach provider', 'network');
    }
  }
  throw lastErr ?? new UpstreamError('Could not reach provider', 'network');
}

export function parseNavHistory(json: unknown, fetchedAt: string): SchemeNavHistory {
  const parsed = navHistorySchema.safeParse(json);
  if (!parsed.success) throw new UpstreamError('Provider response did not match the expected format', 'invalid-response');
  const { meta, data } = parsed.data;
  if (data.length === 0) throw new UpstreamError('Provider returned no NAV observations for this scheme', 'not-found');

  let dropped = 0;
  const navs: NavPoint[] = [];
  for (const row of data) {
    const date = ddmmyyyyToIso(row.date);
    const nav = Number(row.nav);
    if (!date || !Number.isFinite(nav) || nav <= 0) {
      dropped++;
      continue;
    }
    navs.push({ date, nav });
  }
  navs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (navs.length === 0) throw new UpstreamError('No valid NAV observations', 'invalid-response');

  const schemeCode = Number(meta.scheme_code);
  const { plan, option } = inferPlanOption(meta.scheme_name);
  const first = navs[0]!;
  const last = navs[navs.length - 1]!;
  const notes = ['NAV is per unit, in INR, as published by the AMC via AMFI and republished by MFAPI.'];
  if (dropped) notes.push(`${dropped} malformed row(s) from the provider were ignored.`);

  return {
    meta: {
      schemeCode,
      schemeName: meta.scheme_name,
      fundHouse: meta.fund_house ?? null,
      category: meta.scheme_category ?? null,
      schemeType: meta.scheme_type ?? null,
      isinGrowth: meta.isin_growth ?? null,
      isinReinvestment: meta.isin_div_reinvestment ?? null,
      plan,
      option,
    },
    navs,
    droppedRows: dropped,
    provenance: {
      provider: PROVIDER_NAME,
      providerUrl: `${MFAPI_BASE}/mf/${schemeCode}`,
      identifier: `AMFI scheme code ${schemeCode}`,
      observedAt: last.date,
      fetchedAt,
      coverage: { from: first.date, to: last.date, observations: navs.length },
      plan,
      option,
      currency: 'INR',
      units: 'INR per unit',
      classification: 'observed',
      notes,
    },
  };
}

export async function fetchNavHistory(schemeCodeRaw: string, opts: FetchOptions = {}): Promise<SchemeNavHistory> {
  const code = schemeCodeSchema.parse(schemeCodeRaw);
  const json = await getJson(`/mf/${code}`, opts);
  return parseNavHistory(json, (opts.now?.() ?? new Date()).toISOString());
}

export async function searchSchemes(
  queryRaw: string,
  opts: FetchOptions = {},
): Promise<Array<{ schemeCode: number; schemeName: string; plan: Provenance['plan']; option: Provenance['option'] }>> {
  const q = searchQuerySchema.parse(queryRaw);
  const json = await getJson(`/mf/search?q=${encodeURIComponent(q)}`, opts);
  const parsed = searchResultSchema.safeParse(json);
  if (!parsed.success) throw new UpstreamError('Provider search response did not match the expected format', 'invalid-response');
  return parsed.data.slice(0, 50).map((r) => ({ ...r, ...inferPlanOption(r.schemeName) }));
}
