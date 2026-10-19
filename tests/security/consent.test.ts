import { describe, expect, it } from 'vitest';
import {
  CONSENT_ACTIONS,
  InMemoryNonceStore,
  canonicalJson,
  createConsentToken,
  payloadHash,
  verifyConsentToken,
} from '@/lib/security/consent';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const T0 = new Date('2026-10-19T06:00:00.000Z');
const payload = { facts: [{ id: 'a', value: 1 }], scenario: 'Strategy Lab' };

function issue(overrides: Partial<Parameters<typeof createConsentToken>[0]> = {}) {
  return createConsentToken({ action: 'ai-explain', payloadHash: payloadHash(payload), disclosureVersion: 'v1', now: T0, secret: SECRET, ...overrides });
}
const verify = (token: string, opts: Partial<Parameters<typeof verifyConsentToken>[1]> = {}, store = new InMemoryNonceStore()) =>
  verifyConsentToken(token, { action: 'ai-explain', payload, disclosureVersion: 'v1', now: new Date(T0.getTime() + 1000), secret: SECRET, nonceStore: store, ...opts });

describe('canonical payload hashing', () => {
  it('is independent of key order and sensitive to any value change', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(payloadHash({ x: 1, y: 2 })).toBe(payloadHash({ y: 2, x: 1 }));
    expect(payloadHash({ x: 1 })).not.toBe(payloadHash({ x: 2 }));
    expect(payloadHash(payload)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('consent tokens', () => {
  it('accepts the exact approved action and payload once', async () => {
    const { token, expiresAt } = issue();
    expect(expiresAt).toBe('2026-10-19T06:05:00.000Z');
    expect(await verify(token)).toEqual({ ok: true });
  });

  it('rejects a replayed token (single use)', async () => {
    const store = new InMemoryNonceStore();
    const { token } = issue();
    expect(await verify(token, {}, store)).toEqual({ ok: true });
    expect(await verify(token, {}, store)).toEqual({ ok: false, code: 'REPLAYED' });
  });

  it('rejects when the payload changed after approval', async () => {
    const { token } = issue();
    expect(await verify(token, { payload: { ...payload, scenario: 'changed' } })).toEqual({ ok: false, code: 'PAYLOAD_CHANGED' });
  });

  it('rejects a token for a different action', async () => {
    const { token } = issue();
    expect(await verify(token, { action: 'execute-transaction' })).toEqual({ ok: false, code: 'WRONG_ACTION' });
  });

  it('rejects after expiry (5 minutes)', async () => {
    const { token } = issue();
    expect(await verify(token, { now: new Date(T0.getTime() + 5 * 60_000 + 1) })).toEqual({ ok: false, code: 'EXPIRED' });
  });

  it('rejects a changed disclosure version (the user approved different wording)', async () => {
    const { token } = issue();
    expect(await verify(token, { disclosureVersion: 'v2' })).toEqual({ ok: false, code: 'DISCLOSURE_CHANGED' });
  });

  it('rejects a forged or tampered token and a token signed with another secret', async () => {
    const { token } = issue();
    const [body, sig] = token.split('.');
    expect(await verify(`${body}.${sig!.slice(0, -2)}AA`)).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
    expect(await verify(issue({ secret: 'another-secret-that-is-at-least-32-chars-long' }).token)).toEqual({ ok: false, code: 'BAD_SIGNATURE' });
    expect(await verify('not-a-token')).toEqual({ ok: false, code: 'MALFORMED' });
    expect(await verify('')).toEqual({ ok: false, code: 'MISSING' });
  });

  it('never issues a token for transaction execution', () => {
    expect(CONSENT_ACTIONS['execute-transaction'].enabled).toBe(false);
    expect(() => issue({ action: 'execute-transaction' })).toThrow(/disabled/i);
  });

  it('refuses to sign with a short secret', () => {
    expect(() => issue({ secret: 'short' })).toThrow(/32/);
  });
});

describe('permission categories', () => {
  it('separates read-public, personal-data, save, external-communication and transaction permissions', () => {
    const cats = new Set(Object.values(CONSENT_ACTIONS).flatMap((a) => a.categories));
    expect([...cats].sort()).toEqual(['communicate-externally', 'execute-transaction', 'read-public', 'save-changes', 'use-personal-data']);
    expect(CONSENT_ACTIONS['ai-explain'].categories).toEqual(['use-personal-data', 'communicate-externally']);
  });
});
