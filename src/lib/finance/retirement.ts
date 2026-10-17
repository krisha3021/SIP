/**
 * Retirement plan: accumulate until retirement, then draw down until the planning age.
 *
 * Chain (see docs/CALCULATION-METHODOLOGY.md §Retirement):
 *   1. `projectAccumulation` from current age to retirement age → corpus at retirement (nominal).
 *   2. The desired monthly income, stated in today's rupees, is inflated to the retirement date. That is the
 *      first monthly withdrawal. It then rises once a year by `withdrawalIncreasePct` (default: inflation).
 *   3. `simulateSwp` from retirement age to the planning ("plan until") age at the post-retirement return.
 *   4. Required corpus = present value at retirement of the full withdrawal schedule, discounted at the
 *      post-retirement monthly rate with the same withdrawal ordering as the SWP. Funding it exactly makes
 *      the SWP end at zero in its final month.
 *   5. The additional monthly contribution that would close any gap comes from `planGoal`, with the
 *      same step-up and conventions as the accumulation phase.
 * Ages are whole years; months = 12 × (difference in ages).
 */
import { z } from 'zod';
import { planGoal } from './goal';
import { monthlyRate, toFutureRupees } from './rates';
import { projectAccumulation, stepUpSchema, type AccumulationSummary, type AccumulationRow } from './sip';
import { simulateSwp, type SwpResult } from './swp';
import { fail, ok, type CalcResult } from './types';
import {
  amountSchema,
  inflationPctSchema,
  parseInput,
  rateConventionSchema,
  returnPctSchema,
  timingSchema,
} from './validation';

const ageSchema = z.number().int().min(18).max(100);

export const retirementInputSchema = z
  .object({
    currentAge: ageSchema,
    retirementAge: ageSchema,
    /** Age until which withdrawals must last. A planning assumption, not a life-expectancy prediction. */
    planUntilAge: z.number().int().min(19).max(110),
    monthlyContribution: amountSchema,
    initialCorpus: amountSchema.default(0),
    stepUp: stepUpSchema.default({ mode: 'none' }),
    preRetirementReturnPct: returnPctSchema,
    postRetirementReturnPct: returnPctSchema,
    inflationPct: inflationPctSchema,
    /** Desired monthly income at retirement, in today's rupees. */
    desiredMonthlyIncomeToday: amountSchema.refine((v) => v > 0, 'Desired income must be greater than zero'),
    /** Yearly increase of the withdrawal after retirement. Defaults to the inflation rate. */
    withdrawalIncreasePct: z.number().min(0).max(30).optional(),
    timing: timingSchema.default('end'),
    rateConvention: rateConventionSchema.default('effective'),
    withdrawalOrder: z.enum(['withdraw-then-grow', 'grow-then-withdraw']).default('withdraw-then-grow'),
  })
  .superRefine((v, ctx) => {
    if (v.retirementAge <= v.currentAge) {
      ctx.addIssue({ code: 'custom', message: 'Retirement age must be greater than current age', path: ['retirementAge'] });
    }
    if (v.planUntilAge <= v.retirementAge) {
      ctx.addIssue({ code: 'custom', message: 'Plan-until age must be greater than retirement age', path: ['planUntilAge'] });
    }
    if (v.monthlyContribution === 0 && v.initialCorpus === 0) {
      ctx.addIssue({ code: 'custom', message: 'Enter a contribution or an existing corpus', path: ['monthlyContribution'] });
    }
  });
export type RetirementInput = z.input<typeof retirementInputSchema>;

export interface RetirementResult {
  accumulationMonths: number;
  withdrawalMonths: number;
  accumulation: { summary: AccumulationSummary; yearly: AccumulationRow[] };
  corpusAtRetirement: number;
  /** First monthly withdrawal in nominal rupees at retirement. */
  firstMonthlyWithdrawal: number;
  withdrawalIncreasePct: number;
  swp: Omit<SwpResult, 'rows'> & { yearly: SwpResult['rows'] };
  /** Corpus needed at retirement to fund every withdrawal until the plan-until age. */
  requiredCorpus: number;
  /** corpusAtRetirement − requiredCorpus (negative = shortfall). */
  surplusOrShortfall: number;
  /** Age (fractional years) at which money runs out; null if it lasts to the plan-until age. */
  depletionAge: number | null;
  /** Extra monthly contribution (starting now, same step-up) that closes the gap; 0 when funded. */
  additionalMonthlyContributionNeeded: number;
}

