import 'server-only';
import { InMemoryCacheStore, InMemoryMfDataStore, type CacheStore, type MfDataStore } from './types';
import { TieredCacheStore, UpstashCacheStore, UpstashClient, UpstashMfDataStore } from './upstash';

/**
 * Chooses storage from the environment. Upstash Redis is used only when BOTH its URL and token are set
 * (either the UPSTASH_REDIS_REST_* names or the KV_REST_API_* names some Vercel integrations inject).
 * Otherwise everything falls back to the per-instance in-memory stores, exactly as before.
 */
export function upstashConfigFromEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string; prefix: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token || !/^https:\/\//.test(url)) return null;
  // Separate keys per Vercel environment so previews never touch production data.
  const prefix = `lakshya:${(env.VERCEL_ENV || 'local').replace(/[^a-z0-9-]/gi, '')}:`;
  return { url, token, prefix };
}

export type StorageKind = 'upstash-redis' | 'in-memory';

let cache: { kind: StorageKind; cacheStore: CacheStore; mfDataStore: MfDataStore } | null = null;

export function getStorage() {
  if (cache) return cache;
  const cfg = upstashConfigFromEnv();
  if (!cfg) {
    cache = { kind: 'in-memory', cacheStore: new InMemoryCacheStore({ maxEntries: 200 }), mfDataStore: new InMemoryMfDataStore() };
  } else {
    const client = new UpstashClient(cfg);
    let warned = false;
    const onError = (op: string) => {
      if (!warned) console.warn(`[storage] shared cache ${op} failed; continuing with in-memory cache only`);
      warned = true;
    };
    cache = {
      kind: 'upstash-redis',
      cacheStore: new TieredCacheStore(new InMemoryCacheStore({ maxEntries: 200 }), new UpstashCacheStore(client), onError),
      mfDataStore: new UpstashMfDataStore(client),
    };
  }
  return cache;
}
