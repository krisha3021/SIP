import { describe, expect, it } from 'vitest';
import { InMemoryCacheStore, InMemoryMfDataStore } from '@/contracts/server';
import { TieredCacheStore, UpstashCacheStore, UpstashClient, UpstashMfDataStore } from '@/app/api/_lib/storage/upstash';
import { upstashConfigFromEnv } from '@/app/api/_lib/storage';

/** Minimal in-process stand-in for Upstash's REST /pipeline endpoint, covering only the commands the adapter uses. */
function fakeUpstash() {
  const kv = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const lists = new Map<string, string[]>();
  const calls: string[][] = [];
  const exec = (c: string[]): unknown => {
    const [op, k = '', ...rest] = c;
    switch (op) {
      case 'GET':
        return kv.get(k) ?? null;
      case 'SET': {
        const nx = rest.includes('NX');
        const xx = rest.includes('XX');
        if ((nx && kv.has(k)) || (xx && !kv.has(k))) return null;
        kv.set(k, rest[0]!);
        return 'OK';
      }
      case 'DEL':
        return kv.delete(k) ? 1 : 0;
      case 'HSETNX': {
        const h = hashes.get(k) ?? new Map<string, string>();
        hashes.set(k, h);
        if (h.has(rest[0]!)) return 0;
        h.set(rest[0]!, rest[1]!);
        return 1;
      }
      case 'HGET':
        return hashes.get(k)?.get(rest[0]!) ?? null;
      case 'HGETALL':
        return [...(hashes.get(k) ?? new Map<string, string>()).entries()].flat();
      case 'LPUSH': {
        const l = lists.get(k) ?? [];
        l.unshift(rest[0]!);
        lists.set(k, l);
        return l.length;
      }
      case 'LTRIM': {
        lists.set(k, (lists.get(k) ?? []).slice(Number(rest[0]), Number(rest[1]) + 1));
        return 'OK';
      }
      case 'EVAL': {
        // Only the owner-checked release script is used: EVAL script 1 key owner
        const key = rest[1]!;
        const owner = rest[2]!;
        if (kv.get(key) === owner) {
          kv.delete(key);
          return 1;
        }
        return 0;
      }
      default:
        throw new Error(`unsupported ${op}`);
    }
  };
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    expect(String(url)).toMatch(/\/pipeline$/);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    const cmds = JSON.parse(String(init?.body)) as string[][];
    calls.push(...cmds);
    return new Response(JSON.stringify(cmds.map((c) => ({ result: exec(c) }))));
  }) as unknown as typeof fetch;
  return { fetchImpl, kv, lists, calls };
}

const client = (f: ReturnType<typeof fakeUpstash>) => new UpstashClient({ url: 'https://example.upstash.io', token: 'test-token', prefix: 't:', fetchImpl: f.fetchImpl });
const obs = (date: string, nav: number) => ({ schemeCode: 1, date, nav, acceptedAt: '2026-10-17T00:00:00Z', runId: 'r1' });

describe('storage selection', () => {
  it('uses in-memory unless both Upstash URL and token are set', () => {
    expect(upstashConfigFromEnv({})).toBeNull();
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io' })).toBeNull();
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_TOKEN: 't' })).toBeNull();
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'http://insecure', UPSTASH_REDIS_REST_TOKEN: 't' })).toBeNull();
    expect(upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't', VERCEL_ENV: 'preview' })).toEqual({
      url: 'https://x.upstash.io',
      token: 't',
      prefix: 'lakshya:preview:',
    });
    expect(upstashConfigFromEnv({ KV_REST_API_URL: 'https://y.upstash.io', KV_REST_API_TOKEN: 'k' })?.url).toBe('https://y.upstash.io');
  });
});

