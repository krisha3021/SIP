/**
 * Regression tests for defects found in the Phase 1 engines during the Agent 2 review (2026-10-17).
 * Expected values are hand-worked; none is produced by the function under test.
 */
import { describe, expect, it, vi } from 'vitest';
import { planGoal } from '@/lib/finance/goal';
import { simulateSwp } from '@/lib/finance/swp';
import { rollingReturns } from '@/lib/finance/rolling';
import { projectAccumulation } from '@/lib/finance/sip';
import { fetchNavHistory, inferPlanOption } from '@/lib/data/mfapi';
import { businessDaySeries, mfapiHistoryFixture } from './fixtures';

describe('plan/option inference (fund names that contain option words)', () => {
  it.each([
    ['Nippon India Growth Fund - Direct Plan - IDCW Option', 'Direct', 'IDCW'],
    ['Nippon India Growth Fund-Regular Plan-Growth Option', 'Regular', 'Growth'],
    ['ICICI Prudential Dividend Yield Equity Fund - Direct Plan - Growth', 'Direct', 'Growth'],
    ['ICICI Prudential Dividend Yield Equity Fund - Direct Plan - IDCW', 'Direct', 'IDCW'],
    ['Parag Parikh Flexi Cap Fund - Direct Plan - Growth', 'Direct', 'Growth'],
    ['Parag Parikh Flexi Cap Fund - Regular Plan - Monthly IDCW Payout', 'Regular', 'IDCW'],
    ['HDFC Mid-Cap Opportunities Fund - Growth Plan', 'Unknown', 'Growth'],
    ['Example Fund - Direct Plan - Bonus Option', 'Direct', 'Unknown'],
    ['Example Fund - Growth and IDCW', 'Unknown', 'Unknown'],
    ['Example Fund Direct Growth', 'Direct', 'Growth'],
  ] as const)('%s → %s / %s', (name, plan, option) => {
    expect(inferPlanOption(name)).toEqual({ plan, option });
  });
});

describe('goal planner: no 1-paisa stand-in leaks into reported values', () => {
  it('a zero current contribution with no corpus projects exactly zero', () => {
    const r = planGoal({ targetAmount: 1_000_000, targetIsInTodaysRupees: false, months: 120, annualReturnPct: 12, currentMonthlyContribution: 0 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.projectedWithCurrent).toBe(0);
    expect(r.value.shortfallWithCurrent).toBe(1_000_000);
  });
});

describe('SWP: real value of a start-of-month withdrawal', () => {
  it('withdraw-then-grow deflates month m by m − 1 months', () => {
    // 10% effective inflation. Month 1 is paid at t = 0 (no deflation); month 13 at t = 12 months (÷ 1.1).
    const r = simulateSwp({ corpus: 1_000_000, monthlyWithdrawal: 1_000, annualReturnPct: 0, inflationPct: 10, order: 'withdraw-then-grow', horizonMonths: 13 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.rows[0]!.realWithdrawal).toBe(1_000);
    expect(r.value.rows[12]!.realWithdrawal).toBeCloseTo(1_000 / 1.1, 9);
  });
  it('grow-then-withdraw deflates month m by m months', () => {
    const r = simulateSwp({ corpus: 1_000_000, monthlyWithdrawal: 1_000, annualReturnPct: 0, inflationPct: 10, order: 'grow-then-withdraw', horizonMonths: 12 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.rows[11]!.realWithdrawal).toBeCloseTo(1_000 / 1.1, 9);
  });
});

describe('rolling returns keep data-cleaning warnings', () => {
  it('reports ignored invalid observations', () => {
    const navs = [...businessDaySeries('2020-01-01', '2022-01-31', (_d, i) => 100 + i), { date: '2021-02-30', nav: 5 }];
    const r = rollingReturns(navs, 1);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.warnings.join(' ')).toMatch(/1 invalid NAV observation/);
  });
});

describe('step-up cap below the starting contribution', () => {
  it('warns that the cap has no effect', () => {
    const r = projectAccumulation({ monthlyContribution: 10_000, annualReturnPct: 0, months: 24, stepUp: { mode: 'percent', value: 10, maxMonthlyContribution: 5_000 } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.rows[0]!.contribution).toBe(10_000);
    expect(r.value.rows[12]!.contribution).toBe(10_000);
    expect(r.warnings.join(' ')).toMatch(/cap is below the starting contribution/);
  });
});

describe('MFAPI adapter cancellation', () => {
  it('does not call the provider when already cancelled', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const ac = new AbortController();
    ac.abort();
    await expect(fetchNavHistory('122639', { fetchImpl, signal: ac.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not retry after cancellation during a request', async () => {
    const ac = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      ac.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(fetchNavHistory('122639', { fetchImpl, retries: 2, signal: ac.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('still works without a signal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(mfapiHistoryFixture), { status: 200 }));
    await expect(fetchNavHistory('999001', { fetchImpl })).resolves.toMatchObject({ navs: expect.any(Array) });
  });
});
