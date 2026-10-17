import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Server helpers for the /api/funds routes.
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

export function providerEnabled(): boolean {
  return (process.env.NAV_PROVIDER ?? 'mfapi') === 'mfapi';
}

export function fetchTimeoutMs(): number {
  const n = Number(process.env.NAV_FETCH_TIMEOUT_MS ?? 8000);
  return Number.isFinite(n) ? Math.min(15000, Math.max(2000, n)) : 8000;
}
