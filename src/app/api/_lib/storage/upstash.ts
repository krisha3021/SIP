import 'server-only';
import {
  InMemoryCacheStore,
  type AutomationRunReportForStore,
  type CacheEntry,
  type CacheStore,
  type MfDataStore,
  type QuarantinedObservation,
  type StoredObservation,
} from './types';

/**
 * Upstash Redis adapters for Agent 2's `CacheStore` and `MfDataStore` interfaces, over Upstash's REST API
 * with plain `fetch` (no extra dependency). They implement the documented semantics of the in-memory stores
 * in src/lib without changing the interfaces:
 * - observations: HSETNX per (scheme, date), so an accepted NAV is never overwritten; a different NAV for an
 *   accepted date is returned as a conflict.
 * - quarantine: HSETNX on (scheme|date|reason|nav), so it is idempotent.
 * - locks: SET NX PX (atomic, with expiry); release only by the owner, via a compare-and-delete script.
 * - run reports: newest first in a capped list.
 */

export interface UpstashConfig {
  url: string;
  token: string;
  /** Key prefix, so several environments can share one database safely. */
  prefix?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Cmd = Array<string | number>;

export class UpstashClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  readonly prefix: string;

  constructor(private readonly cfg: UpstashConfig) {
    this.base = cfg.url.replace(/\/+$/, '');
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.prefix = cfg.prefix ?? 'lakshya:';
  }

  key(k: string): string {
    return this.prefix + k;
  }

  /** Runs commands in one round trip (Upstash /pipeline). Throws on transport or command errors. */
  async pipeline(cmds: Cmd[]): Promise<unknown[]> {
    if (cmds.length === 0) return [];
    const res = await this.fetchImpl(`${this.base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 5000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Storage request failed (HTTP ${res.status})`);
    const body = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return body.map((r) => {
      if (r.error) throw new Error('Storage command failed');
      return r.result ?? null;
    });
  }

  async cmd(c: Cmd): Promise<unknown> {
    return (await this.pipeline([c]))[0];
  }
}

const parse = <T>(v: unknown): T | null => {
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
};

/** Redis-backed CacheStore. Values are JSON; a TTL becomes a Redis PX expiry. */
export class UpstashCacheStore implements CacheStore {
  constructor(private readonly r: UpstashClient) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = parse<CacheEntry<T>>(await this.r.cmd(['GET', this.r.key(`cache:${key}`)]));
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= new Date().toISOString()) return null;
    return entry;
  }

  async set<T>(key: string, value: T, ttlMs?: number | null): Promise<void> {
    const now = new Date();
    const entry: CacheEntry<T> = {
      value,
      storedAt: now.toISOString(),
      expiresAt: ttlMs === undefined || ttlMs === null ? null : new Date(now.getTime() + ttlMs).toISOString(),
    };
    const cmd: Cmd = ['SET', this.r.key(`cache:${key}`), JSON.stringify(entry)];
    if (ttlMs) cmd.push('PX', Math.max(1, Math.floor(ttlMs)));
    await this.r.cmd(cmd);
  }

  async delete(key: string): Promise<void> {
    await this.r.cmd(['DEL', this.r.key(`cache:${key}`)]);
  }
}

/**
 * Two tiers: a per-instance memory cache in front of a shared store. Reads hit memory first, which keeps
 * Redis commands and bandwidth low. If the shared store fails, the site carries on with memory only.
 */
