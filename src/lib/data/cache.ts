/**
 * Shared cache interface plus an in-memory implementation.
 *
 * The interface is deliberately small (get / set / delete on JSON-serialisable values) so that a
 * Redis- or KV-backed store can implement it later without touching callers. The in-memory store
 * is per-process: on serverless platforms each instance has its own copy, and it is lost on cold
 * start. It is suitable for development, tests, and as a best-effort first tier.
 */

export interface CacheEntry<T> {
  value: T;
  /** ISO timestamp when the entry was written. */
  storedAt: string;
  /** ISO timestamp after which the entry is no longer returned; null = no expiry. */
  expiresAt: string | null;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  /** `ttlMs` omitted or null = keep until evicted or deleted. */
  set<T>(key: string, value: T, ttlMs?: number | null): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface InMemoryCacheOptions {
  /** Maximum entries before the least recently used entry is evicted (default 500). */
  maxEntries?: number;
  now?: () => Date;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly now: () => Date;

  constructor(opts: InMemoryCacheOptions = {}) {
    this.maxEntries = Math.max(1, opts.maxEntries ?? 500);
    this.now = opts.now ?? (() => new Date());
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now().toISOString()) {
      this.map.delete(key);
      return null;
    }
    // Refresh recency for LRU eviction.
    this.map.delete(key);
    this.map.set(key, entry);
    // Return a copy so callers cannot mutate the cached value in place.
    return structuredClone(entry) as CacheEntry<T>;
  }

  async set<T>(key: string, value: T, ttlMs?: number | null): Promise<void> {
    const now = this.now();
    const entry: CacheEntry<T> = {
      value: structuredClone(value),
      storedAt: now.toISOString(),
      expiresAt: ttlMs === undefined || ttlMs === null ? null : new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.map.delete(key);
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}
