/**
 * Goal planning / reverse SIP. Uses the same timing and rate conventions as `projectAccumulation`,
 * so that feeding the required contribution back into the forward engine reproduces the target.
 */
import { z } from 'zod';
import { monthlyRate, toFutureRupees } from './rates';
import { projectAccumulation, stepUpSchema, type StepUp } from './sip';
import { fail, ok, type CalcResult, type ContributionTiming } from './types';
import {
  amountSchema,
  inflationPctSchema,
  monthsSchema,
  parseInput,
  rateConventionSchema,
  returnPctSchema,
  timingSchema,
} from './validation';

/** Future value of a level monthly annuity of 1 over n months at monthly rate r. */
export function annuityFactor(r: number, n: number, timing: ContributionTiming): number {
  if (r === 0) return n;
  const ordinary = (Math.pow(1 + r, n) - 1) / r;
  return timing === 'begin' ? ordinary * (1 + r) : ordinary;
}

export const goalInputSchema = z.object({
  /** Goal amount. Interpreted in today's rupees when `targetIsInTodaysRupees` is true. */
  targetAmount: amountSchema.refine((v) => v > 0, 'Target must be greater than zero'),
  targetIsInTodaysRupees: z.boolean().default(true),
  months: monthsSchema,
  annualReturnPct: returnPctSchema,
  inflationPct: inflationPctSchema.default(6),
  timing: timingSchema.default('end'),
  rateConvention: rateConventionSchema.default('effective'),
  initialCorpus: amountSchema.default(0),
  stepUp: stepUpSchema.default({ mode: 'none' }),
  /** Contribution the user already makes, used for shortfall reporting. */
  currentMonthlyContribution: amountSchema.default(0),
});
export type GoalInput = z.input<typeof goalInputSchema>;

export interface GoalResult {
  /** Nominal rupees needed at the end of the horizon. */
  futureTarget: number;
  /** Value of the existing corpus at the horizon. */
  corpusFutureValue: number;
  /** Required starting monthly contribution (0 if the corpus alone suffices). */
  requiredMonthlyContribution: number;
  alreadyFunded: boolean;
  /** Projected value with the user's current contribution and the same step-up. */
  projectedWithCurrent: number;
  shortfallWithCurrent: number;
  additionalMonthlyNeeded: number;
}

/** Projected nominal value at the horizon for a starting contribution `s`. */
function projectedValue(v: z.infer<typeof goalInputSchema>, s: number): number | null {
  // The accumulation engine rejects an all-zero plan. A 1-paisa corpus stands in, and its exactly known
  // growth (0.01 · (1 + r)^n) is subtracted again so it never leaks into reported values.
  const dust = s === 0 && v.initialCorpus === 0 ? 0.01 : 0;
  const res = projectAccumulation({
    monthlyContribution: s,
    initialCorpus: v.initialCorpus,
    annualReturnPct: v.annualReturnPct,
    months: v.months,
    timing: v.timing,
    rateConvention: v.rateConvention,
    stepUp: v.stepUp,
    ...(dust ? { initialCorpus: dust } : {}),
  });
  if (!res.ok) return null;
  const dustFv = dust * Math.pow(1 + monthlyRate(v.annualReturnPct, v.rateConvention), v.months);
  return Math.max(0, res.value.summary.finalValue - dustFv);
}

function hasCap(stepUp: StepUp): boolean {
  return stepUp.mode !== 'none' && stepUp.maxMonthlyContribution !== undefined;
}

export function planGoal(input: GoalInput): CalcResult<GoalResult> {
  const parsed = parseInput(goalInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const futureTarget = v.targetIsInTodaysRupees ? toFutureRupees(v.targetAmount, v.inflationPct, v.months) : v.targetAmount;
  const r = monthlyRate(v.annualReturnPct, v.rateConvention);
  const corpusFutureValue = v.initialCorpus * Math.pow(1 + r, v.months);
  const gap = futureTarget - corpusFutureValue;

  let required = 0;
  if (gap > 0) {
    if (!hasCap(v.stepUp)) {
      // Without a cap, terminal value is linear in the starting contribution:
      // FV(s) = corpusFV + s · F, where F is the FV of a ₹1 starting contribution.
      const F =
        v.stepUp.mode === 'none'
          ? annuityFactor(r, v.months, v.timing)
          : (() => {
              const unit = projectAccumulation({
                monthlyContribution: 1,
                annualReturnPct: v.annualReturnPct,
                months: v.months,
                timing: v.timing,
                rateConvention: v.rateConvention,
                stepUp: v.stepUp.mode === 'amount' ? { mode: 'none' } : v.stepUp,
              });
              return unit.ok ? unit.value.summary.finalValue : NaN;
            })();
      if (v.stepUp.mode === 'amount') {
        // FV(s) = corpusFV + s·A + step·B, where B is the FV of the step-increment stream alone.
        const B = (() => {
          let total = 0;
          for (let m = 1; m <= v.months; m++) {
            const inc = v.stepUp.mode === 'amount' ? v.stepUp.value * Math.floor((m - 1) / 12) : 0;
            const remaining = v.timing === 'begin' ? v.months - m + 1 : v.months - m;
            total += inc * Math.pow(1 + r, remaining);
          }
          return total;
        })();
        required = Math.max(0, (gap - B) / F);
      } else {
        required = gap / F;
      }
    } else {
      // A cap makes FV piecewise-linear but still monotone in s: bracketed bisection.
      let lo = 0;
      let hi = Math.max(1, gap / Math.max(1, v.months));
      let guard = 0;
      while ((projectedValue(v, hi) ?? Infinity) < futureTarget && guard++ < 200) hi *= 2;
      if ((projectedValue(v, hi) ?? -Infinity) < futureTarget) {
        return fail('NOT_CONVERGED', 'The target cannot be reached within the contribution cap.');
      }
      for (let i = 0; i < 200 && hi - lo > 1e-6 * Math.max(1, hi); i++) {
        const mid = (lo + hi) / 2;
        if ((projectedValue(v, mid) ?? Infinity) < futureTarget) lo = mid;
        else hi = mid;
      }
      required = hi;
    }
  }

  if (!Number.isFinite(required)) return fail('NON_FINITE_RESULT', 'The required contribution could not be computed.');

  const projectedWithCurrent = projectedValue(v, v.currentMonthlyContribution) ?? NaN;
  const shortfallWithCurrent = Math.max(0, futureTarget - projectedWithCurrent);

  const warnings: string[] = [];
  if (v.annualReturnPct <= 0) warnings.push('With a zero or negative return, the goal relies entirely on contributions.');

  return ok(
    {
      futureTarget,
      corpusFutureValue,
      requiredMonthlyContribution: required,
      alreadyFunded: gap <= 0,
      projectedWithCurrent,
      shortfallWithCurrent,
      additionalMonthlyNeeded: Math.max(0, required - v.currentMonthlyContribution),
    },
    warnings,
  );
}