describe('UpstashMfDataStore matches InMemoryMfDataStore semantics', () => {
  it('accepts idempotently and never overwrites a different NAV', async () => {
    const f = fakeUpstash();
    const redis = new UpstashMfDataStore(client(f));
    const mem = new InMemoryMfDataStore();
    for (const store of [redis, mem]) {
      expect(await store.acceptObservations([obs('2026-10-01', 10), obs('2026-10-02', 11)])).toEqual({ inserted: 2, unchanged: 0, conflicts: [] });
      const second = await store.acceptObservations([obs('2026-10-01', 10), obs('2026-10-02', 12), obs('2026-10-03', 13)]);
      expect(second.inserted).toBe(1);
      expect(second.unchanged).toBe(1);
      expect(second.conflicts).toEqual([obs('2026-10-02', 12)]);
      expect((await store.getObservations(1)).map((o) => [o.date, o.nav])).toEqual([
        ['2026-10-01', 10],
        ['2026-10-02', 11],
        ['2026-10-03', 13],
      ]);
      expect((await store.getObservations(1, '2026-10-02')).length).toBe(2);
      expect((await store.getLatestObservation(1))?.date).toBe('2026-10-03');
    }
  });

  it('quarantines idempotently', async () => {
    const store = new UpstashMfDataStore(client(fakeUpstash()));
    const q = { schemeCode: 1, date: '2026-10-02', nav: 12, reason: 'suspicious-jump' as const, message: 'jump', runId: 'r1', quarantinedAt: '2026-10-17T00:00:00Z' };
    expect(await store.quarantine([q])).toEqual({ inserted: 1, alreadyPresent: 0 });
    expect(await store.quarantine([q])).toEqual({ inserted: 0, alreadyPresent: 1 });
  });

  it('locks atomically, lets the owner renew, and only the owner releases', async () => {
    const f = fakeUpstash();
    const store = new UpstashMfDataStore(client(f));
    const now = new Date();
    expect(await store.acquireLock('run', 'a', 60_000, now)).toBe(true);
    expect(await store.acquireLock('run', 'b', 60_000, now)).toBe(false);
    expect(await store.acquireLock('run', 'a', 60_000, now)).toBe(true);
    await store.releaseLock('run', 'b');
    expect(await store.acquireLock('run', 'b', 60_000, now)).toBe(false);
    await store.releaseLock('run', 'a');
    expect(await store.acquireLock('run', 'b', 60_000, now)).toBe(true);
    expect(f.calls.some((c) => c[0] === 'SET' && c.includes('NX') && c.includes('PX'))).toBe(true);
  });

  it('keeps run reports newest first, capped', async () => {
    const f = fakeUpstash();
    const store = new UpstashMfDataStore(client(f));
    await store.saveRunReport({ runId: 'one' } as never);
    await store.saveRunReport({ runId: 'two' } as never);
    expect(f.lists.get('t:mf:runs')!.map((s) => JSON.parse(s).runId)).toEqual(['two', 'one']);
    expect(f.calls.some((c) => c[0] === 'LTRIM')).toBe(true);
  });
});

describe('cache stores', () => {
  it('round-trips values with a PX expiry', async () => {
    const f = fakeUpstash();
    const c = new UpstashCacheStore(client(f));
    await c.set('nav:1', { a: 1 }, 60_000);
    expect((await c.get<{ a: number }>('nav:1'))?.value).toEqual({ a: 1 });
    expect(f.calls.find((x) => x[0] === 'SET')).toContain('PX');
    await c.delete('nav:1');
    expect(await c.get('nav:1')).toBeNull();
  });

  it('tiered cache serves from memory after the first shared read, and survives shared-store failure', async () => {
    const f = fakeUpstash();
    const shared = new UpstashCacheStore(client(f));
    await shared.set('k', 'v');
    const tiered = new TieredCacheStore(new InMemoryCacheStore(), shared);
    expect((await tiered.get<string>('k'))?.value).toBe('v');
    const before = f.calls.length;
    expect((await tiered.get<string>('k'))?.value).toBe('v');
    expect(f.calls.length).toBe(before); // second read did not touch Redis

    const broken = new TieredCacheStore(
      new InMemoryCacheStore(),
      new UpstashCacheStore(new UpstashClient({ url: 'https://x', token: 'test-token', fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch })),
    );
    await broken.set('a', 1);
    expect((await broken.get<number>('a'))?.value).toBe(1);
    expect(await broken.get('missing')).toBeNull();
  });
});
