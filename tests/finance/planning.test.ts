/**
 * Cash flow, scenario comparison, retirement and Allocation Explorer.
 * Expected values are hand-worked arithmetic or closed-form annuity values.
 */
import { describe, expect, it } from 'vitest';
import { planCashFlow, type CashFlowInput } from '@/lib/finance/cashflow';
import { compareScenarios } from '@/lib/finance/scenarios';
import { planRetirement, type RetirementInput } from '@/lib/finance/retirement';
import { simulateSwp } from '@/lib/finance/swp';
import { exploreAllocation, ALLOCATION_NOTICE, type AllocationInput } from '@/lib/finance/allocation';

const okv = <T,>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: { message: string } }) => {
  if (!r.ok) throw new Error(r.error.message);
  return r;
};

describe('cash-flow planner', () => {
  const household: CashFlowInput = {
    monthlyTakeHomeIncome: 100_000,
    essentialExpenses: 40_000,
    discretionaryExpenses: 15_000,
    loanEmis: 20_000,
    existingMonthlyInvestments: 10_000,
    emergencyFundMonths: 6,
    emergencyFundBasis: 'essential',
    currentEmergencySavings: 100_000,
  };

  it('computes surplus, savings rate and an emergency-fund target (hand-worked)', () => {
    const { value: v } = okv(planCashFlow(household));
    expect(v.totalExpenses).toBe(75_000);
    expect(v.totalCommitted).toBe(85_000);
    expect(v.surplus).toBe(15_000);
    expect(v.savingsRatePct).toBe(25); // (10,000 + 15,000) / 1,00,000
    expect(v.emiToIncomePct).toBe(20);
    expect(v.emergencyFund.monthlyBasisAmount).toBe(60_000); // essential 40,000 + EMI 20,000
    expect(v.emergencyFund.target).toBe(360_000);
    expect(v.emergencyFund.gap).toBe(260_000);
    expect(v.emergencyFund.coveragePct).toBeCloseTo(100_000 / 360_000 * 100, 12);
    expect(v.emergencyFund.monthsCovered).toBeCloseTo(100_000 / 60_000, 12);
    expect(v.emergencyFund.monthsToCloseGapFromSurplus).toBe(18); // ceil(260,000 / 15,000 = 17.33)
    expect(v.surplusProjection).toBeNull();
  });

  it('uses the total-expense basis when chosen', () => {
    const { value: v } = okv(planCashFlow({ ...household, emergencyFundBasis: 'total', emergencyFundMonths: 3 }));
    expect(v.emergencyFund.target).toBe(225_000); // 75,000 × 3
  });

  it('shows a negative surplus and lets it pull the savings rate below zero', () => {
    const r = okv(planCashFlow({ monthlyTakeHomeIncome: 50_000, essentialExpenses: 45_000, discretionaryExpenses: 10_000, existingMonthlyInvestments: 5_000, emergencyFundMonths: 6, emergencyFundBasis: 'total' }));
    expect(r.value.surplus).toBe(-10_000);
    expect(r.value.savingsRatePct).toBe(-10); // (5,000 − 10,000) / 50,000
    expect(r.value.emergencyFund.monthsToCloseGapFromSurplus).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/exceed income/);
  });

  it('returns null rates when there is no income', () => {
    const { value: v } = okv(planCashFlow({ monthlyTakeHomeIncome: 0, essentialExpenses: 10_000, emergencyFundMonths: 6, emergencyFundBasis: 'essential' }));
    expect(v.savingsRatePct).toBeNull();
    expect(v.emiToIncomePct).toBeNull();
  });

  it('projects a positive surplus only with explicit assumptions (closed-form annuity)', () => {
    // Surplus 10,000 at 1%/month for 120 months, end timing: 10,000 × (1.01^120 − 1) / 0.01 = 23,00,386.89
    const { value: v } = okv(
      planCashFlow({ monthlyTakeHomeIncome: 60_000, essentialExpenses: 50_000, emergencyFundMonths: 6, emergencyFundBasis: 'essential', surplusProjection: { annualReturnPct: 12, rateConvention: 'nominal', months: 120 } }),
    );
    expect(v.surplus).toBe(10_000);
    expect(v.surplusProjection?.summary.finalValue).toBeCloseTo(2_300_386.89, 1);
  });

  it('requires the user to choose the emergency-fund months', () => {
    const r = planCashFlow({ monthlyTakeHomeIncome: 1, essentialExpenses: 1, emergencyFundBasis: 'total' } as CashFlowInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe('emergencyFundMonths');
  });
});

