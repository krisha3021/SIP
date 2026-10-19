import { describe, expect, it, vi } from 'vitest';
import { parseAmfiTerRows, parseAmfiAaumRows, createAmfiResearchProvider } from '@/lib/data/research/amfi';
import { buildFundProfile, RESEARCH_FIELD_KEYS } from '@/lib/data/research/profile';
import type { SchemeIdentity } from '@/lib/data/identity';

/**
 * FIXTURES — synthetic rows in Lakshya's normalised AMFI shape. The real AMFI export layout must be confirmed against
 * AMFI's published data once written reuse permission is held (docs/DATA-SOURCES.md). Values are not real data.
 */
const TER_ROWS = [
  { amfiSchemeCode: 122639, schemeName: 'Fixture Flexi Cap Fund', effectiveDate: '2026-10-01', directTotalTerPct: 0.63, regularTotalTerPct: 1.32 },
  { amfiSchemeCode: 500001, schemeName: 'Fixture Other Fund', effectiveDate: '2026-10-01', directTotalTerPct: 0.4, regularTotalTerPct: 1.1 },
];
const AAUM_ROWS = [{ amfiSchemeCode: 122639, schemeName: 'Fixture Flexi Cap Fund', quarterLabel: 'Jul–Sep 2026', periodEnd: '2026-09-30', aaumCrore: 98765.43 }];

const direct: SchemeIdentity = {
  schemeId: 122639,
  schemeName: 'Fixture Flexi Cap Fund - Direct Plan - Growth',
  amc: 'Fixture AMC',
  assetClass: 'Equity',
  subcategory: 'Flexi Cap Fund',
  schemeType: 'Open Ended Schemes',
  planType: 'Direct',
  optionType: 'Growth',
  isin: null,
  isinStatus: 'missing',
};
const regular: SchemeIdentity = { ...direct, schemeName: 'Fixture Flexi Cap Fund - Regular Plan - Growth', planType: 'Regular' };
const NOW = '2026-10-19T04:00:00.000Z';

describe('AMFI TER parser', () => {
  it('takes the Direct TER for a Direct record and the Regular TER for a Regular record — never the other', () => {
    const d = parseAmfiTerRows(TER_ROWS, direct, NOW, 'https://www.amfiindia.com/ter-of-mf-schemes');
    expect(d).toMatchObject({ status: 'available', value: 0.63, unit: 'percent', scope: 'plan', plan_type: 'Direct', observation_date: '2026-10-01', provider: 'AMFI' });
    const r = parseAmfiTerRows(TER_ROWS, regular, NOW, 'https://www.amfiindia.com/ter-of-mf-schemes');
    expect(r).toMatchObject({ value: 1.32, plan_type: 'Regular' });
  });
  it('marks an ambiguous match invalid instead of guessing', () => {
    const dup = [...TER_ROWS, { ...TER_ROWS[0]!, directTotalTerPct: 0.7 }];
    const f = parseAmfiTerRows(dup, direct, NOW, 'u');
    expect(f.status).toBe('not-available');
    expect(f.validation_status).toBe('invalid');
    expect(f.value).toBeNull();
    expect(f.reason).toMatch(/ambiguous/i);
  });
  it('reports a missing scheme as not available', () => {
    const f = parseAmfiTerRows(TER_ROWS, { ...direct, schemeId: 999 }, NOW, 'u');
    expect(f).toMatchObject({ status: 'not-available', value: null });
  });
  it('rejects an invalid payload', () => {
    const f = parseAmfiTerRows([{ amfiSchemeCode: 'x' }], direct, NOW, 'u');
    expect(f).toMatchObject({ status: 'not-available', validation_status: 'invalid', value: null });
  });
  it('rejects a TER given as a fraction above 100 or with too many decimals', () => {
    const f = parseAmfiTerRows([{ ...TER_ROWS[0]!, directTotalTerPct: 0.123456 }], direct, NOW, 'u');
    expect(f.validation_status).toBe('invalid');
  });
});

describe('AMFI AAUM parser', () => {
  it('returns scheme-wide average AUM in ₹ crore for a named quarter, not "current AUM"', () => {
    const f = parseAmfiAaumRows(AAUM_ROWS, direct, NOW, 'u');
    expect(f).toMatchObject({ value: 98765.43, unit: 'inr-crore', currency: 'INR', scope: 'scheme-aaum', plan_type: 'Unknown', option_type: 'Unknown', observation_date: '2026-09-30' });
    expect(f.reason).toMatch(/average AUM for Jul–Sep 2026/);
  });
});

