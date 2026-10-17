import { describe, expect, it, vi } from 'vitest';
import { applyFetchAttempt, navFreshness, type DatasetState, type Provenance } from '@/lib/data/provenance';
import {
  MFAPI_BASE,
  UpstreamError,
  fetchNavHistory,
  inferPlanOption,
  parseNavHistory,
  schemeCodeSchema,
  searchQuerySchema,
  searchSchemes,
} from '@/lib/data/mfapi';
import { mfapiHistoryFixture } from '../finance/fixtures';

const prov = (observedAt: string, fetchedAt: string): Provenance => ({
  provider: 'test',
  providerUrl: 'https://example.invalid',
  identifier: '1',
  observedAt,
  fetchedAt,
  coverage: { from: '2020-01-01', to: observedAt, observations: 10 },
  plan: 'Direct',
  option: 'Growth',
  currency: 'INR',
  units: 'INR per unit',
  classification: 'observed',
  notes: [],
});

describe('freshness and provenance', () => {
  const prev: DatasetState<number[]> = {
    data: [1, 2, 3],
    provenance: prov('2026-10-14', '2026-10-14T18:00:00.000Z'),
    lastAttemptAt: '2026-10-14T18:00:00.000Z',
    lastError: null,
  };

  it('a failed fetch does not move the observation date or the last successful fetch time', () => {
    const next = applyFetchAttempt(prev, { ok: false, at: '2026-10-17T09:00:00.000Z', error: 'timeout' });
    expect(next.provenance?.observedAt).toBe('2026-10-14');
    expect(next.provenance?.fetchedAt).toBe('2026-10-14T18:00:00.000Z');
    expect(next.provenance?.classification).toBe('cached');
    expect(next.data).toEqual([1, 2, 3]);
    expect(next.lastError).toBe('timeout');
    expect(next.lastAttemptAt).toBe('2026-10-17T09:00:00.000Z');
  });

  it('a failed fetch with no prior data stays unavailable', () => {
    const empty: DatasetState<number[]> = { data: null, provenance: null, lastAttemptAt: null, lastError: null };
    const next = applyFetchAttempt(empty, { ok: false, at: '2026-10-17T09:00:00.000Z', error: 'down' });
    expect(navFreshness(next, '2026-10-17')).toBe('unavailable');
  });

  it('a successful fetch replaces data and provenance', () => {
    const next = applyFetchAttempt(prev, {
      ok: true,
      at: '2026-10-17T09:00:00.000Z',
      data: [4],
      provenance: prov('2026-10-16', '2026-10-17T09:00:00.000Z'),
    });
    expect(next.provenance?.observedAt).toBe('2026-10-16');
    expect(next.lastError).toBeNull();
  });

  it('classifies NAV freshness from the observation date only', () => {
    const recent = { ...prev, provenance: prov('2026-10-16', '2026-10-16T20:00:00Z') };
    expect(navFreshness(recent, '2026-10-17')).toBe('latest-nav'); // Friday NAV seen on Saturday
    expect(navFreshness(recent, '2026-10-19')).toBe('latest-nav'); // Monday: one business day
    expect(navFreshness(prev, '2026-10-30')).toBe('stale');
    expect(navFreshness({ ...recent, lastError: 'x' }, '2026-10-17')).toBe('stale');
  });
});

describe('MFAPI adapter', () => {
  it('parses a response, sorts ascending, drops malformed rows and records provenance', () => {
    const h = parseNavHistory(mfapiHistoryFixture, '2026-10-17T09:00:00.000Z');
    expect(h.navs.map((n) => n.date)).toEqual(['2026-10-13', '2026-10-15', '2026-10-16']);
    expect(h.droppedRows).toBe(2); // 'N.A.' and an impossible date
    expect(h.provenance.observedAt).toBe('2026-10-16');
    expect(h.provenance.fetchedAt).toBe('2026-10-17T09:00:00.000Z');
    expect(h.provenance.coverage).toEqual({ from: '2026-10-13', to: '2026-10-16', observations: 3 });
    expect(h.provenance.plan).toBe('Direct');
    expect(h.provenance.option).toBe('Growth');
    expect(h.provenance.provider).not.toMatch(/official/i);
  });

  it('rejects a response that does not match the schema', () => {
    expect(() => parseNavHistory({ foo: 1 }, 'x')).toThrow(UpstreamError);
  });

  it('infers plan/option conservatively', () => {
    expect(inferPlanOption('X Fund - Regular Plan - IDCW Payout')).toEqual({ plan: 'Regular', option: 'IDCW' });
    expect(inferPlanOption('X Fund')).toEqual({ plan: 'Unknown', option: 'Unknown' });
  });

  it('validates scheme codes and search queries', () => {
    expect(schemeCodeSchema.safeParse('122639').success).toBe(true);
    for (const bad of ['', 'abc', '12345678', '../etc', '1;2', 'http://evil']) {
      expect(schemeCodeSchema.safeParse(bad).success).toBe(false);
    }
    expect(searchQuerySchema.safeParse('a').success).toBe(false);
    expect(searchQuerySchema.safeParse('x'.repeat(81)).success).toBe(false);
    expect(searchQuerySchema.safeParse('<script>').success).toBe(false);
    expect(searchQuerySchema.safeParse('Parag Parikh Flexi').success).toBe(true);
  });

  it('only ever requests the fixed upstream base URL', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(mfapiHistoryFixture), { status: 200 }));
    await fetchNavHistory('999001', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${MFAPI_BASE}/mf/999001`);
    await expect(fetchNavHistory('https://evil.example', { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('oops', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mfapiHistoryFixture), { status: 200 }));
    const h = await fetchNavHistory('999001', { fetchImpl, retries: 1 });
    expect(h.navs.length).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces timeouts, 404s and malformed JSON as typed upstream errors', async () => {
    const timeout = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(fetchNavHistory('1', { fetchImpl: timeout, retries: 0 })).rejects.toMatchObject({ kind: 'timeout' });

    const notFound = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchNavHistory('1', { fetchImpl: notFound })).rejects.toMatchObject({ kind: 'not-found' });
    expect(notFound).toHaveBeenCalledTimes(1);

    const garbage = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(fetchNavHistory('1', { fetchImpl: garbage })).rejects.toMatchObject({ kind: 'invalid-response' });

    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(fetchNavHistory('1', { fetchImpl: down, retries: 2 })).rejects.toMatchObject({ kind: 'network' });
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('search caps results and annotates plan/option', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ schemeCode: i + 1, schemeName: `Fund ${i} - Direct Plan - Growth` }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }));
    const res = await searchSchemes('fund', { fetchImpl });
    expect(res.length).toBe(50);
    expect(res[0]).toMatchObject({ plan: 'Direct', option: 'Growth' });
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe(`${MFAPI_BASE}/mf/search?q=fund`);
  });
});
