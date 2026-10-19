import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as consentPost } from '@/app/api/consent/route';
import { GET as txGet, POST as txPost } from '@/app/api/transactions/route';

const req = (body: unknown) => new Request('http://localhost/api/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/consent', () => {
  it('returns 503 when no signing secret is configured (consent unavailable means the action is off)', async () => {
    vi.stubEnv('CONSENT_SIGNING_SECRET', '');
    const res = await consentPost(req({ action: 'ai-explain', payloadHash: 'a'.repeat(64), disclosureVersion: 'v1' }));
    expect(res.status).toBe(503);
  });

  it('refuses disabled actions such as transaction execution', async () => {
    vi.stubEnv('CONSENT_SIGNING_SECRET', 'x'.repeat(40));
    vi.stubEnv('LLM_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LLM_API_KEY', 'k');
    vi.stubEnv('LLM_MODEL', 'm');
    const res = await consentPost(req({ action: 'execute-transaction', payloadHash: 'a'.repeat(64), disclosureVersion: 'v1' }));
    expect(res.status).toBe(403);
  });

  it('refuses AI consent when the AI provider is not configured', async () => {
    vi.stubEnv('CONSENT_SIGNING_SECRET', 'x'.repeat(40));
    vi.stubEnv('LLM_BASE_URL', '');
    const res = await consentPost(req({ action: 'ai-explain', payloadHash: 'a'.repeat(64), disclosureVersion: 'v1' }));
    expect(res.status).toBe(403);
  });

  it('validates the request body', async () => {
    vi.stubEnv('CONSENT_SIGNING_SECRET', 'x'.repeat(40));
    expect((await consentPost(req({ action: 'ai-explain', payloadHash: 'nothex', disclosureVersion: 'v1' }))).status).toBe(400);
  });

  it('issues a signed, expiring token for an enabled action', async () => {
    vi.stubEnv('CONSENT_SIGNING_SECRET', 'x'.repeat(40));
    vi.stubEnv('LLM_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('LLM_API_KEY', 'k');
    vi.stubEnv('LLM_MODEL', 'm');
    const res = await consentPost(req({ action: 'ai-explain', payloadHash: 'b'.repeat(64), disclosureVersion: 'v1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
  });
});

describe('/api/transactions', () => {
  it('always refuses: no investment is executed by this release', async () => {
    for (const res of [await txGet(), await txPost()]) {
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('EXECUTION_DISABLED');
    }
  });
});
