/**
 * Household cash-flow planner: monthly surplus, savings rate and an emergency-fund target.
 *
 * Definitions (see docs/CALCULATION-METHODOLOGY.md §Cash flow):
 * - income       = take-home income + other regular income (monthly, after tax).
 * - committed    = essential expenses + discretionary expenses + loan EMIs + existing monthly investments.
 * - surplus      = income − committed. It can be negative, and a negative surplus is never hidden.
 * - savingsRate  = (existing monthly investments + surplus) / income. A negative surplus lowers it,
 *                  and it can fall below zero (spending exceeds income).
 * - emergency-fund target = user-chosen months × the user-chosen monthly basis:
 *     'essential' = essential expenses + EMIs; 'total' = all expenses + EMIs.
 * - No return is assumed anywhere unless the caller passes an explicit `surplusProjection`.
 */
import { z } from 'zod';
import { projectAccumulation, type AccumulationResult } from './sip';
import { fail, ok, type CalcResult } from './types';
import {
  amountSchema,
  monthsSchema,
  parseInput,
  rateConventionSchema,
  returnPctSchema,
  timingSchema,
} from './validation';

export const cashFlowInputSchema = z.object({
  monthlyTakeHomeIncome: amountSchema,
  otherMonthlyIncome: amountSchema.default(0),
  essentialExpenses: amountSchema,
  discretionaryExpenses: amountSchema.default(0),
  loanEmis: amountSchema.default(0),
  existingMonthlyInvestments: amountSchema.default(0),
  /** Months of expenses to hold. The user chooses this; the engine has no default. */
  emergencyFundMonths: z.number().int().min(1).max(36),
  emergencyFundBasis: z.enum(['essential', 'total']),
  currentEmergencySavings: amountSchema.default(0),
  /** Optional: project investing the surplus. Only used when the surplus is positive. */
  surplusProjection: z
    .object({
      annualReturnPct: returnPctSchema,
      months: monthsSchema,
      timing: timingSchema.default('end'),
      rateConvention: rateConventionSchema.default('effective'),
    })
    .optional(),
});
export type CashFlowInput = z.input<typeof cashFlowInputSchema>;

export interface CashFlowResult {
  totalIncome: number;
  /** Essential + discretionary + EMIs. */
  totalExpenses: number;
  /** Expenses + existing investments. */
  totalCommitted: number;
  /** Income − committed outflows. Negative when the household overspends. */
  surplus: number;
  /** Percent of income; null when income is zero. Includes a negative surplus. */
  savingsRatePct: number | null;
  /** Existing investments only, percent of income; null when income is zero. */
  investmentRatePct: number | null;
  /** EMIs as a percent of income; null when income is zero. */
  emiToIncomePct: number | null;
  emergencyFund: {
    months: number;
    basis: 'essential' | 'total';
    monthlyBasisAmount: number;
    target: number;
    current: number;
    gap: number;
    /** current / target × 100; null when the target is zero. */
    coveragePct: number | null;
    /** How many months of the chosen basis the current savings cover; null when the basis is zero. */
    monthsCovered: number | null;
    /** Months of the full surplus needed to close the gap, with no return assumed; null if surplus ≤ 0. */
    monthsToCloseGapFromSurplus: number | null;
  };
  /** Present only when a projection was requested and the surplus is positive. */
  surplusProjection: AccumulationResult | null;
}

export function planCashFlow(input: CashFlowInput): CalcResult<CashFlowResult> {
  const parsed = parseInput(cashFlowInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const totalIncome = v.monthlyTakeHomeIncome + v.otherMonthlyIncome;
  const totalExpenses = v.essentialExpenses + v.discretionaryExpenses + v.loanEmis;
  const totalCommitted = totalExpenses + v.existingMonthlyInvestments;
  const surplus = totalIncome - totalCommitted;
  const pctOfIncome = (x: number) => (totalIncome > 0 ? (x / totalIncome) * 100 : null);

  const monthlyBasisAmount = v.emergencyFundBasis === 'essential' ? v.essentialExpenses + v.loanEmis : totalExpenses;
  const target = monthlyBasisAmount * v.emergencyFundMonths;
  const gap = Math.max(0, target - v.currentEmergencySavings);

  const warnings: string[] = [];
  if (totalIncome === 0) warnings.push('No income was entered, so rates relative to income are not available.');
  if (surplus < 0) {
    warnings.push(
      `Monthly outflows exceed income by ${Math.abs(surplus).toFixed(0)} rupees. The savings rate shown includes this shortfall.`,
    );
  }

  let projection: AccumulationResult | null = null;
  if (v.surplusProjection) {
    if (surplus > 0) {
      const res = projectAccumulation({ monthlyContribution: surplus, ...v.surplusProjection });
      if (!res.ok) return fail(res.error.code, res.error.message, res.error.field ? `surplusProjection.${res.error.field}` : 'surplusProjection');
      projection = res.value;
      warnings.push(...res.warnings);
    } else {
      warnings.push('There is no positive surplus to project.');
    }
  }

  return ok(
    {
      totalIncome,
      totalExpenses,
      totalCommitted,
      surplus,
      savingsRatePct: pctOfIncome(v.existingMonthlyInvestments + surplus),
      investmentRatePct: pctOfIncome(v.existingMonthlyInvestments),
      emiToIncomePct: pctOfIncome(v.loanEmis),
      emergencyFund: {
        months: v.emergencyFundMonths,
        basis: v.emergencyFundBasis,
        monthlyBasisAmount,
        target,
        current: v.currentEmergencySavings,
        gap,
        coveragePct: target > 0 ? (v.currentEmergencySavings / target) * 100 : null,
        monthsCovered: monthlyBasisAmount > 0 ? v.currentEmergencySavings / monthlyBasisAmount : null,
        monthsToCloseGapFromSurplus: surplus > 0 ? Math.ceil(gap / surplus) : null,
      },
      surplusProjection: projection,
    },
    warnings,
  );
}
