import { describe, expect, it } from 'vitest';
import { createMonteCarloSession, runMonteCarlo, runMonteCarloChunked, type MonteCarloInput } from '@/lib/finance/monteCarlo';

const input: MonteCarloInput = {
  monthlyContribution: 10_000,
  years: 10,
  expectedReturnPct: 11,
  volatilityPct: 18,
  goalAmount: 2_000_000,
  goalInTodaysRupees: false,
  simulations: 500,
  seed: 42,
};
const noYield = async () => {};

describe('chunked Monte Carlo (Web Worker hook)', () => {
  it.each([1, 37, 250, 10_000])('chunk size %i gives results identical to the single-pass run', async (chunkSize) => {
    const sync = runMonteCarlo(input);
    const chunked = await runMonteCarloChunked(input, { chunkSize, yieldControl: noYield });
    expect(chunked).toEqual(sync);
  });

  it('reports monotone progress ending at the total', async () => {
    const seen: Array<[number, number]> = [];
    await runMonteCarloChunked(input, { chunkSize: 200, yieldControl: noYield, onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([
      [200, 500],
      [400, 500],
      [500, 500],
    ]);
  });

  it('stops at the next chunk boundary when aborted', async () => {
    const ac = new AbortController();
    let calls = 0;
    const r = await runMonteCarloChunked(input, {
      chunkSize: 100,
      signal: ac.signal,
      yieldControl: noYield,
      onProgress: () => {
        calls++;
        if (calls === 2) ac.abort();
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CANCELLED');
    expect(calls).toBe(2);
  });

  it('does no work when already aborted, and validates input first', async () => {
    const ac = new AbortController();
    ac.abort();
    let progressed = false;
    const r = await runMonteCarloChunked(input, { signal: ac.signal, onProgress: () => (progressed = true) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('CANCELLED');
    expect(progressed).toBe(false);
    const bad = await runMonteCarloChunked({ ...input, simulations: 5 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('INVALID_INPUT');
  });

  it('a session cannot be summarised before every path has run', () => {
    const s = createMonteCarloSession(input);
    if (!s.ok) throw new Error(s.error.message);
    s.value.step(10);
    expect(s.value.completedPaths).toBe(10);
    expect(s.value.finish().ok).toBe(false);
    s.value.step(1e9);
    expect(s.value.completedPaths).toBe(500);
    expect(s.value.finish().ok).toBe(true);
  });
});
