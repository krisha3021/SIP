import { describe, expect, it } from 'vitest';
import { backtestSipOnNav, scheduleDates, type NavBacktestInput } from '@/lib/finance/navBacktest';
import { nextAvailableNav, prepareNavSeries } from '@/lib/finance/navSeries';
import { businessDaySeries } from './fixtures';

// 17 June 2024 is a fixture holiday (a Monday).
const HOLIDAYS = ['2024-06-17'];
const flat = businessDaySeries('2024-01-01', '2024-12-31', () => 10, HOLIDAYS);

const run = (navs: Parameters<typeof backtestSipOnNav>[0], input: NavBacktestInput) => {
  const r = backtestSipOnNav(navs, input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
};

describe('NAV date mapping', () => {
  it('maps a Saturday to the following Monday', () => {
    // 2024-06-01 is a Saturday, so the next business day is Monday 2024-06-03.
    expect(nextAvailableNav(flat, '2024-06-01', 7)?.point.date).toBe('2024-06-03');
  });
  it('maps a holiday to the next business day', () => {
    expect(nextAvailableNav(flat, '2024-06-17', 7)?.point.date).toBe('2024-06-18');
  });
  it('uses the same day when a NAV exists', () => {
    expect(nextAvailableNav(flat, '2024-06-18', 7)?.lagDays).toBe(0);
  });
  it('returns null when the next NAV is beyond the allowed lag', () => {
    const gappy = [
      { date: '2024-01-01', nav: 10 },
      { date: '2024-02-01', nav: 10 },
    ];
    expect(nextAvailableNav(gappy, '2024-01-05', 7)).toBeNull();
  });
  it('clamps SIP day 31 to the last day of short months, including leap-year February', () => {
    expect(scheduleDates('2024-01-01', '2024-04-30', 31, 1)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
  });
});

describe('NAV series cleaning', () => {
  it('sorts, drops invalid rows and resolves conflicting duplicates with a warning', () => {
    const p = prepareNavSeries([
      { date: '2024-01-03', nav: 11 },
      { date: '2024-01-02', nav: 10 },
      { date: '2024-01-03', nav: 12 },
      { date: '2024-02-30', nav: 10 },
      { date: '2024-01-04', nav: -1 },
    ]);
    expect(p.points).toEqual([
      { date: '2024-01-02', nav: 10 },
      { date: '2024-01-03', nav: 12 },
    ]);
    expect(p.droppedInvalid).toBe(2);
    expect(p.conflictingDuplicates).toBe(1);
    expect(p.warnings.length).toBe(2);
  });
});

describe('historical SIP backtest', () => {
  it('never starts before the first NAV (scheme inception)', () => {
    const r = backtestSipOnNav(flat, { amount: 1000, startDate: '2023-06-01', endDate: '2024-06-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('START_BEFORE_INCEPTION');
      expect(r.error.message).toContain('2024-01-01');
    }
  });

  it('flat NAV: value equals invested and XIRR is 0%', () => {
    const r = run(flat, { amount: 1_000, sipDay: 1, startDate: '2024-01-01', endDate: '2024-12-31' });
    expect(r.ok && r.value.rows.length).toBe(12);
    if (!r.ok) return;
    expect(r.value.totalInvested).toBe(12_000);
    expect(r.value.totalUnits).toBeCloseTo(1_200, 9);
    expect(r.value.finalValue).toBeCloseTo(12_000, 9);
    expect(r.value.xirr.ok && r.value.xirr.value.rate).toBeCloseTo(0, 9);
    // Saturday 1 June → Monday 3 June
    expect(r.value.rows[5]!.scheduledDate).toBe('2024-06-01');
    expect(r.value.rows[5]!.effectiveDate).toBe('2024-06-03');
  });

  it('a doubling NAV over 365 days gives 100% XIRR on a single initial investment', () => {
    const navs = [
      { date: '2021-01-04', nav: 10 },
      { date: '2022-01-04', nav: 20 },
    ];
    const r = run(navs, { amount: 1, sipDay: 28, startDate: '2021-01-04', endDate: '2021-01-05', initialInvestment: 10_000 });
    if (!r.ok) return;
    // The SIP on the 28th has no NAV within 7 days, so it is skipped; only the initial investment counts.
    const r2 = run(navs, { amount: 1, sipDay: 28, startDate: '2021-01-04', endDate: '2022-01-04', initialInvestment: 10_000, maxLagDays: 0 });
    if (!r2.ok) return;
    expect(r2.value.rows.filter((x) => x.kind === 'initial')[0]!.units).toBe(1_000);
    expect(r2.value.skipped.length).toBeGreaterThan(0);
    expect(r2.value.finalValue).toBe(20_000);
    expect(r2.value.xirr.ok && r2.value.xirr.value.rate).toBeCloseTo(1, 9);
  });

  it('hand-worked three-instalment ledger with rising NAV', () => {
    const navs = [
      { date: '2024-01-05', nav: 10 },
      { date: '2024-02-05', nav: 20 },
      { date: '2024-03-05', nav: 25 },
      { date: '2024-03-28', nav: 30 },
    ];
    const r = run(navs, { amount: 1_000, sipDay: 5, startDate: '2024-01-05', endDate: '2024-03-31' });
    if (!r.ok) return;
    // units: 100 + 50 + 40 = 190; value at 30 = 5,700; invested 3,000
    expect(r.value.rows.map((x) => x.units)).toEqual([100, 50, 40]);
    expect(r.value.totalUnits).toBe(190);
    expect(r.value.valuationDate).toBe('2024-03-28');
    expect(r.value.finalValue).toBe(5_700);
    expect(r.value.gain).toBe(2_700);
    expect(r.value.cashFlows).toEqual([
      { date: '2024-01-05', amount: -1_000 },
      { date: '2024-02-05', amount: -1_000 },
      { date: '2024-03-05', amount: -1_000 },
      { date: '2024-03-28', amount: 5_700 },
    ]);
    // NAV-based drawdown is zero for a rising series.
    expect(r.value.navMaxDrawdownPct).toBe(0);
  });

  it('applies step-up per instalment year and transaction costs before allotment', () => {
    const navs = businessDaySeries('2020-01-01', '2021-12-31', () => 10);
    const r = run(navs, { amount: 1_000, sipDay: 10, startDate: '2020-01-01', endDate: '2021-12-31', annualStepUpPct: 10, transactionCostPct: 0.005 });
    if (!r.ok) return;
    expect(r.value.rows[12]!.amount).toBeCloseTo(1_100, 9);
    expect(r.value.totalInvested).toBeCloseTo(12_000 + 13_200, 9);
    expect(r.value.rows[0]!.units).toBeCloseTo((1_000 * (1 - 0.00005)) / 10, 12);
  });

  it('rounds units down when unit decimals are set', () => {
    const navs = [
      { date: '2024-01-05', nav: 3 },
      { date: '2024-02-05', nav: 3 },
    ];
    const r = run(navs, { amount: 1_000, sipDay: 5, startDate: '2024-01-05', endDate: '2024-01-31', unitDecimals: 3 });
    if (!r.ok) return;
    expect(r.value.rows[0]!.units).toBe(333.333);
  });

  it('warns when valuation uses a stale NAV and never manufactures later NAVs', () => {
    const r = run(flat, { amount: 1_000, sipDay: 1, startDate: '2024-01-01', endDate: '2025-03-31' });
    if (!r.ok) return;
    expect(r.value.valuationDate).toBe('2024-12-31');
    expect(r.warnings.some((w) => w.includes('2024-12-31'))).toBe(true);
    expect(r.value.rows.every((x) => x.effectiveDate <= '2024-12-31')).toBe(true);
  });

  it('measures drawdown on NAV, not on the contribution-inflated balance', () => {
    const navs = businessDaySeries('2024-01-01', '2024-06-30', (d) => (d >= '2024-03-01' && d < '2024-05-01' ? 7 : 10));
    const r = run(navs, { amount: 1_000, sipDay: 1, startDate: '2024-01-01', endDate: '2024-06-30' });
    if (!r.ok) return;
    expect(r.value.navMaxDrawdownPct).toBeCloseTo(-30, 9);
  });

  it('validates input', () => {
    expect(backtestSipOnNav(flat, { amount: 1000, startDate: '2024-05-01', endDate: '2024-04-01' }).ok).toBe(false);
    expect(backtestSipOnNav(flat, { amount: 0, startDate: '2024-01-01', endDate: '2024-04-01' }).ok).toBe(false);
    expect(backtestSipOnNav([], { amount: 1000, startDate: '2024-01-01', endDate: '2024-04-01' }).ok).toBe(false);
  });
});
