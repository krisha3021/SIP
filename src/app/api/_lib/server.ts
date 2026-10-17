import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Server helpers for the /api/funds routes.
 * - TTL cache with in-flight request de-duplication (per server instance; not shared across instances).
 * - Fixed-window rate limiter keyed by client IP (per instance; a shared store is a deferred owner decision).
 * - JSON envelope helpers. Responses never echo upstream error bodies or secrets.
 */

export type ApiError = { ok: false; error: { code: string; message: string } };

export function json<T>(body: T, init: { status?: number; maxAge?: number } = {}) {
  const cache = init.maxAge ? `public, max-age=0, s-maxage=${init.maxAge}, stale-while-revalidate=${init.maxAge}` : 'no-store';
  return NextResponse.json(body, { status: init.status ?? 200, headers: { 'Cache-Control': cache } });
}

export function errorJson(status: number, code: string, message: string, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error: { code, message } } satisfies ApiError, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

interface Entry<T> {
  value: T;
  storedAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();
  constructor(
    private ttlMs: number,
    private maxEntries = 200,
  ) {}

  /** Returns the cached value even if expired (for last-known-good fallbacks). */
  peek(key: string): Entry<T> | undefined {
    return this.store.get(key);
  }

  fresh(key: string, now = Date.now()): T | undefined {
    const e = this.store.get(key);
    return e && now - e.storedAt < this.ttlMs ? e.value : undefined;
  }

  set(key: string, value: T, now = Date.now()) {
    this.store.delete(key);
    this.store.set(key, { value, storedAt: now });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  /** Runs `load` once per key at a time; concurrent callers share the same promise. */
  dedupe(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = load().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
}

export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const h = this.hits.get(key);
    if (!h || now - h.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      if (this.hits.size > 5000) this.prune(now);
      return { allowed: true, retryAfterSec: 0 };
    }
    h.count++;
    if (h.count > this.limit) return { allowed: false, retryAfterSec: Math.ceil((h.windowStart + this.windowMs - now) / 1000) };
    return { allowed: true, retryAfterSec: 0 };
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  return ip.slice(0, 64);
}

/** Today's date in India (IST), as ISO YYYY-MM-DD, used as the reference date for NAV freshness. */
export function todayInIndia(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function providerEnabled(): boolean {
  return (process.env.NAV_PROVIDER ?? 'mfapi') === 'mfapi';
}

export function fetchTimeoutMs(): number {
  const n = Number(process.env.NAV_FETCH_TIMEOUT_MS ?? 8000);
  return Number.isFinite(n) ? Math.min(15000, Math.max(2000, n)) : 8000;
}