describe('scenario comparison', () => {
  const a = { label: 'No growth', input: { monthlyContribution: 10_000, annualReturnPct: 0, months: 120 } };
  const b = { label: '12% nominal', input: { monthlyContribution: 10_000, annualReturnPct: 12, rateConvention: 'nominal' as const, months: 120 } };

  it('compares scenarios against the first one (closed-form values)', () => {
    const r = okv(compareScenarios({ scenarios: [a, b] }));
    const [s1, s2] = r.value.scenarios;
    expect(s1!.summary.finalValue).toBe(1_200_000);
    expect(s2!.summary.finalValue).toBeCloseTo(2_300_386.89, 1);
    expect(s2!.vsBaseline.finalValue).toBeCloseTo(1_100_386.89, 1);
    expect(s1!.vsBaseline.finalValue).toBe(0);
    expect(r.value.highestFinalValue).toBe('12% nominal');
    expect(r.value.yearly).toHaveLength(10);
    expect(r.value.yearly[9]!.values[0]).toBe(1_200_000);
    expect(r.value.conventionsDiffer).toBe(true); // effective (default) vs nominal
    expect(r.warnings.join(' ')).toMatch(/different contribution timing or rate conventions/);
  });

  it('aligns different horizons with nulls and flags them', () => {
    const c = { label: 'Short', input: { monthlyContribution: 10_000, annualReturnPct: 0, months: 60 } };
    const r = okv(compareScenarios({ scenarios: [a, c] }));
    expect(r.value.horizonsDiffer).toBe(true);
    expect(r.value.conventionsDiffer).toBe(false);
    expect(r.value.yearly[5]!.values).toEqual([720_000, null]);
    expect(r.value.yearly[4]!.values).toEqual([600_000, 600_000]);
  });

  it('rejects more than three scenarios, duplicate labels and invalid inner inputs', () => {
    const mk = (label: string) => ({ ...a, label });
    expect(compareScenarios({ scenarios: [mk('1'), mk('2'), mk('3'), mk('4')] }).ok).toBe(false);
    expect(compareScenarios({ scenarios: [mk('x'), mk('x')] }).ok).toBe(false);
    const bad = compareScenarios({ scenarios: [a, { label: 'Bad', input: { monthlyContribution: 10, annualReturnPct: 5, months: 0 } }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.field).toBe('scenarios.1.input.months');
      expect(bad.error.message).toMatch(/^Bad:/);
    }
  });
});

describe('retirement planner', () => {
  const plan: RetirementInput = {
    currentAge: 30,
    retirementAge: 31,
    planUntilAge: 32,
    monthlyContribution: 10_000,
    preRetirementReturnPct: 0,
    postRetirementReturnPct: 0,
    inflationPct: 0,
    desiredMonthlyIncomeToday: 10_000,
  };

  it('zero-return ledger: 12 × ₹10,000 saved funds exactly 12 × ₹10,000 withdrawn', () => {
    const { value: v } = okv(planRetirement(plan));
    expect(v.accumulationMonths).toBe(12);
    expect(v.withdrawalMonths).toBe(12);
    expect(v.corpusAtRetirement).toBe(120_000);
    expect(v.firstMonthlyWithdrawal).toBe(10_000);
    expect(v.requiredCorpus).toBe(120_000);
    expect(v.surplusOrShortfall).toBe(0);
    expect(v.swp.totalWithdrawn).toBe(120_000);
    expect(v.additionalMonthlyContributionNeeded).toBe(0);
  });

  it('zero-return shortfall: ₹15,000/month needs ₹1,80,000; the corpus runs out after 8 months', () => {
    const r = okv(planRetirement({ ...plan, desiredMonthlyIncomeToday: 15_000 }));
    expect(r.value.requiredCorpus).toBe(180_000);
    expect(r.value.surplusOrShortfall).toBe(-60_000);
    expect(r.value.swp.depletionMonth).toBe(8);
    expect(r.value.depletionAge).toBeCloseTo(31 + 8 / 12, 12);
    // 1,80,000 over 12 months at 0% needs ₹15,000/month; ₹10,000 is already invested.
    expect(r.value.additionalMonthlyContributionNeeded).toBeCloseTo(5_000, 6);
    expect(r.warnings.join(' ')).toMatch(/does not last/);
  });

  it('inflates the desired income to the retirement date', () => {
    const { value: v } = okv(planRetirement({ ...plan, inflationPct: 10, withdrawalIncreasePct: 0 }));
    expect(v.firstMonthlyWithdrawal).toBeCloseTo(11_000, 9); // 10,000 × 1.10 after 12 months
  });

  it('required corpus equals the annuity-due present value, and funding it exactly depletes at the horizon', () => {
    // W = 1,000, 1%/month, 12 withdrawals at the start of each month:
    // PV = 1,000 × (1 − 1.01^−12) / 0.01 × 1.01 = 11,367.63
    const { value: v } = okv(
      planRetirement({ ...plan, monthlyContribution: 1_000, desiredMonthlyIncomeToday: 1_000, postRetirementReturnPct: 12, rateConvention: 'nominal', withdrawalOrder: 'withdraw-then-grow' }),
    );
    expect(v.requiredCorpus).toBeCloseTo(11_367.63, 2);
    const check = simulateSwp({ corpus: v.requiredCorpus, monthlyWithdrawal: 1_000, annualReturnPct: 12, rateConvention: 'nominal', order: 'withdraw-then-grow', horizonMonths: 12 });
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.fullyFundedMonths).toBe(12);
    expect(check.value.remainingCorpus).toBeLessThan(0.01);
  });

  it('rejects a retirement age that does not exceed the current age', () => {
    const r = planRetirement({ ...plan, retirementAge: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe('retirementAge');
    const r2 = planRetirement({ ...plan, planUntilAge: 31 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.field).toBe('planUntilAge');
  });
});

describe('Allocation Explorer (educational rule of thumb)', () => {
  const run = (input: AllocationInput) => okv(exploreAllocation(input)).value;

  it('applies the default rule step by step (hand-worked)', () => {
    expect(run({ age: 30, horizonYears: 20, selfDescribedRiskComfort: 'balanced' })).toMatchObject({ equityPct: 70, goldPct: 10, debtPct: 20 });
    expect(run({ age: 30, horizonYears: 20, selfDescribedRiskComfort: 'comfortable' })).toMatchObject({ equityPct: 85, goldPct: 10, debtPct: 5 });
    expect(run({ age: 70, horizonYears: 10, selfDescribedRiskComfort: 'cautious' })).toMatchObject({ equityPct: 15, goldPct: 10, debtPct: 75 });
  });

  it('clamps to the equity bounds and the short-horizon limit', () => {
    expect(run({ age: 20, horizonYears: 30, selfDescribedRiskComfort: 'comfortable' }).equityPct).toBe(90); // 95 → max 90
    expect(run({ age: 30, horizonYears: 2, selfDescribedRiskComfort: 'balanced' })).toMatchObject({ equityPct: 20, goldPct: 10, debtPct: 70 });
  });

  it('every assumption is editable, and gold yields to equity when the total would exceed 100%', () => {
    expect(run({ age: 30, horizonYears: 20, selfDescribedRiskComfort: 'balanced', assumptions: { ageRuleConstant: 110 } }).equityPct).toBe(80);
    const v = run({ age: 18, horizonYears: 40, selfDescribedRiskComfort: 'comfortable', assumptions: { maxEquityPct: 100 } });
    expect(v).toMatchObject({ equityPct: 97, goldPct: 3, debtPct: 0 });
    expect(exploreAllocation({ age: 30, horizonYears: 5, selfDescribedRiskComfort: 'balanced', assumptions: { minEquityPct: 60, maxEquityPct: 50 } }).ok).toBe(false);
  });

  it('blends user-entered returns and splits an amount, with the notice attached', () => {
    const r = okv(exploreAllocation({ age: 30, horizonYears: 20, selfDescribedRiskComfort: 'balanced', expectedReturnsPct: { equity: 12, debt: 7, gold: 8 }, amount: 100_000 }));
    expect(r.value.blendedExpectedReturnPct).toBeCloseTo(10.6, 12); // 0.7·12 + 0.2·7 + 0.1·8
    expect(r.value.rupeeSplit).toEqual({ equity: 70_000, debt: 20_000, gold: 10_000 });
    expect(r.value.notice).toBe(ALLOCATION_NOTICE);
    expect(r.warnings).toContain(ALLOCATION_NOTICE);
    expect(r.value.steps.map((s) => s.step)).toEqual(['age-rule', 'risk-comfort', 'bounds', 'remainder']);
  });

  it('never presents itself as AI or as advice', () => {
    expect(ALLOCATION_NOTICE).toMatch(/not investment advice/);
    expect(ALLOCATION_NOTICE).toMatch(/not a suitability assessment/);
    expect(ALLOCATION_NOTICE).not.toMatch(/\bAI\b|personali[sz]ed|recommended for you/i);
  });
});
