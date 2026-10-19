import { describe, expect, it } from 'vitest';
import { applyFetchAttempt, datasetTimestamps, type DatasetState, type Provenance } from '@/lib/data/provenance';

const prov = (observedAt: string, fetchedAt: string): Provenance => ({
  provider: 'MFAPI.in (test)',
  providerUrl: 'https://api.mfapi.in/mf/1',
  identifier: 'AMFI scheme code 1',
  observedAt,
  fetchedAt,
  coverage: { from: '2020-01-01', to: observedAt, observations: 10 },
  plan: 'Direct',
  option: 'Growth',
  currency: 'INR',
  units: 'INR per unit',
  classification: 'observed',
  notes: [],
});

const ok: DatasetState<number[]> = {
  data: [1],
  provenance: prov('2026-10-16', '2026-10-16T20:00:00.000Z'),
  lastAttemptAt: '2026-10-16T20:00:00.000Z',
  lastError: null,
};

describe('datasetTimestamps', () => {
  it('reports all five timestamps separately after a success', () => {
    expect(datasetTimestamps(ok, 'latest-nav')).toEqual({
      dataAsOf: '2026-10-16',
      providerPublishedAt: null,
      lastSuccessfulRetrieval: '2026-10-16T20:00:00.000Z',
      lastAttemptedRefresh: '2026-10-16T20:00:00.000Z',
      freshness: 'latest-nav',
    });
  });

  it('a failed refresh advances only the attempt time, never the data date or last success', () => {
    const failed = applyFetchAttempt(ok, { ok: false, at: '2026-10-19T04:00:00.000Z', error: 'timeout' });
    const t = datasetTimestamps(failed, 'stale');
    expect(t.lastAttemptedRefresh).toBe('2026-10-19T04:00:00.000Z');
    expect(t.dataAsOf).toBe('2026-10-16');
    expect(t.lastSuccessfulRetrieval).toBe('2026-10-16T20:00:00.000Z');
    expect(t.freshness).toBe('stale');
  });

  it('a successful refresh advances data date, success and attempt together', () => {
    const next = applyFetchAttempt(ok, { ok: true, at: '2026-10-19T04:00:00.000Z', data: [1, 2], provenance: prov('2026-10-17', '2026-10-19T04:00:00.000Z') });
    const t = datasetTimestamps(next, 'latest-nav');
    expect(t).toMatchObject({ dataAsOf: '2026-10-17', lastSuccessfulRetrieval: '2026-10-19T04:00:00.000Z', lastAttemptedRefresh: '2026-10-19T04:00:00.000Z' });
  });

  it('with no data, every timestamp is null and freshness is unavailable', () => {
    const empty: DatasetState<number[]> = { data: null, provenance: null, lastAttemptAt: null, lastError: null };
    expect(datasetTimestamps(empty, 'unavailable')).toEqual({ dataAsOf: null, providerPublishedAt: null, lastSuccessfulRetrieval: null, lastAttemptedRefresh: null, freshness: 'unavailable' });
  });
});
