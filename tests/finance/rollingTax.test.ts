import { describe, expect, it } from 'vitest';
import { rollingReturns } from '@/lib/finance/rolling';
import { compareIncomeTax, slabTax } from '@/lib/finance/tax/incomeTax';
import { TAX_YEARS } from '@/lib/finance/tax/config';
import { daysBetween } from '@/lib/finance/dates';
import { businessDaySeries } from './fixtures';

describe('rolling returns on NAV', () => {
  const navs = businessDaySeries('2015-01-01', '2024-12-31', (d) => 100 * Math.pow(1.1, daysBetween('2015-01-01', d) / 365));

  it('a constant 10% p.a. growth series has 10% CAGR in every window', () => {
    const r = rollingReturns(navs, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stats.min).toBeCloseTo(10, 6);
    expect(r.value.stats.max).toBeCloseTo(10, 6);
    expect(r.value.stats.positiveShare).toBe(1);
    expect(r.value.windows[0]!.startDate).toBe('2015-01-01');
  });

  it('refuses windows longer than the history', () => {
    const r = rollingReturns(navs, 15);
    expect(!r.ok && r.error.code).toBe('INSUFFICIENT_DATA');
  });
});

describe('income tax — FY 2025-26 (verified config)', () => {
  const nw = (salary: number) => {
    const r = compareIncomeTax({ fy: '2025-26', salaryIncome: salary });
    if (!r.ok) throw new Error(r.error.message);
    return r.value.new;
  };

  it('new regime slab arithmetic: ₹13 lakh taxable → ₹75,000 before cess', () => {
    // 0 + 20,000 + 40,000 + 15% × 1,00,000
    expect(slabTax(1_300_000, TAX_YEARS['2025-26']!.regimes.new.slabs.below60)).toBe(75_000);
  });

  it('salary ₹12.75 lakh → taxable ₹12 lakh → nil tax after the ₹60,000 rebate', () => {
    const v = nw(1_275_000);
    expect(v.taxableIncome).toBe(1_200_000);
    expect(v.slabTax).toBe(60_000);
    expect(v.totalTax).toBe(0);
  });

  it('marginal relief just above ₹12 lakh: taxable ₹12.10 lakh → tax capped at ₹10,000 + cess', () => {
    const v = nw(1_285_000);
    expect(v.taxableIncome).toBe(1_210_000);
    expect(v.slabTax).toBe(61_500);
    expect(v.taxAfterRebate).toBe(10_000);
    expect(v.totalTax).toBeCloseTo(10_400, 9);
  });

  it('no marginal relief once tax is below the excess: taxable ₹13 lakh → ₹78,000', () => {
    expect(nw(1_375_000).totalTax).toBeCloseTo(78_000, 9);
  });

  it('old regime with deductions: salary ₹10 lakh, 80C ₹1.5 lakh, 80D ₹25,000 → ₹70,200', () => {
    const r = compareIncomeTax({ fy: '2025-26', salaryIncome: 1_000_000, deductions: { sec80C: 200_000, sec80DSelf: 25_000 } });
    if (!r.ok) throw new Error(r.error.message);
    // taxable 10,00,000 − 50,000 − 1,50,000 (capped) − 25,000 = 7,75,000 → 12,500 + 55,000 = 67,500 × 1.04
    expect(r.value.old.taxableIncome).toBe(775_000);
    expect(r.value.old.totalTax).toBeCloseTo(70_200, 9);
    // new: taxable 9,25,000 → 32,500 → fully rebated
    expect(r.value.new.totalTax).toBe(0);
    expect(r.value.lowerRegime).toBe('new');
  });

  it('old regime rebate: taxable ₹5 lakh → nil; senior citizens use a ₹3 lakh exemption', () => {
    const r = compareIncomeTax({ fy: '2025-26', salaryIncome: 550_000 });
    expect(r.ok && r.value.old.totalTax).toBe(0);
    expect(slabTax(500_000, TAX_YEARS['2025-26']!.regimes.old.slabs.age60to80)).toBe(10_000);
    expect(slabTax(1_000_000, TAX_YEARS['2025-26']!.regimes.old.slabs.above80)).toBe(100_000);
  });

  it('declines surcharge cases instead of guessing', () => {
    const r = compareIncomeTax({ fy: '2025-26', salaryIncome: 6_000_000 });
    expect(!r.ok && r.error.code).toBe('UNSUPPORTED');
  });

  it('disables an unverified financial year', () => {
    const r = compareIncomeTax({ fy: '2026-27', salaryIncome: 1_000_000 });
    expect(!r.ok && r.error.code).toBe('UNVERIFIED_RULES');
  });

  it('rejects an unknown financial year', () => {
    const r = compareIncomeTax({ fy: '2019-20', salaryIncome: 1_000_000 });
    expect(!r.ok && r.error.code).toBe('UNSUPPORTED');
  });
});
