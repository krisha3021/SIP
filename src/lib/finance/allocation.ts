/**
 * Allocation Explorer — an educational illustration of a transparent, editable rule of thumb.
 *
 * This is NOT investment advice and NOT a suitability assessment. It does not know the user's
 * income stability, liabilities, dependants, tax position, liquidity needs or experience. It is not AI.
 * Every number comes from the assumptions below, which the user can see and change. The result
 * carries a step-by-step trace so the UI can show exactly how it was produced.
 *
 * Rule (all inputs editable):
 *   1. equity  = ageRuleConstant − age                         (the "100 minus age" family of heuristics)
 *   2. equity += riskAdjustment[selfDescribedRiskComfort]
 *   3. equity  = clamp(equity, minEquityPct, maxEquityPct)
 *   4. if horizonYears < shortHorizonYears: equity = min(equity, shortHorizonMaxEquityPct)
 *   5. gold    = min(goldPct, 100 − equity)
 *   6. debt    = 100 − equity − gold
 * Optional: a blended return from user-entered expected returns per asset class (an assumption,
 * never a forecast), and a rupee split of an amount.
 */
import { z } from 'zod';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, parseInput } from './validation';

const pct = z.number().min(0).max(100);

export const DEFAULT_ALLOCATION_ASSUMPTIONS = {
  ageRuleConstant: 100,
  riskAdjustmentPct: { cautious: -15, balanced: 0, comfortable: 15 },
  minEquityPct: 0,
  maxEquityPct: 90,
  shortHorizonYears: 3,
  shortHorizonMaxEquityPct: 20,
  goldPct: 10,
} as const;

export const allocationAssumptionsSchema = z
  .object({
    ageRuleConstant: z.number().min(50).max(150).default(DEFAULT_ALLOCATION_ASSUMPTIONS.ageRuleConstant),
    riskAdjustmentPct: z
      .object({ cautious: z.number().min(-50).max(50), balanced: z.number().min(-50).max(50), comfortable: z.number().min(-50).max(50) })
      .default({ ...DEFAULT_ALLOCATION_ASSUMPTIONS.riskAdjustmentPct }),
    minEquityPct: pct.default(DEFAULT_ALLOCATION_ASSUMPTIONS.minEquityPct),
    maxEquityPct: pct.default(DEFAULT_ALLOCATION_ASSUMPTIONS.maxEquityPct),
    shortHorizonYears: z.number().int().min(0).max(30).default(DEFAULT_ALLOCATION_ASSUMPTIONS.shortHorizonYears),
    shortHorizonMaxEquityPct: pct.default(DEFAULT_ALLOCATION_ASSUMPTIONS.shortHorizonMaxEquityPct),
    goldPct: pct.default(DEFAULT_ALLOCATION_ASSUMPTIONS.goldPct),
  })
  .refine((a) => a.minEquityPct <= a.maxEquityPct, { message: 'Minimum equity must not exceed maximum equity', path: ['minEquityPct'] });

export const allocationInputSchema = z.object({
  age: z.number().int().min(18).max(100),
  horizonYears: z.number().int().min(0).max(60),
  /** The user's own description of their comfort with ups and downs; not a risk-profiling questionnaire. */
  selfDescribedRiskComfort: z.enum(['cautious', 'balanced', 'comfortable']),
  // prefault (not default): Zod 4 parses the fallback, so the inner defaults are applied.
  assumptions: allocationAssumptionsSchema.prefault({}),
  /** Optional user-entered return assumptions (percent per year) used only for an illustrative blend. */
  expectedReturnsPct: z
    .object({ equity: z.number().min(-20).max(30), debt: z.number().min(-20).max(30), gold: z.number().min(-20).max(30) })
    .optional(),
  /** Optional amount to split in rupees. */
  amount: amountSchema.optional(),
});
export type AllocationInput = z.input<typeof allocationInputSchema>;

export interface AllocationStep {
  step: string;
  equityPct: number;
  explanation: string;
}

export interface AllocationResult {
  equityPct: number;
  debtPct: number;
  goldPct: number;
  steps: AllocationStep[];
  assumptions: z.infer<typeof allocationAssumptionsSchema>;
  blendedExpectedReturnPct: number | null;
  rupeeSplit: { equity: number; debt: number; gold: number } | null;
  /** Fixed educational notice that the UI must display with the result. */
  notice: string;
}

export const ALLOCATION_NOTICE =
  'Educational illustration of an editable rule of thumb. It is not investment advice, not a recommendation, and not a ' +
  'suitability assessment. It does not consider your full financial situation. Consider consulting a SEBI-registered investment adviser.';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function exploreAllocation(input: AllocationInput): CalcResult<AllocationResult> {
  const parsed = parseInput(allocationInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  const a = v.assumptions;
  const steps: AllocationStep[] = [];

  let equity = a.ageRuleConstant - v.age;
  steps.push({ step: 'age-rule', equityPct: equity, explanation: `${a.ageRuleConstant} − age ${v.age} = ${equity}%` });

  const adj = a.riskAdjustmentPct[v.selfDescribedRiskComfort];
  equity += adj;
  steps.push({ step: 'risk-comfort', equityPct: equity, explanation: `Adjustment for "${v.selfDescribedRiskComfort}": ${adj >= 0 ? '+' : ''}${adj} points` });

  const clamped = clamp(equity, a.minEquityPct, a.maxEquityPct);
  steps.push({
    step: 'bounds',
    equityPct: clamped,
    explanation: clamped === equity ? `Within ${a.minEquityPct}–${a.maxEquityPct}%` : `Limited to the ${a.minEquityPct}–${a.maxEquityPct}% range`,
  });
  equity = clamped;

  if (v.horizonYears < a.shortHorizonYears && equity > a.shortHorizonMaxEquityPct) {
    equity = a.shortHorizonMaxEquityPct;
    steps.push({
      step: 'short-horizon',
      equityPct: equity,
      explanation: `Horizon of ${v.horizonYears} year(s) is shorter than ${a.shortHorizonYears}; equity limited to ${a.shortHorizonMaxEquityPct}%`,
    });
  }

  const gold = Math.min(a.goldPct, 100 - equity);
  const debt = 100 - equity - gold;
  steps.push({ step: 'remainder', equityPct: equity, explanation: `Gold ${gold}%, debt takes the remaining ${debt}%` });

  if (![equity, gold, debt].every(Number.isFinite) || debt < -1e-9) return fail('NON_FINITE_RESULT', 'The allocation could not be computed.');

  const blended = v.expectedReturnsPct
    ? (equity * v.expectedReturnsPct.equity + debt * v.expectedReturnsPct.debt + gold * v.expectedReturnsPct.gold) / 100
    : null;
  const split = v.amount !== undefined ? { equity: (v.amount * equity) / 100, debt: (v.amount * debt) / 100, gold: (v.amount * gold) / 100 } : null;

  const warnings = [ALLOCATION_NOTICE];
  if (blended !== null) warnings.push('The blended return is a weighted average of the returns you entered. It is an assumption, not a forecast.');

  return ok(
    {
      equityPct: equity,
      debtPct: debt,
      goldPct: gold,
      steps,
      assumptions: a,
      blendedExpectedReturnPct: blended,
      rupeeSplit: split,
      notice: ALLOCATION_NOTICE,
    },
    warnings,
  );
}
