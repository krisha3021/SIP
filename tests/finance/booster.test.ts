import { describe, expect, it } from 'vitest';
import { compareBooster } from '@/lib/finance/booster';

const monthly = (prices: number[]) =>
  prices.map((nav, i) => ({ date: `2024-${String(i + 1).padStart(2, '0')}-05`, nav }));

describe('bear-market booster', () => {
  it('is identical to the base SIP when the market never falls', () => {
    const r = compareBooster(monthly([100, 101, 102, 103, 104, 105]), {
      baseAmount: 1_000,
      startDate: '2024-01-05',
      endDate: '2024-06-30',
      rules: [{ drawdownPct: 10, multiplier: 2 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [base, booster] = r.value.strategies;
    expect(booster.finalValue).toBeCloseTo(base.finalValue, 9);
    expect(booster.additionalCapital).toBe(0);
    expect(r.value.boostedInstalments).toBe(0);
  });

  it('separates timing from extra capital (hand-worked)', () => {
    // Prices 100,100,80,80,100,100; 20% dip triggers 2× on months 3–4.
    // base:       units 4·10 + 2·12.5 = 65   → 6,500 on 6,000 invested
    // booster:    units 40 + 2·25 = 90       → 9,000 on 8,000 invested
    // comparable: 1,333.33/month · (4/100 + 2/80) = 86.667 units → 8,666.67 on 8,000
    const r = compareBooster(monthly([100, 100, 80, 80, 100, 100]), {
      baseAmount: 1_000,
      startDate: '2024-01-05',
      endDate: '2024-06-30',
      rules: [{ drawdownPct: 10, multiplier: 2 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [base, booster, comparable] = r.value.strategies;
    expect(base.totalInvested).toBe(6_000);
    expect(base.finalValue).toBeCloseTo(6_500, 9);
    expect(booster.totalInvested).toBe(8_000);
    expect(booster.finalValue).toBeCloseTo(9_000, 9);
    expect(booster.additionalCapital).toBe(2_000);
    expect(comparable.totalInvested).toBeCloseTo(8_000, 9);
    expect(comparable.finalValue).toBeCloseTo(8_000 * (4 / 600 + 2 / 480) * 100, 6);
    expect(r.value.totalDifferenceVsBase).toBeCloseTo(2_500, 9);
    expect(r.value.timingEffect).toBeCloseTo(9_000 - 8_666.6667, 3);
    expect(r.value.maxMultiplier).toBe(2);
    expect(booster.xirrPct).not.toBeNull();
  });

  it('uses no look-ahead: the drawdown uses only prices known on the instalment date', () => {
    const r = compareBooster(monthly([100, 120, 108]), {
      baseAmount: 1_000,
      startDate: '2024-01-05',
      endDate: '2024-03-31',
      rules: [{ drawdownPct: 10, multiplier: 3 }],
    });
    if (!r.ok) throw new Error(r.error.message);
    // Month 1 has no prior peak above 100, so there is no boost; month 3 is 10% below the 120 peak, so it is boosted.
    expect(r.value.instalments.map((i) => i.multiplier)).toEqual([1, 1, 3]);
  });
});
