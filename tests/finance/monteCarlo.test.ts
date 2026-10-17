import { describe, expect, it } from 'vitest';
import { runMonteCarlo, type MonteCarloInput } from '@/lib/finance/monteCarlo';
import { mulberry32 } from '@/lib/finance/random';

const base: MonteCarloInput = {
  monthlyContribution: 10_000,
  years: 15,
  expectedReturnPct: 11,
  volatilityPct: 18,
  goalAmount: 5_000_000,
  goalInTodaysRupees: false,
  simulations: 1_000,
  seed: 42,
};

const run = (input: MonteCarloInput) => {
  const r = runMonteCarlo(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('seeded PRNG', () => {
  it('is reproducible and in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });
});

describe('Monte Carlo', () => {
  it('produces identical output for the same seed', () => {
    expect(run(base)).toEqual(run(base));
  });

  it('produces different paths for a different seed', () => {
    expect(run({ ...base, seed: 43 }).terminal.p50).not.toBe(run(base).terminal.p50);
  });

  it('with zero volatility every path equals the deterministic SIP at the effective expected return', () => {
    const v = run({ ...base, volatilityPct: 0 });
    const r = Math.pow(1.11, 1 / 12) - 1;
    const n = 180;
    const expected = 10_000 * ((Math.pow(1 + r, n) - 1) / r);
    expect(v.terminal.p10).toBeCloseTo(expected, 2);
    expect(v.terminal.p90).toBeCloseTo(expected, 2);
  });

  it('calibration: mean terminal growth of a lumpsum ≈ (1 + E)^years', () => {
    const v = run({
      monthlyContribution: 0,
      initialCorpus: 1,
      years: 1,
      expectedReturnPct: 10,
      volatilityPct: 20,
      goalAmount: 1,
      goalInTodaysRupees: false,
      simulations: 10_000,
      seed: 1,
    });
    // Standard error ≈ 0.22/√10000 ≈ 0.0022; tolerance is about 5 standard errors.
    expect(Math.abs(v.terminal.mean - 1.1)).toBeLessThan(0.012);
    // The median sits below the mean: e^(ln 1.1 − 0.02) ≈ 1.0782.
    expect(v.model.medianAnnualReturnPct).toBeCloseTo((Math.exp(Math.log(1.1) - 0.02) - 1) * 100, 6);
  });

  it('goal success frequency responds to the user goal, not a fixed multiple of contributions', () => {
    expect(run({ ...base, goalAmount: 1 }).goalSuccessRate).toBe(1);
    expect(run({ ...base, goalAmount: 1e10 }).goalSuccessRate).toBe(0);
  });

  it('percentile bands are ordered and start at the initial corpus', () => {
    const v = run(base);
    for (const b of v.bands) {
      expect(b.p10).toBeLessThanOrEqual(b.p25);
      expect(b.p25).toBeLessThanOrEqual(b.p50);
      expect(b.p50).toBeLessThanOrEqual(b.p75);
      expect(b.p75).toBeLessThanOrEqual(b.p90);
    }
    expect(v.bands[0]!.p50).toBe(0);
    expect(v.totalInvested).toBe(10_000 * 180);
  });

  it('rejects too many simulations', () => {
    expect(runMonteCarlo({ ...base, simulations: 50_000 }).ok).toBe(false);
  });
});
