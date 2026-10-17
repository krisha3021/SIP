import { describe, expect, it, vi } from 'vitest';
import { InMemoryCacheStore } from '@/lib/data/cache';
import { RequestDeduper } from '@/lib/data/dedupe';
import { createNavService, istDate } from '@/lib/data/navService';
import { toDataError } from '@/lib/data/errors';
import { UpstreamError, parseNavHistory } from '@/lib/data/mfapi';
import { backtestScheme, checkBacktestEligibility, rollingReturnsForScheme } from '@/lib/data/eligibility';
import { businessDaySeries, mfapiHistoryFixture } from '../finance/fixtures';

const clock = (iso: string) => {
  let t = Date.parse(iso);
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('in-memory cache store', () => {
  it('expires entries by TTL using the injected clock', async () => {
    const c = clock('2026-10-17T00:00:00Z');
    const store = new InMemoryCacheStore({ now: c.now });
    await store.set('k', { a: 1 }, 1_000);
    expect((await store.get<{ a: number }>('k'))?.value).toEqual({ a: 1 });
    c.advance(1_000);
    expect(await store.get('k')).toBeNull();
  });

  it('evicts the least recently used entry and returns copies', async () => {
    const store = new InMemoryCacheStore({ maxEntries: 2 });
    await store.set('a', [1]);
    await store.set('b', [2]);
    await store.get('a'); // a is now most recent
    await store.set('c', [3]);
    expect(await store.get('b')).toBeNull();
    const a = await store.get<number[]>('a');
    a!.value.push(99);
    expect((await store.get<number[]>('a'))!.value).toEqual([1]);
  });
});

describe('request de-duplication', () => {
  it('shares one in-flight promise per key and forgets it once settled', async () => {
    const d = new RequestDeduper();
    let resolve!: (v: number) => void;
    const fn = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const p1 = d.run('k', fn);
    const p2 = d.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    resolve(7);
    expect(await Promise.all([p1, p2])).toEqual([7, 7]);
    expect(d.pending).toBe(0);
    await d.run('k', async () => 8);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const d = new RequestDeduper();
    await expect(d.run('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(d.run('k', async () => 1)).resolves.toBe(1);
  });
});

describe('NAV service: cache, de-duplication and last-known-good', () => {
  const setup = (fetchImpl: typeof fetch) => {
    const c = clock('2026-10-17T09:00:00Z');
    const cache = new InMemoryCacheStore({ now: c.now });
    const svc = createNavService({ cache, now: c.now, fetchOptions: { fetchImpl, retries: 0 } });
    return { c, cache, svc };
  };

  it('serves from cache within the TTL without contacting the provider', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(mfapiHistoryFixture));
    const { svc, c } = setup(fetchImpl);
    const first = await svc.getNavHistory('999001');
    expect(first.source).toBe('upstream');
    expect(first.state.provenance?.observedAt).toBe('2026-10-16');
    expect(first.freshness).toBe('latest-nav');
    c.advance(60 * 60_000);
    const second = await svc.getNavHistory('999001');
    expect(second.source).toBe('cache');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent requests into one upstream call', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(mfapiHistoryFixture));
    const { svc } = setup(fetchImpl);
    const results = await Promise.all([svc.getNavHistory('999001'), svc.getNavHistory('999001'), svc.getNavHistory('999001')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.state.data?.navs.length === 3)).toBe(true);
  });

  it('provider outage: keeps last-known-good data without advancing freshness, then cools down', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementationOnce(async () => json(mfapiHistoryFixture));
    const { svc, c } = setup(fetchImpl);
    const good = await svc.getNavHistory('999001');
    const fetchedAt = good.state.provenance!.fetchedAt;

    fetchImpl.mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    c.advance(7 * 3_600_000); // past the 6-hour TTL
    const outage = await svc.getNavHistory('999001');
    expect(outage.source).toBe('last-known-good');
    expect(outage.error?.code).toBe('UPSTREAM_TIMEOUT');
    expect(outage.state.data?.navs).toEqual(good.state.data?.navs);
    expect(outage.state.provenance?.observedAt).toBe('2026-10-16');
    expect(outage.state.provenance?.fetchedAt).toBe(fetchedAt);
    expect(outage.state.provenance?.classification).toBe('cached');
    expect(outage.freshness).toBe('stale');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    c.advance(10_000); // inside the 60-second cool-down
    const again = await svc.getNavHistory('999001');
    expect(again.source).toBe('last-known-good');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('with no prior data an outage yields "none" and "unavailable"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const { svc } = setup(fetchImpl);
    const r = await svc.getNavHistory('999001');
    expect(r.source).toBe('none');
    expect(r.freshness).toBe('unavailable');
    expect(r.error?.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('rejects an invalid scheme code without any upstream request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { svc } = setup(fetchImpl);
    const r = await svc.getNavHistory('../../etc');
    expect(r.error?.code).toBe('INVALID_REQUEST');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an invalid payload is never stored as data', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ unexpected: true }));
    const { svc, cache } = setup(fetchImpl);
    const r = await svc.getNavHistory('999001');
    expect(r.error?.code).toBe('INVALID_PAYLOAD');
    expect(r.state.data).toBeNull();
    expect((await cache.get<{ data: unknown }>('nav:v1:999001'))?.value.data).toBeNull();
  });
});

describe('structured data errors and IST date', () => {
  it('maps upstream errors to stable codes without leaking details', () => {
    expect(toDataError(new UpstreamError('x', 'http', 429))).toMatchObject({ code: 'UPSTREAM_HTTP', retryable: true, upstreamStatus: 429 });
    expect(toDataError(new UpstreamError('x', 'http', 403))).toMatchObject({ retryable: false });
    expect(toDataError(new UpstreamError('x', 'not-found', 404)).code).toBe('NOT_FOUND');
    expect(toDataError(new UpstreamError('x', 'cancelled')).code).toBe('CANCELLED');
    expect(toDataError(new Error('secret stack')).message).not.toMatch(/secret/);
  });
  it('uses the calendar date in India', () => {
    expect(istDate(new Date('2026-10-16T18:29:59Z'))).toBe('2026-10-16');
    expect(istDate(new Date('2026-10-16T18:30:00Z'))).toBe('2026-10-17');
  });
});

describe('backtest plan/option eligibility', () => {
  const history = (name: string) => {
    const h = parseNavHistory({ ...mfapiHistoryFixture, meta: { ...mfapiHistoryFixture.meta, scheme_name: name } }, '2026-10-17T00:00:00Z');
    return { ...h, navs: businessDaySeries('2020-01-01', '2023-12-31', (_d, i) => 10 + i * 0.01) };
  };
  const input = { amount: 1_000, startDate: '2020-02-01', endDate: '2023-12-31' };

  it('refuses IDCW options with an explanation', () => {
    const r = backtestScheme(history('X Fund - Direct Plan - IDCW Payout'), input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('UNSUPPORTED');
      expect(r.error.message).toMatch(/distribution/);
    }
    expect(rollingReturnsForScheme(history('X Fund - Direct Plan - IDCW'), 1).ok).toBe(false);
  });

  it('refuses an unidentified option', () => {
    const r = checkBacktestEligibility({ plan: 'Direct', option: 'Unknown' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNSUPPORTED');
  });

  it('runs for Growth options and warns when the plan is unknown', () => {
    const r = backtestScheme(history('X Fund - Growth'), input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(' ')).toMatch(/plan \(Direct or Regular\) could not be identified/);
    expect(backtestScheme(history('X Fund - Direct Plan - Growth'), input).ok).toBe(true);
  });
});
