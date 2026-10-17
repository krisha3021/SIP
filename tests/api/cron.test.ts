import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/cron/validate-mf-data/route';

const SECRET = 'test-secret-0123456789-abcdefghijklmnop'; // ≥ 32 chars, test-only value

function req(auth?: string) {
  return new Request('http://localhost/api/cron/validate-mf-data', { headers: auth ? { authorization: auth } : {} });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/cron/validate-mf-data', () => {
  it('refuses with 401 when CRON_SECRET is not configured, even with a header', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(401);
  });

  it('refuses with 401 when the secret is too short (fails closed)', async () => {
    vi.stubEnv('CRON_SECRET', 'CHANGE_ME');
    expect((await GET(req('Bearer CHANGE_ME'))).status).toBe(401);
  });

  it('refuses with 401 for a missing or wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(`Bearer ${SECRET}x`))).status).toBe(401);
    expect((await GET(req(SECRET))).status).toBe(401);
  });

  it('honours the kill switch without fetching, and states that runs are not persisted', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('MF_VALIDATION_DISABLED', 'true');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task).toBe('validate-mf-data');
    expect(body.status).toBe('skipped-disabled');
    expect(body.persistence).toMatchObject({ store: 'in-memory', persisted: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
