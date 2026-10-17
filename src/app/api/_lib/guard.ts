import 'server-only';
import { RateLimiter, clientKey, errorJson, providerEnabled } from './server';

/** 60 requests per minute per client IP across all /api/funds routes (per server instance). */
const limiter = new RateLimiter(60, 60_000);

/** Returns an error response if the request must be refused, otherwise null. */
export function guardFundsRequest(req: Request) {
  if (!providerEnabled()) {
    return errorJson(503, 'PROVIDER_DISABLED', 'Mutual fund data is turned off on this deployment (NAV_PROVIDER is not "mfapi").');
  }
  const { allowed, retryAfterSec } = limiter.check(clientKey(req));
  if (!allowed) return errorJson(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute and try again.', { 'Retry-After': String(retryAfterSec) });
  return null;
}
