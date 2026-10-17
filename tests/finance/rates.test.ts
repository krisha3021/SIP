import { describe, expect, it } from 'vitest';
import {
  effectiveFromNominalPct,
  monthlyRate,
  nominalFromEffectivePct,
  realRate,
  toFutureRupees,
  toTodaysRupees,
} from '@/lib/finance/rates';

describe('rate conventions', () => {
  it('nominal 12% p.a. is exactly 1% per month', () => {
    expect(monthlyRate(12, 'nominal')).toBeCloseTo(0.01, 15);
  });
  it('effective 12% p.a. is 0.948879…% per month', () => {
    // 1.12^(1/12) − 1 = 0.00948879293… (standard table value)
    expect(monthlyRate(12, 'effective')).toBeCloseTo(0.0094887929, 9);
  });
  it('nominal 12% compounded monthly is 12.6825% effective', () => {
    // 1.01^12 − 1 = 0.12682503013
    expect(effectiveFromNominalPct(12)).toBeCloseTo(0.12682503013, 10);
  });
  it('round-trips nominal ↔ effective', () => {
    expect(nominalFromEffectivePct(12.682503013196977)).toBeCloseTo(0.12, 10);
  });
  it('zero rate is zero under both conventions', () => {
    expect(monthlyRate(0, 'nominal')).toBe(0);
    expect(monthlyRate(0, 'effective')).toBe(0);
  });
  it('Fisher real rate: 10% nominal, 6% inflation → 3.7736%', () => {
    expect(realRate(10, 6)).toBeCloseTo(0.04 / 1.06, 12);
  });
  it('inflation adjustment over one year at 10%', () => {
    expect(toTodaysRupees(1100, 10, 12)).toBeCloseTo(1000, 9);
    expect(toFutureRupees(1000, 10, 12)).toBeCloseTo(1100, 9);
  });
});
