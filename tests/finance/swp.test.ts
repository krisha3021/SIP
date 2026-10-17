import { describe, expect, it } from 'vitest';
import { simulateSwp, type SwpInput } from '@/lib/finance/swp';

const run = (input: SwpInput) => {
  const r = simulateSwp(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('SWP', () => {
  it('zero return: ₹1,00,000 with ₹30,000/month lasts 3 full months plus a ₹10,000 final partial', () => {
    const v = run({ corpus: 100_000, monthlyWithdrawal: 30_000, annualReturnPct: 0 });
    expect(v.fullyFundedMonths).toBe(3);
    expect(v.depletionMonth).toBe(4);
    expect(v.finalPartialWithdrawal).toBeCloseTo(10_000, 9);
    expect(v.totalWithdrawn).toBeCloseTo(100_000, 9);
    expect(v.remainingCorpus).toBe(0);
  });

  it('exact depletion with no partial: ₹90,000 at ₹30,000/month', () => {
    const v = run({ corpus: 90_000, monthlyWithdrawal: 30_000, annualReturnPct: 0 });
    expect(v.depletionMonth).toBe(3);
    expect(v.finalPartialWithdrawal).toBeNull();
    expect(v.totalWithdrawn).toBe(90_000);
  });

  it('grow-then-withdraw ledger at 1%/month (hand-worked)', () => {
    // m1: 1000·1.01 − 500 = 510; m2: 510·1.01 − 500 = 15.1; m3: 15.1·1.01 = 15.251 paid as partial
    const v = run({ corpus: 1_000, monthlyWithdrawal: 500, annualReturnPct: 12, rateConvention: 'nominal', order: 'grow-then-withdraw' });
    expect(v.rows[0]!.closingBalance).toBeCloseTo(510, 9);
    expect(v.rows[1]!.closingBalance).toBeCloseTo(15.1, 9);
    expect(v.depletionMonth).toBe(3);
    expect(v.finalPartialWithdrawal).toBeCloseTo(15.251, 9);
    expect(v.totalWithdrawn).toBeCloseTo(1_015.251, 9);
  });

  it('withdraw-then-grow ledger at 1%/month (hand-worked)', () => {
    // m1: (1000 − 500)·1.01 = 505; m2: (505 − 500)·1.01 = 5.05; m3: partial 5.05
    const v = run({ corpus: 1_000, monthlyWithdrawal: 500, annualReturnPct: 12, rateConvention: 'nominal', order: 'withdraw-then-grow' });
    expect(v.rows[0]!.closingBalance).toBeCloseTo(505, 9);
    expect(v.rows[1]!.closingBalance).toBeCloseTo(5.05, 9);
    expect(v.finalPartialWithdrawal).toBeCloseTo(5.05, 9);
    expect(v.totalWithdrawn).toBeCloseTo(1_005.05, 9);
  });

  it('withdrawing exactly the monthly growth preserves the corpus', () => {
    const v = run({ corpus: 100_000, monthlyWithdrawal: 1_000, annualReturnPct: 12, rateConvention: 'nominal', horizonMonths: 360 });
    expect(v.depletionMonth).toBeNull();
    expect(v.remainingCorpus).toBeCloseTo(100_000, 4);
    expect(v.totalWithdrawn).toBeCloseTo(360_000, 4);
  });

  it('annual increase raises the withdrawal from month 13', () => {
    const v = run({ corpus: 10_000_000, monthlyWithdrawal: 10_000, annualReturnPct: 0, annualIncreasePct: 10, horizonMonths: 24 });
    expect(v.rows[11]!.scheduledWithdrawal).toBe(10_000);
    expect(v.rows[12]!.scheduledWithdrawal).toBeCloseTo(11_000, 9);
  });

  it('reports real purchasing power of the remaining corpus', () => {
    const v = run({ corpus: 1_100_000, monthlyWithdrawal: 1, annualReturnPct: 0, inflationPct: 10, horizonMonths: 12 });
    expect(v.realRemainingCorpus).toBeCloseTo((1_100_000 - 12) / 1.1, 6);
  });

  it('rejects a zero withdrawal', () => {
    expect(simulateSwp({ corpus: 1000, monthlyWithdrawal: 0, annualReturnPct: 5 }).ok).toBe(false);
  });
});