export class TieredCacheStore implements CacheStore {
  constructor(
    private readonly memory: CacheStore,
    private readonly shared: CacheStore,
    private readonly onError: (op: string) => void = () => {},
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const hit = await this.memory.get<T>(key);
    if (hit) return hit;
    try {
      const shared = await this.shared.get<T>(key);
      if (shared) {
        const ttl = shared.expiresAt === null ? null : Date.parse(shared.expiresAt) - Date.now();
        if (ttl === null || ttl > 0) await this.memory.set(key, shared.value, ttl);
      }
      return shared;
    } catch {
      this.onError('get');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number | null): Promise<void> {
    await this.memory.set(key, value, ttlMs);
    try {
      await this.shared.set(key, value, ttlMs);
    } catch {
      this.onError('set');
    }
  }

  async delete(key: string): Promise<void> {
    await this.memory.delete(key);
    try {
      await this.shared.delete(key);
    } catch {
      this.onError('delete');
    }
  }
}

const RELEASE_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const MAX_RUN_REPORTS = 200;
const quarantineField = (q: QuarantinedObservation) => `${q.schemeCode}|${q.date ?? '-'}|${q.reason}|${q.nav ?? '-'}`;

/** Redis-backed MfDataStore with the same semantics as InMemoryMfDataStore. */
export class UpstashMfDataStore implements MfDataStore {
  constructor(private readonly r: UpstashClient) {}

  private obsKey(code: number) {
    return this.r.key(`mf:obs:${code}`);
  }

  async getObservations(schemeCode: number, sinceDate?: string): Promise<StoredObservation[]> {
    const flat = (await this.r.cmd(['HGETALL', this.obsKey(schemeCode)])) as string[] | null;
    const out: StoredObservation[] = [];
    for (let i = 1; flat && i < flat.length; i += 2) {
      const o = parse<StoredObservation>(flat[i]);
      if (o && (sinceDate === undefined || o.date >= sinceDate)) out.push(o);
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async getLatestObservation(schemeCode: number): Promise<StoredObservation | null> {
    const all = await this.getObservations(schemeCode);
    return all[all.length - 1] ?? null;
  }

  async acceptObservations(obs: StoredObservation[]) {
    const setResults = await this.r.pipeline(obs.map((o) => ['HSETNX', this.obsKey(o.schemeCode), o.date, JSON.stringify(o)]));
    const existingIdx = setResults.map((r, i) => (Number(r) === 1 ? -1 : i)).filter((i) => i >= 0);
    const existing = await this.r.pipeline(existingIdx.map((i) => ['HGET', this.obsKey(obs[i]!.schemeCode), obs[i]!.date]));
    let unchanged = 0;
    const conflicts: StoredObservation[] = [];
    existingIdx.forEach((i, j) => {
      const stored = parse<StoredObservation>(existing[j]);
      if (stored && stored.nav === obs[i]!.nav) unchanged++;
      else conflicts.push({ ...obs[i]! });
    });
    return { inserted: obs.length - existingIdx.length, unchanged, conflicts };
  }

  async quarantine(records: QuarantinedObservation[]) {
    const res = await this.r.pipeline(records.map((q) => ['HSETNX', this.r.key('mf:quarantine'), quarantineField(q), JSON.stringify(q)]));
    const inserted = res.filter((x) => Number(x) === 1).length;
    return { inserted, alreadyPresent: records.length - inserted };
  }

  /** `now` is part of the interface; Redis applies the expiry with its own clock. */
  async acquireLock(name: string, owner: string, ttlMs: number, now?: Date): Promise<boolean> {
    void now;
    const k = this.r.key(`lock:${name}`);
    const ttl = Math.max(1, Math.floor(ttlMs));
    if ((await this.r.cmd(['SET', k, owner, 'NX', 'PX', ttl])) === 'OK') return true;
    // Same owner may renew, as with the in-memory store.
    if ((await this.r.cmd(['GET', k])) === owner) return (await this.r.cmd(['SET', k, owner, 'XX', 'PX', ttl])) === 'OK';
    return false;
  }

  async releaseLock(name: string, owner: string): Promise<void> {
    await this.r.cmd(['EVAL', RELEASE_SCRIPT, 1, this.r.key(`lock:${name}`), owner]);
  }

  async saveRunReport(report: AutomationRunReportForStore): Promise<void> {
    const k = this.r.key('mf:runs');
    await this.r.pipeline([
      ['LPUSH', k, JSON.stringify(report)],
      ['LTRIM', k, 0, MAX_RUN_REPORTS - 1],
    ]);
  }
}

export { InMemoryCacheStore };
