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

export type PermissionCategory = 'read-public' | 'use-personal-data' | 'save-changes' | 'communicate-externally' | 'execute-transaction';

export interface ConsentActionDef {
  id: string;
  label: string;
  categories: PermissionCategory[];
  /** Whether the server will ever issue a token for it in this release. */
  enabled: boolean;
  /** Where enforcement happens. Local-only actions need no server token because nothing leaves the device. */
  enforcement: 'server-token' | 'local-confirmation' | 'none';
  note: string;
}

export const CONSENT_ACTIONS = {
  'read-public-nav': { id: 'read-public-nav', label: 'Read public NAV data', categories: ['read-public'], enabled: true, enforcement: 'none', note: 'Public market data fetched by Lakshya’s server; no personal data involved.' },
  'ai-explain': { id: 'ai-explain', label: 'Send computed results to an external AI service for an explanation', categories: ['use-personal-data', 'communicate-externally'], enabled: true, enforcement: 'server-token', note: 'Only when an AI provider is configured.' },
  'replace-saved-plan': { id: 'replace-saved-plan', label: 'Replace a saved plan', categories: ['save-changes'], enabled: true, enforcement: 'local-confirmation', note: 'Saved plans live in this browser only.' },
  'delete-saved-plan': { id: 'delete-saved-plan', label: 'Delete a saved plan', categories: ['save-changes'], enabled: true, enforcement: 'local-confirmation', note: 'Saved plans live in this browser only.' },
  'cloud-sync': { id: 'cloud-sync', label: 'Enable cloud synchronisation', categories: ['save-changes', 'communicate-externally', 'use-personal-data'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'external-notifications': { id: 'external-notifications', label: 'Enable external notifications', categories: ['communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'connect-account': { id: 'connect-account', label: 'Connect a brokerage or financial account', categories: ['use-personal-data', 'communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'upload-statement': { id: 'upload-statement', label: 'Upload or process a portfolio statement externally', categories: ['use-personal-data', 'communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'paid-data-provider': { id: 'paid-data-provider', label: 'Activate a paid data provider', categories: ['communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Owner-only decision; not exposed to visitors.' },
  'execute-transaction': { id: 'execute-transaction', label: 'Execute an investment transaction', categories: ['execute-transaction'], enabled: false, enforcement: 'server-token', note: 'Permanently disabled in this release.' },
} as const satisfies Record<string, ConsentActionDef>;
export type ConsentActionId = keyof typeof CONSENT_ACTIONS;

export const CONSENT_TTL_MS = 5 * 60_000;
export const MIN_SECRET_LENGTH = 32;

/** Stable JSON: object keys sorted recursively, so the same payload always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

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
