import { describe, expect, it } from 'vitest';
import { maxDrawdown, timeWeightedIndex } from '@/lib/finance/drawdown';

describe('drawdown', () => {
  it('measures peak-to-trough on a price series', () => {
    const dd = maxDrawdown([100, 120, 90, 130]);
    expect(dd?.maxDrawdown).toBeCloseTo(-0.25, 12);
    expect(dd?.peakIndex).toBe(1);
    expect(dd?.troughIndex).toBe(2);
    expect(dd?.recoveryIndex).toBe(3);
  });

  it('reports no recovery when the peak is never regained', () => {
    expect(maxDrawdown([100, 80, 90])?.recoveryIndex).toBeNull();
  });

  it('a monotonically rising series has zero drawdown', () => {
    expect(maxDrawdown([1, 2, 3])?.maxDrawdown).toBe(0);
  });

  it('rejects non-positive levels', () => {
    expect(maxDrawdown([100, 0, 50])).toBeNull();
  });

  it('contributions do not mask market falls when the time-weighted index is used', () => {
    // Market falls 20% in period 2 while ₹1,000 is added: raw value goes from 1,000 to 1,800 (looks like +80%).
    const values = [1_000, 1_800];
    const contributions = [1_000, 1_000];
    expect(maxDrawdown(values)?.maxDrawdown).toBe(0); // the misleading raw-balance view
    const twr = timeWeightedIndex(values, contributions);
    expect(twr[1]).toBeCloseTo(80, 10);
    expect(maxDrawdown(twr)?.maxDrawdown).toBeCloseTo(-0.2, 12);
  });

  it('flat market with contributions keeps the time-weighted index flat', () => {
    expect(timeWeightedIndex([1_000, 2_000, 3_000], [1_000, 1_000, 1_000])).toEqual([100, 100, 100]);
  });
});
