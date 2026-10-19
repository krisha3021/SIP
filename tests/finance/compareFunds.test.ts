import { describe, expect, it } from 'vitest';
import { comparabilityWarnings, holdingsOverlap, MAX_COMPARE, type CompareRow } from '@/lib/finance/compareFunds';

const base: CompareRow = {
  schemeId: 1,
  name: 'A Fund - Direct Plan - Growth',
  subcategory: 'Flexi Cap Fund',
  planType: 'Direct',
  optionType: 'Growth',
  navDate: '2026-10-16',
  availablePeriods: ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'SI'],
  unavailableResearchFields: 0,
};
const codes = (r: ReturnType<typeof comparabilityWarnings>) => (r.ok ? r.value.map((w) => w.code) : []);

describe('comparabilityWarnings', () => {
  it('raises nothing for comparable funds', () => {
    expect(codes(comparabilityWarnings([base, { ...base, schemeId: 2, name: 'B' }]))).toEqual([]);
  });
  it('warns when categories differ', () => {
    expect(codes(comparabilityWarnings([base, { ...base, schemeId: 2, subcategory: 'Small Cap Fund' }]))).toContain('CATEGORY_DIFFERS');
  });
  it('warns when NAV dates differ by more than 3 days', () => {
    expect(codes(comparabilityWarnings([base, { ...base, schemeId: 2, navDate: '2026-10-12' }]))).toContain('NAV_DATES_DIFFER');
    expect(codes(comparabilityWarnings([base, { ...base, schemeId: 2, navDate: '2026-10-14' }]))).not.toContain('NAV_DATES_DIFFER');
  });
  it('warns when plan types or option types differ', () => {
    const c = codes(comparabilityWarnings([base, { ...base, schemeId: 2, planType: 'Regular', optionType: 'IDCW' }]));
    expect(c).toEqual(expect.arrayContaining(['PLAN_TYPES_DIFFER', 'OPTION_TYPES_DIFFER']));
  });
  it('lists return periods that are not available for every fund', () => {
    const r = comparabilityWarnings([base, { ...base, schemeId: 2, availablePeriods: ['1M', '3M', '6M', '1Y', 'SI'] }]);
    const w = r.ok ? r.value.find((x) => x.code === 'RETURN_PERIODS_NOT_COMPARABLE') : undefined;
    expect(w?.message).toMatch(/3Y/);
    expect(w?.message).toMatch(/5Y/);
  });
  it('warns when research coverage is incomplete', () => {
    expect(codes(comparabilityWarnings([base, { ...base, schemeId: 2, unavailableResearchFields: 12 }]))).toContain('INCOMPLETE_COVERAGE');
  });
  it('refuses more than four funds and fewer than two', () => {
    expect(MAX_COMPARE).toBe(4);
    const five = Array.from({ length: 5 }, (_, i) => ({ ...base, schemeId: i + 1 }));
    expect(comparabilityWarnings(five).ok).toBe(false);
    expect(comparabilityWarnings([base]).ok).toBe(false);
  });
});

describe('holdingsOverlap', () => {
  const a = { disclosureDate: '2026-09-30', coveragePct: 100, holdings: [{ isin: 'X1', weightPct: 50 }, { isin: 'X2', weightPct: 30 }, { isin: 'X3', weightPct: 20 }] };
  const b = { disclosureDate: '2026-09-30', coveragePct: 100, holdings: [{ isin: 'X1', weightPct: 20 }, { isin: 'X2', weightPct: 40 }, { isin: 'X9', weightPct: 40 }] };
  it('is the sum over common ISINs of the smaller weight (hand-worked: min(50,20) + min(30,40) = 50%)', () => {
    const r = holdingsOverlap(a, b);
    expect(r).toMatchObject({ status: 'available', overlapPct: 50, commonHoldings: 2, method: 'ISIN match' });
  });
  it('is unavailable when either side has no holdings data', () => {
    expect(holdingsOverlap(a, null)).toMatchObject({ status: 'unavailable' });
  });
  it('is unavailable when disclosure dates are more than 31 days apart', () => {
    expect(holdingsOverlap(a, { ...b, disclosureDate: '2026-08-15' })).toMatchObject({ status: 'unavailable' });
  });
  it('is marked partial when either disclosure covers less than 95% of the portfolio (e.g. top-10 only)', () => {
    const r = holdingsOverlap({ ...a, coveragePct: 60 }, b);
    expect(r).toMatchObject({ status: 'partial' });
    expect(r.note).toMatch(/not.*complete portfolio/i);
  });
});