/** Present value at retirement of the withdrawal schedule, discounted at monthly rate r. */
export function presentValueOfWithdrawals(
  firstWithdrawal: number,
  annualIncreasePct: number,
  months: number,
  r: number,
  order: 'withdraw-then-grow' | 'grow-then-withdraw',
): number {
  let pv = 0;
  for (let m = 1; m <= months; m++) {
    const w = firstWithdrawal * Math.pow(1 + annualIncreasePct / 100, Math.floor((m - 1) / 12));
    const t = order === 'withdraw-then-grow' ? m - 1 : m;
    pv += w / Math.pow(1 + r, t);
  }
  return pv;
}

export function planRetirement(input: RetirementInput): CalcResult<RetirementResult> {
  const parsed = parseInput(retirementInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const accumulationMonths = (v.retirementAge - v.currentAge) * 12;
  const withdrawalMonths = (v.planUntilAge - v.retirementAge) * 12;
  if (accumulationMonths > 1200 || withdrawalMonths > 1200) return fail('OUT_OF_DOMAIN', 'Each phase is limited to 100 years.');

  const acc = projectAccumulation({
    monthlyContribution: v.monthlyContribution,
    initialCorpus: v.initialCorpus,
    annualReturnPct: v.preRetirementReturnPct,
    months: accumulationMonths,
    timing: v.timing,
    rateConvention: v.rateConvention,
    stepUp: v.stepUp,
    inflationPct: v.inflationPct,
  });
  if (!acc.ok) return acc;
  const warnings = [...acc.warnings];

  const corpusAtRetirement = acc.value.summary.finalValue;
  const firstMonthlyWithdrawal = toFutureRupees(v.desiredMonthlyIncomeToday, v.inflationPct, accumulationMonths);
  const increase = v.withdrawalIncreasePct ?? Math.max(0, v.inflationPct);

  const rPost = monthlyRate(v.postRetirementReturnPct, v.rateConvention);
  const requiredCorpus = presentValueOfWithdrawals(firstMonthlyWithdrawal, increase, withdrawalMonths, rPost, v.withdrawalOrder);

  let swpResult: SwpResult;
  if (corpusAtRetirement > 0) {
    const swp = simulateSwp({
      corpus: corpusAtRetirement,
      monthlyWithdrawal: firstMonthlyWithdrawal,
      annualReturnPct: v.postRetirementReturnPct,
      rateConvention: v.rateConvention,
      annualIncreasePct: increase,
      inflationPct: v.inflationPct,
      order: v.withdrawalOrder,
      horizonMonths: withdrawalMonths,
    });
    if (!swp.ok) return swp;
    swpResult = swp.value;
  } else {
    return fail('OUT_OF_DOMAIN', 'The projected corpus at retirement is zero, so no withdrawal can be simulated.');
  }

  let additional = 0;
  if (requiredCorpus > corpusAtRetirement) {
    const goal = planGoal({
      targetAmount: requiredCorpus,
      targetIsInTodaysRupees: false,
      months: accumulationMonths,
      annualReturnPct: v.preRetirementReturnPct,
      inflationPct: v.inflationPct,
      timing: v.timing,
      rateConvention: v.rateConvention,
      initialCorpus: v.initialCorpus,
      stepUp: v.stepUp,
      currentMonthlyContribution: v.monthlyContribution,
    });
    if (!goal.ok) return goal;
    additional = goal.value.additionalMonthlyNeeded;
    warnings.push('At these assumptions the corpus does not last until the plan-until age.');
  }
  if (v.postRetirementReturnPct < v.inflationPct) {
    warnings.push('The post-retirement return is below inflation, so the corpus loses purchasing power while it is drawn down.');
  }

  const { rows, ...swpSummary } = swpResult;
  const depletionAge = swpResult.depletionMonth === null ? null : v.retirementAge + swpResult.depletionMonth / 12;

  return ok(
    {
      accumulationMonths,
      withdrawalMonths,
      accumulation: { summary: acc.value.summary, yearly: acc.value.yearly },
      corpusAtRetirement,
      firstMonthlyWithdrawal,
      withdrawalIncreasePct: increase,
      swp: { ...swpSummary, yearly: rows.filter((r) => r.month % 12 === 0 || r.month === rows.length) },
      requiredCorpus,
      surplusOrShortfall: corpusAtRetirement - requiredCorpus,
      depletionAge,
      additionalMonthlyContributionNeeded: additional,
    },
    warnings,
  );
}
