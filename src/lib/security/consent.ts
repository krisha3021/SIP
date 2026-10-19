import 'server-only';
/**
 * Backend-enforced, action-bound consent.
 *
 * When a person presses "Approve this action", the server issues a token:
 *   body = { a: action, h: sha256(canonical payload), v: disclosure version, n: random nonce, e: expiry }
 *   token = base64url(body) "." base64url(HMAC-SHA256(secret, base64url(body)))
 * The consequential endpoint recomputes the payload hash from the request it actually received and verifies the
 * signature, action, hash, disclosure version, expiry (5 minutes) and single use (nonce store).
 *
 * What this guarantees: Lakshya's own code cannot send a payload other than the one shown in the dialog, reuse an
 * approval, or act on an approval for different wording. It is not a defence against a person scripting their own
 * browser, and it needs no account.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { CONSENT_ACTIONS, type ConsentActionId } from './actions';
export { CONSENT_ACTIONS, type ConsentActionId, type ConsentActionDef, type PermissionCategory } from './actions';

export const CONSENT_TTL_MS = 5 * 60_000;
export const MIN_SECRET_LENGTH = 32;

import { canonicalJson } from './canonical';
export { canonicalJson };

export const payloadHash = (payload: unknown): string => createHash('sha256').update(canonicalJson(payload)).digest('hex');

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

export interface NonceStore {
  /** Returns true the first time a nonce is consumed, false on any reuse. */
  consume(nonce: string, expiresAtMs: number): Promise<boolean>;
}

export class InMemoryNonceStore implements NonceStore {
  private used = new Map<string, number>();
  async consume(nonce: string, expiresAtMs: number): Promise<boolean> {
    const now = Date.now();
    for (const [n, exp] of this.used) if (exp < now - CONSENT_TTL_MS) this.used.delete(n);
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, expiresAtMs);
    return true;
  }
}

export function createConsentToken(args: { action: ConsentActionId; payloadHash: string; disclosureVersion: string; now: Date; secret: string; ttlMs?: number }) {
  if (!args.secret || args.secret.length < MIN_SECRET_LENGTH) throw new Error(`Consent signing secret must be at least ${MIN_SECRET_LENGTH} characters`);
  const def = CONSENT_ACTIONS[args.action];
  if (!def || !def.enabled || def.enforcement !== 'server-token') throw new Error(`Action ${args.action} is disabled or not server-enforced`);
  if (!/^[0-9a-f]{64}$/.test(args.payloadHash)) throw new Error('payloadHash must be a SHA-256 hex digest');
  const expiresAtMs = args.now.getTime() + (args.ttlMs ?? CONSENT_TTL_MS);
  const body = b64(JSON.stringify({ a: args.action, h: args.payloadHash, v: args.disclosureVersion, n: randomBytes(16).toString('base64url'), e: expiresAtMs }));
  return { token: `${body}.${sign(args.secret, body)}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export type ConsentFailure = 'MISSING' | 'MALFORMED' | 'BAD_SIGNATURE' | 'WRONG_ACTION' | 'PAYLOAD_CHANGED' | 'DISCLOSURE_CHANGED' | 'EXPIRED' | 'REPLAYED';

export async function verifyConsentToken(
  token: string,
  ctx: { action: ConsentActionId; payload: unknown; disclosureVersion: string; now: Date; secret: string; nonceStore: NonceStore },
): Promise<{ ok: true } | { ok: false; code: ConsentFailure }> {
  if (!token) return { ok: false, code: 'MISSING' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'MALFORMED' };
  const [body, sig] = parts as [string, string];
  const expected = Buffer.from(sign(ctx.secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, code: 'BAD_SIGNATURE' };
  let claims: { a: string; h: string; v: string; n: string; e: number };
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'MALFORMED' };
  }
  if (claims.a !== ctx.action) return { ok: false, code: 'WRONG_ACTION' };
  if (claims.v !== ctx.disclosureVersion) return { ok: false, code: 'DISCLOSURE_CHANGED' };
  if (claims.h !== payloadHash(ctx.payload)) return { ok: false, code: 'PAYLOAD_CHANGED' };
  if (ctx.now.getTime() > claims.e) return { ok: false, code: 'EXPIRED' };
  if (!(await ctx.nonceStore.consume(claims.n, claims.e))) return { ok: false, code: 'REPLAYED' };
  return { ok: true };
}
