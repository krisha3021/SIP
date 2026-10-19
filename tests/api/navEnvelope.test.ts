import { describe, expect, it } from 'vitest';
import { navEnvelope } from '@/app/api/_lib/navService';

describe('NAV route envelope', () => {
  it('includes the five dataset timestamps, with the failed attempt kept separate from the last success', () => {
    const env = navEnvelope(
      {
        state: {
          data: {
            meta: { schemeCode: 1, schemeName: 'X - Direct Plan - Growth', fundHouse: null, category: null, schemeType: null, isinGrowth: null, isinReinvestment: null, plan: 'Direct', option: 'Growth' },
            navs: [{ date: '2026-10-16', nav: 10 }],
            droppedRows: 0,
            provenance: {} as never,
          },
          provenance: { provider: 'p', providerUrl: 'u', identifier: 'i', observedAt: '2026-10-16', fetchedAt: '2026-10-16T20:00:00.000Z', coverage: null, plan: 'Direct', option: 'Growth', currency: 'INR', units: 'INR per unit', classification: 'cached', notes: [] },
          lastAttemptAt: '2026-10-19T04:00:00.000Z',
          lastError: 'timeout',
        },
        source: 'last-known-good',
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'timeout', retryable: true },
        freshness: 'stale',
      } as Parameters<typeof navEnvelope>[0],
      false,
    );
    expect(env.timestamps).toEqual({
      dataAsOf: '2026-10-16',
      providerPublishedAt: null,
      lastSuccessfulRetrieval: '2026-10-16T20:00:00.000Z',
      lastAttemptedRefresh: '2026-10-19T04:00:00.000Z',
      freshness: 'stale',
    });
  });
});
