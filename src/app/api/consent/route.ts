import { z } from 'zod';
import { CONSENT_ACTIONS, MIN_SECRET_LENGTH, createConsentToken, type ConsentActionId } from '@/lib/security/consent';
import { readAiConfig } from '@/lib/ai/config';
import { RateLimiter, clientKey, errorJson } from '../_lib/server';

export const dynamic = 'force-dynamic';

const limiter = new RateLimiter(30, 60_000);
const bodySchema = z.object({
  action: z.string().max(40),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/, 'payloadHash must be a SHA-256 hex digest'),
  disclosureVersion: z.string().min(1).max(40),
});

/** Issues a single-use, 5-minute consent token bound to one action and one exact payload hash. */
export async function POST(req: Request) {
  const { allowed, retryAfterSec } = limiter.check(clientKey(req));
  if (!allowed) return errorJson(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute.', { 'Retry-After': String(retryAfterSec) });
  const secret = process.env.CONSENT_SIGNING_SECRET ?? '';
  if (secret.length < MIN_SECRET_LENGTH) return errorJson(503, 'CONSENT_UNAVAILABLE', 'Consent signing is not configured on this deployment, so actions that need approval are unavailable.');
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid request.');
  const { action, payloadHash, disclosureVersion } = parsed.data;
  const def = (CONSENT_ACTIONS as Record<string, (typeof CONSENT_ACTIONS)[ConsentActionId]>)[action];
  if (!def || !def.enabled || def.enforcement !== 'server-token') return errorJson(403, 'ACTION_DISABLED', 'This action is not available in this release.');
  if (action === 'ai-explain' && !readAiConfig(process.env)) return errorJson(403, 'ACTION_DISABLED', 'AI explanations are not configured on this deployment.');
  const t = createConsentToken({ action: action as ConsentActionId, payloadHash, disclosureVersion, now: new Date(), secret });
  return Response.json(t, { headers: { 'Cache-Control': 'no-store' } });
}
