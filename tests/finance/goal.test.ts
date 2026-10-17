import { describe, expect, it } from 'vitest';
import { planGoal, type GoalInput } from '@/lib/finance/goal';
import { projectAccumulation } from '@/lib/finance/sip';

const plan = (input: GoalInput) => {
  const r = planGoal(input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const forward = (input: Parameters<typeof projectAccumulation>[0]) => {
  const r = projectAccumulation(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.summary.finalValue;
};

describe('reverse SIP / goal planner', () => {
  it('inflates a ₹10 lakh goal over 10 years at 6% to ₹17,90,847.70', () => {
    // 1.06^10 = 1.7908476965
    const v = plan({ targetAmount: 1_000_000, months: 120, annualReturnPct: 12, inflationPct: 6 });
    expect(v.futureTarget).toBeCloseTo(1_790_847.7, 1);
  });

  it('zero return: required SIP is target ÷ months', () => {
    const v = plan({ targetAmount: 1_200_000, targetIsInTodaysRupees: false, months: 120, annualReturnPct: 0 });
    expect(v.requiredMonthlyContribution).toBeCloseTo(10_000, 9);
  });

  it('known value: ₹23,00,386.89 at 1%/month over 120 months, end timing, needs ₹10,000', () => {
    const v = plan({
      targetAmount: 2_300_386.89,
      targetIsInTodaysRupees: false,
      months: 120,
      annualReturnPct: 12,
      rateConvention: 'nominal',
      timing: 'end',
    });
    expect(v.requiredMonthlyContribution).toBeCloseTo(10_000, 2);
  });

  for (const timing of ['begin', 'end'] as const) {
    for (const rateConvention of ['nominal', 'effective'] as const) {
      it(`forward/reverse round trip is consistent (${timing}, ${rateConvention})`, () => {
        const target = 30_000_000;
        const base = { months: 300, annualReturnPct: 11.5, timing, rateConvention, initialCorpus: 250_000 };
        const v = plan({ targetAmount: target, targetIsInTodaysRupees: false, ...base });
        const fv = forward({ monthlyContribution: v.requiredMonthlyContribution, ...base });
        expect(fv / target).toBeCloseTo(1, 9);
      });
    }
  }

  it('round trip with a percentage step-up', () => {
    const base = { months: 240, annualReturnPct: 10, stepUp: { mode: 'percent' as const, value: 10 } };
    const v = plan({ targetAmount: 50_000_000, targetIsInTodaysRupees: false, ...base });
    expect(forward({ monthlyContribution: v.requiredMonthlyContribution, ...base }) / 50_000_000).toBeCloseTo(1, 9);
  });

  it('round trip with a fixed-amount step-up', () => {
    const base = { months: 180, annualReturnPct: 9, stepUp: { mode: 'amount' as const, value: 1_000 } };
    const v = plan({ targetAmount: 20_000_000, targetIsInTodaysRupees: false, ...base });
    expect(forward({ monthlyContribution: v.requiredMonthlyContribution, ...base }) / 20_000_000).toBeCloseTo(1, 9);
  });

  it('round trip with a capped step-up (bisection path)', () => {
    const base = { months: 240, annualReturnPct: 10, stepUp: { mode: 'percent' as const, value: 15, maxMonthlyContribution: 60_000 } };
    const v = plan({ targetAmount: 40_000_000, targetIsInTodaysRupees: false, ...base });
    expect(forward({ monthlyContribution: v.requiredMonthlyContribution, ...base }) / 40_000_000).toBeCloseTo(1, 5);
  });

  it('an existing corpus that already covers the goal needs no SIP', () => {
    const v = plan({ targetAmount: 100_000, targetIsInTodaysRupees: false, months: 12, annualReturnPct: 10, initialCorpus: 200_000 });
    expect(v.alreadyFunded).toBe(true);
    expect(v.requiredMonthlyContribution).toBe(0);
  });

  it('reports shortfall and additional monthly contribution versus the current SIP', () => {
    const v = plan({
      targetAmount: 1_200_000,
      targetIsInTodaysRupees: false,
      months: 120,
      annualReturnPct: 0,
      currentMonthlyContribution: 6_000,
    });
    expect(v.projectedWithCurrent).toBeCloseTo(720_000, 6);
    expect(v.shortfallWithCurrent).toBeCloseTo(480_000, 6);
    expect(v.additionalMonthlyNeeded).toBeCloseTo(4_000, 6);
  });

  it('rejects a zero target', () => {
    const r = planGoal({ targetAmount: 0, months: 12, annualReturnPct: 10 });
    expect(r.ok).toBe(false);
  });
});
