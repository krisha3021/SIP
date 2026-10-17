import { describe, expect, it } from 'vitest';
import { projectAccumulation, type AccumulationInput } from '@/lib/finance/sip';

const run = (input: AccumulationInput) => {
  const r = projectAccumulation(input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('standard SIP', () => {
  it('zero return: value equals total contributions', () => {
    const v = run({ monthlyContribution: 10_000, annualReturnPct: 0, months: 120 });
    expect(v.summary.totalInvested).toBe(1_200_000);
    expect(v.summary.finalValue).toBe(1_200_000);
    expect(v.summary.gains).toBe(0);
  });

  it('end-of-month contributions match the ordinary-annuity value (₹10k, 1%/month, 120 months)', () => {
    // FV = 10,000 × (1.01^120 − 1) / 0.01, with 1.01^120 = 3.300386895…
    const v = run({ monthlyContribution: 10_000, annualReturnPct: 12, rateConvention: 'nominal', months: 120, timing: 'end' });
    expect(v.summary.finalValue).toBeCloseTo(2_300_386.89, 1);
  });

  it('beginning-of-month contributions are exactly one month of growth higher', () => {
    const end = run({ monthlyContribution: 10_000, annualReturnPct: 12, rateConvention: 'nominal', months: 120, timing: 'end' });
    const begin = run({ monthlyContribution: 10_000, annualReturnPct: 12, rateConvention: 'nominal', months: 120, timing: 'begin' });
    expect(begin.summary.finalValue).toBeCloseTo(2_323_390.76, 1);
    expect(begin.summary.finalValue / end.summary.finalValue).toBeCloseTo(1.01, 12);
  });

  it('matches a 2-month hand-worked ledger, end timing at 1%', () => {
    // m1: 0·1.01 + 100 = 100; m2: 100·1.01 + 100 = 201
    const v = run({ monthlyContribution: 100, annualReturnPct: 12, rateConvention: 'nominal', months: 2 });
    expect(v.rows[0]!.value).toBeCloseTo(100, 10);
    expect(v.rows[1]!.value).toBeCloseTo(201, 10);
  });

  it('matches a 2-month hand-worked ledger, begin timing at 1%', () => {
    // m1: (0 + 100)·1.01 = 101; m2: (101 + 100)·1.01 = 203.01
    const v = run({ monthlyContribution: 100, annualReturnPct: 12, rateConvention: 'nominal', months: 2, timing: 'begin' });
    expect(v.rows[0]!.value).toBeCloseTo(101, 10);
    expect(v.rows[1]!.value).toBeCloseTo(203.01, 10);
  });

  it('effective convention: 12% effective for 12 months on a lumpsum gives exactly 12%', () => {
    const v = run({ monthlyContribution: 0, initialCorpus: 100_000, annualReturnPct: 12, rateConvention: 'effective', months: 12 });
    expect(v.summary.finalValue).toBeCloseTo(112_000, 6);
  });
});

describe('lumpsum and existing corpus', () => {
  it('lumpsum at 12% effective for 10 years', () => {
    // 1.12^10 = 3.1058482083
    const v = run({ monthlyContribution: 0, initialCorpus: 100_000, annualReturnPct: 12, months: 120 });
    expect(v.summary.finalValue).toBeCloseTo(310_584.82, 1);
    expect(v.summary.totalInvested).toBe(100_000);
  });

  it('existing corpus plus SIP equals the sum of the two parts (superposition)', () => {
    const r = 0.01;
    const n = 60;
    const expected = 500_000 * Math.pow(1 + r, n) + 5_000 * ((Math.pow(1 + r, n) - 1) / r);
    const v = run({ monthlyContribution: 5_000, initialCorpus: 500_000, annualReturnPct: 12, rateConvention: 'nominal', months: n });
    expect(v.summary.finalValue).toBeCloseTo(expected, 4);
    expect(v.summary.totalInvested).toBe(500_000 + 5_000 * 60);
  });

  it('negative return: −10% effective for one year on ₹1 lakh', () => {
    const v = run({ monthlyContribution: 0, initialCorpus: 100_000, annualReturnPct: -10, months: 12 });
    expect(v.summary.finalValue).toBeCloseTo(90_000, 6);
    expect(v.summary.gains).toBeCloseTo(-10_000, 6);
  });
});

describe('step-up SIP', () => {
  it('zero step-up equals standard SIP', () => {
    const a = run({ monthlyContribution: 7_500, annualReturnPct: 11, months: 180 });
    const b = run({ monthlyContribution: 7_500, annualReturnPct: 11, months: 180, stepUp: { mode: 'percent', value: 0 } });
    expect(b.summary.finalValue).toBeCloseTo(a.summary.finalValue, 6);
  });

  it('10% step-up at zero return: 12×1,000 + 12×1,100', () => {
    const v = run({ monthlyContribution: 1_000, annualReturnPct: 0, months: 24, stepUp: { mode: 'percent', value: 10 } });
    expect(v.summary.totalInvested).toBeCloseTo(25_200, 9);
    expect(v.rows[12]!.contribution).toBeCloseTo(1_100, 9);
  });

  it('fixed-amount step-up of ₹500 per year', () => {
    const v = run({ monthlyContribution: 1_000, annualReturnPct: 0, months: 36, stepUp: { mode: 'amount', value: 500 } });
    expect(v.summary.totalInvested).toBe(12 * 1_000 + 12 * 1_500 + 12 * 2_000);
  });

  it('respects the contribution cap', () => {
    const v = run({
      monthlyContribution: 1_000,
      annualReturnPct: 0,
      months: 36,
      stepUp: { mode: 'percent', value: 100, maxMonthlyContribution: 1_500 },
    });
    expect(v.rows[35]!.contribution).toBe(1_500);
    expect(v.summary.totalInvested).toBe(12_000 + 18_000 + 18_000);
  });

  it('warns when step-up makes contributions unaffordable', () => {
    const r = projectAccumulation({ monthlyContribution: 1_000, annualReturnPct: 10, months: 480, stepUp: { mode: 'percent', value: 25 } });
    expect(r.ok && r.warnings.some((w) => /affordable/.test(w))).toBe(true);
  });
});

describe('pauses and top-ups', () => {
  it('pausing months 3–4 of a 12-month plan removes two contributions', () => {
    const v = run({ monthlyContribution: 1_000, annualReturnPct: 0, months: 12, pauses: [{ fromMonth: 3, toMonth: 4 }] });
    expect(v.summary.totalInvested).toBe(10_000);
    expect(v.rows[2]!.contribution).toBe(0);
  });
  it('a one-time top-up adds to the invested amount in its month', () => {
    const v = run({ monthlyContribution: 1_000, annualReturnPct: 0, months: 12, topUps: [{ month: 6, amount: 50_000 }] });
    expect(v.summary.totalInvested).toBe(62_000);
    expect(v.rows[5]!.topUp).toBe(50_000);
  });
});

describe('inflation-adjusted value', () => {
  it('₹1,000 at 0% return with 10% inflation is worth ₹909.09 after a year', () => {
    const v = run({ monthlyContribution: 0, initialCorpus: 1_000, annualReturnPct: 0, months: 12, inflationPct: 10 });
    expect(v.summary.realFinalValue).toBeCloseTo(1_000 / 1.1, 9);
  });
});

describe('input validation', () => {
  const cases: Array<[string, unknown]> = [
    ['zero duration', { monthlyContribution: 1000, annualReturnPct: 10, months: 0 }],
    ['fractional months', { monthlyContribution: 1000, annualReturnPct: 10, months: 1.5 }],
    ['NaN amount', { monthlyContribution: Number.NaN, annualReturnPct: 10, months: 12 }],
    ['infinite amount', { monthlyContribution: Infinity, annualReturnPct: 10, months: 12 }],
    ['negative amount', { monthlyContribution: -5, annualReturnPct: 10, months: 12 }],
    ['return below supported domain', { monthlyContribution: 1000, annualReturnPct: -60, months: 12 }],
    ['nothing invested', { monthlyContribution: 0, annualReturnPct: 10, months: 12 }],
    ['pause ending before start', { monthlyContribution: 1000, annualReturnPct: 10, months: 12, pauses: [{ fromMonth: 5, toMonth: 3 }] }],
  ];
  it.each(cases)('rejects %s', (_label, input) => {
    const r = projectAccumulation(input as AccumulationInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_INPUT');
  });

  it('handles very large amounts and long horizons without non-finite output', () => {
    const v = run({ monthlyContribution: 1e9, initialCorpus: 1e10, annualReturnPct: 50, months: 1200 });
    expect(Number.isFinite(v.summary.finalValue)).toBe(true);
  });
});