describe('AMFI research provider gate', () => {
  it('is disabled and never fetches while AMFI_REUSE_APPROVED is not "true"', async () => {
    const fetchImpl = vi.fn();
    const p = createAmfiResearchProvider({ env: {}, fetchImpl, now: () => new Date(NOW) });
    expect(p.status()).toMatchObject({ state: 'disabled-awaiting-permission' });
    const fields = await p.fetch(direct);
    expect(fields.ter).toMatchObject({ status: 'blocked-licensing', value: null, license_or_usage_status: 'awaiting-permission' });
    expect(fields.aaum).toMatchObject({ status: 'blocked-licensing', value: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('is not-configured when approved but the owner has not confirmed the data URLs', async () => {
    const fetchImpl = vi.fn();
    const p = createAmfiResearchProvider({ env: { AMFI_REUSE_APPROVED: 'true' }, fetchImpl, now: () => new Date(NOW) });
    expect(p.status().state).toBe('not-configured');
    expect((await p.fetch(direct)).ter?.status).toBe('not-configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('refuses data URLs outside the AMFI host allowlist', () => {
    const p = createAmfiResearchProvider({ env: { AMFI_REUSE_APPROVED: 'true', AMFI_TER_DATA_URL: 'https://evil.example/ter.json', AMFI_AAUM_DATA_URL: 'https://www.amfiindia.com/a.json' }, fetchImpl: vi.fn(), now: () => new Date(NOW) });
    expect(p.status()).toMatchObject({ state: 'not-configured' });
    expect(p.status().reason).toMatch(/allowlist/i);
  });
  it('when approved and configured, fetches each URL once and returns provenanced fields', async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('ter') ? TER_ROWS : AAUM_ROWS), { status: 200 }));
    const p = createAmfiResearchProvider({
      env: { AMFI_REUSE_APPROVED: 'true', AMFI_TER_DATA_URL: 'https://www.amfiindia.com/ter.json', AMFI_AAUM_DATA_URL: 'https://www.amfiindia.com/aaum.json' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date(NOW),
    });
    expect(p.status().state).toBe('active');
    const f = await p.fetch(direct);
    expect(f.ter).toMatchObject({ value: 0.63, retrieved_at: NOW, license_or_usage_status: 'permitted', source_url: 'https://www.amfiindia.com/ter.json' });
    expect(f.aaum).toMatchObject({ value: 98765.43 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('an upstream failure yields not-available with a reason, never a stale value presented as current', async () => {
    const p = createAmfiResearchProvider({
      env: { AMFI_REUSE_APPROVED: 'true', AMFI_TER_DATA_URL: 'https://www.amfiindia.com/ter.json', AMFI_AAUM_DATA_URL: 'https://www.amfiindia.com/aaum.json' },
      fetchImpl: (async () => new Response('down', { status: 503 })) as unknown as typeof fetch,
      now: () => new Date(NOW),
      retries: 0,
    });
    const f = await p.fetch(direct);
    expect(f.ter).toMatchObject({ status: 'not-available', value: null });
    expect(f.ter?.reason).toMatch(/503/);
  });
});

describe('buildFundProfile', () => {
  it('returns every research field key, each with a value only when a provider supplied one', async () => {
    const profile = await buildFundProfile(direct, { env: {}, fetchImpl: vi.fn(), now: () => new Date(NOW) });
    expect(Object.keys(profile.fields).sort()).toEqual([...RESEARCH_FIELD_KEYS].sort());
    for (const f of Object.values(profile.fields)) expect(f.value).toBeNull();
    expect(profile.fields.rating).toMatchObject({ status: 'not-configured' });
    expect(profile.fields.rating.reason).toMatch(/licen/i);
    expect(profile.fields.holdings.reason).toMatch(/portfolio disclosure/i);
    expect(profile.providers.map((p) => p.id)).toEqual(expect.arrayContaining(['amfi', 'ratings', 'documents']));
  });
});

describe('review fix — AMFI timeout applies even when a caller signal is passed', () => {
  it('gives up after timeoutMs although the request signal never aborts', async () => {
    const hang = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))));
    const p = createAmfiResearchProvider({
      env: { AMFI_REUSE_APPROVED: 'true', AMFI_TER_DATA_URL: 'https://www.amfiindia.com/ter.json', AMFI_AAUM_DATA_URL: 'https://www.amfiindia.com/aaum.json' },
      fetchImpl: hang as unknown as typeof fetch,
      now: () => new Date(NOW),
      timeoutMs: 50,
      retries: 0,
    });
    const neverAborts = new AbortController().signal;
    const f = await p.fetch(direct, neverAborts);
    expect(f.ter).toMatchObject({ status: 'not-available', value: null });
    expect(f.ter?.reason).toMatch(/did not respond in time/);
  }, 2000);
});
