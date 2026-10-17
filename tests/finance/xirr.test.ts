import { describe, expect, it } from 'vitest';
import { xirr } from '@/lib/finance/xirr';

describe('XIRR', () => {
  it('matches the documented spreadsheet XIRR example (37.3362535%)', () => {
    // Example published in Microsoft's XIRR function documentation.
    const r = xirr([
      { date: '2008-01-01', amount: -10_000 },
      { date: '2008-03-01', amount: 2_750 },
      { date: '2008-10-30', amount: 4_250 },
      { date: '2009-02-15', amount: 3_250 },
      { date: '2009-04-01', amount: 2_750 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rate).toBeCloseTo(0.373362535, 8);
  });

  it('uses actual days over 365: a 10% gain across leap year 2020 (366 days)', () => {
    const r = xirr([
      { date: '2020-01-01', amount: -1_000 },
      { date: '2021-01-01', amount: 1_100 },
    ]);
    // Closed form: 1.1^(365/366) − 1
    expect(r.ok && r.value.rate).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 10);
  });

  it('handles losses: −50% over exactly one non-leap year', () => {
    const r = xirr([
      { date: '2021-01-01', amount: -1_000 },
      { date: '2022-01-01', amount: 500 },
    ]);
    expect(r.ok && r.value.rate).toBeCloseTo(-0.5, 10);
  });

  it('is order-independent', () => {
    const r = xirr([
      { date: '2021-01-01', amount: 1_100 },
      { date: '2020-01-01', amount: -1_000 },
    ]);
    expect(r.ok && r.value.rate).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 10);
  });

  it('flags multiple roots and returns the one nearest 0% (10% and 20%)', () => {
    // −100(1+r)² + 230(1+r) − 132 = 0 has roots 1+r = 1.1 and 1.2.
    const r = xirr([
      { date: '2021-01-01', amount: -100 },
      { date: '2022-01-01', amount: 230 },
      { date: '2023-01-01', amount: -132 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.multipleRootsPossible).toBe(true);
      expect(r.value.rate).toBeCloseTo(0.1, 8);
      expect(r.value.roots.some((x) => Math.abs(x - 0.2) < 1e-8)).toBe(true);
    }
  });

  it('returns NO_ROOT rather than a fabricated rate when no rate balances the flows', () => {
    // 100 − 250x + 200x² has no real root.
    const r = xirr([
      { date: '2021-01-01', amount: 100 },
      { date: '2022-01-01', amount: -250 },
      { date: '2023-01-01', amount: 200 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NO_ROOT');
  });

  it('requires both a negative and a positive flow', () => {
    const r = xirr([
      { date: '2021-01-01', amount: -100 },
      { date: '2022-01-01', amount: -100 },
    ]);
    expect(!r.ok && r.error.code).toBe('NO_ROOT');
  });

  it('rejects invalid dates, non-finite amounts, single flows and same-day flows', () => {
    expect(xirr([{ date: '2021-02-30', amount: -1 }, { date: '2022-01-01', amount: 2 }]).ok).toBe(false);
    expect(xirr([{ date: '2021-01-01', amount: Number.NaN }, { date: '2022-01-01', amount: 2 }]).ok).toBe(false);
    expect(xirr([{ date: '2021-01-01', amount: -1 }]).ok).toBe(false);
    const same = xirr([{ date: '2021-01-01', amount: -1 }, { date: '2021-01-01', amount: 2 }]);
    expect(!same.ok && same.error.code).toBe('INSUFFICIENT_DATA');
  });
});
