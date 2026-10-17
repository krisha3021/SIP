/**
 * Every weight, threshold and table used by the Life-stage & Risk Planner (`lifeStage.ts`).
 * Nothing numeric lives in the engine itself. The values are Lakshya's own documented educational rule
 * (docs/CALCULATION-METHODOLOGY.md §17); they are not taken from any regulator, index provider or firm,
 * except the optional PFRDA reference curve, which is quoted from its primary source with a date.
 *
 * Callers may pass an edited copy to `planLifeStageRisk(input, config)`; it is validated with
 * `lifeStageConfigSchema` first, so an inconsistent table is rejected rather than used.
 */
import { z } from 'zod';

const pct = z.number().min(0).max(100);
const range = z.object({ min: pct, max: pct }).refine((r) => r.min <= r.max, 'min must not exceed max');

/** Step table: the first row whose `atLeast` the value meets (rows sorted descending) gives the points. */
const stepTable = z.array(z.object({ atLeast: z.number(), points: z.number().min(0) })).min(1);

export const PROFILE_IDS = ['conservative', 'moderately-conservative', 'balanced', 'growth', 'high-growth'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export const INCOME_STABILITY = ['salaried-stable', 'salaried-variable', 'self-employed', 'irregular'] as const;
export const EXPERIENCE = ['none', 'under-3-years', '3-to-10-years', 'over-10-years'] as const;
/** "If your investments fell 20% in a few months, what would you most likely do?" */
export const LOSS_REACTION = ['sell-all', 'sell-some', 'hold', 'invest-more'] as const;

export const lifeStageConfigSchema = z
  .object({
    version: z.string(),
    capacity: z.object({
      /** Investment horizon in years → points (max 30). */
      horizonYears: z.object({ maxPoints: z.number().positive(), table: stepTable }),
      /** Dependants per earning member → points (max 20). Lower ratio = more capacity. Zero earners = 0 points. */
      dependantsPerEarner: z.object({ maxPoints: z.number().positive(), table: z.array(z.object({ atMost: z.number(), points: z.number().min(0) })).min(1) }),
      /** Income stability answer → points (max 20). */
      incomeStability: z.object({ maxPoints: z.number().positive(), points: z.record(z.enum(INCOME_STABILITY), z.number().min(0)) }),
      /** EMIs as % of monthly income → points (max 15). Lower = more capacity. No income = 0 points. */
      emiToIncomePct: z.object({ maxPoints: z.number().positive(), table: z.array(z.object({ atMost: z.number(), points: z.number().min(0) })).min(1) }),
      /** Emergency fund held ÷ user-chosen target months → points (max 15). */
      emergencyCoverRatio: z.object({ maxPoints: z.number().positive(), table: stepTable }),
    }),
    tolerance: z.object({
      lossReaction: z.object({ maxPoints: z.number().positive(), points: z.record(z.enum(LOSS_REACTION), z.number().min(0)) }),
      experience: z.object({ maxPoints: z.number().positive(), points: z.record(z.enum(EXPERIENCE), z.number().min(0)) }),
    }),
    /** Score (0–100) → profile: the first band whose `minScore` the score meets (sorted descending). */
    profileBands: z.array(z.object({ minScore: z.number().min(0).max(100), profile: z.enum(PROFILE_IDS) })).length(PROFILE_IDS.length),
    /** Asset-class ranges per profile, before the glide path. Debt is always the remainder (derived). */
    ranges: z.record(z.enum(PROFILE_IDS), z.object({ equity: range, gold: range })),
    /**
     * Glide path: the equity range is capped by years remaining to retirement. First row whose
     * `yearsToRetirementAtLeast` is met (sorted descending) gives the cap; negative values = after retirement.
     */
    glidePath: z.array(z.object({ yearsToRetirementAtLeast: z.number(), equityMaxPct: pct })).min(1),
    /** How many years after the retirement age the glide path continues when no plan-until age is given. */
    yearsAfterRetirementDefault: z.number().int().min(0).max(40),
    prerequisites: z.object({
      /** Flag when EMIs exceed this % of income. */
      highEmiToIncomePct: pct,
      /** Equity cap applied when the investment horizon is shorter than `shortHorizonYears`. */
      shortHorizonYears: z.number().int().min(0).max(10),
      shortHorizonEquityCapPct: pct,
      /** Equity cap when no household member earns. */
      noEarnersEquityCapPct: pct,
      /** Equity cap when the emergency fund is below the user's target (null = flag only, no cap). */
      emergencyShortfallEquityCapPct: pct.nullable(),
      /** Equity cap when EMIs are above the threshold (null = flag only). */
      highEmiEquityCapPct: pct.nullable(),
    }),
  })
  .superRefine((c, ctx) => {
    const capMax = c.capacity.horizonYears.maxPoints + c.capacity.dependantsPerEarner.maxPoints + c.capacity.incomeStability.maxPoints + c.capacity.emiToIncomePct.maxPoints + c.capacity.emergencyCoverRatio.maxPoints;
    const tolMax = c.tolerance.lossReaction.maxPoints + c.tolerance.experience.maxPoints;
    if (Math.abs(capMax - 100) > 1e-9) ctx.addIssue({ code: 'custom', message: `Capacity weights must sum to 100 (got ${capMax})`, path: ['capacity'] });
    if (Math.abs(tolMax - 100) > 1e-9) ctx.addIssue({ code: 'custom', message: `Tolerance weights must sum to 100 (got ${tolMax})`, path: ['tolerance'] });
    if (!c.profileBands.some((b) => b.minScore === 0)) ctx.addIssue({ code: 'custom', message: 'A profile band must start at score 0', path: ['profileBands'] });
    if (new Set(c.profileBands.map((b) => b.profile)).size !== PROFILE_IDS.length) ctx.addIssue({ code: 'custom', message: 'Each profile must appear exactly once', path: ['profileBands'] });
    for (const id of PROFILE_IDS) {
      const r = c.ranges[id];
      if (r && r.equity.min + r.gold.min > 100) ctx.addIssue({ code: 'custom', message: `Minimum equity + gold exceeds 100% for ${id}`, path: ['ranges', id] });
    }
    // Every factor's points must stay within its own maximum.
    const over = (pts: number[], max: number, path: string) => {
      if (pts.some((p) => p > max)) ctx.addIssue({ code: 'custom', message: `A ${path} entry exceeds its maximum points`, path: [path] });
    };
    over(c.capacity.horizonYears.table.map((r) => r.points), c.capacity.horizonYears.maxPoints, 'horizonYears');
    over(c.capacity.dependantsPerEarner.table.map((r) => r.points), c.capacity.dependantsPerEarner.maxPoints, 'dependantsPerEarner');
    over(Object.values(c.capacity.incomeStability.points), c.capacity.incomeStability.maxPoints, 'incomeStability');
    over(c.capacity.emiToIncomePct.table.map((r) => r.points), c.capacity.emiToIncomePct.maxPoints, 'emiToIncomePct');
    over(c.capacity.emergencyCoverRatio.table.map((r) => r.points), c.capacity.emergencyCoverRatio.maxPoints, 'emergencyCoverRatio');
    over(Object.values(c.tolerance.lossReaction.points), c.tolerance.lossReaction.maxPoints, 'lossReaction');
    over(Object.values(c.tolerance.experience.points), c.tolerance.experience.maxPoints, 'experience');
  });
export type LifeStageConfig = z.infer<typeof lifeStageConfigSchema>;

/** Last-row bounds for step tables ("anything above / below"). Finite because the schema rejects Infinity. */
export const OPEN_ENDED_MAX = 1e9;
export const OPEN_ENDED_MIN = -1e9;
/** "Any amount above zero" in the emergency-cover table. */
export const ANY_POSITIVE = 1e-9;

export const LIFE_STAGE_CONFIG: LifeStageConfig = {
  version: 'lakshya-life-stage-2026-10-17',
  capacity: {
    // Longer horizons can ride out more market falls before the money is needed.
    horizonYears: {
      maxPoints: 30,
      table: [
        { atLeast: 15, points: 30 },
        { atLeast: 8, points: 23 },
        { atLeast: 5, points: 15 },
        { atLeast: 3, points: 8 },
        { atLeast: 0, points: 0 },
      ],
    },
    // More people relying on each earner leaves less room to absorb a loss.
    dependantsPerEarner: {
      maxPoints: 20,
      table: [
        { atMost: 0, points: 20 },
        { atMost: 1, points: 15 },
        { atMost: 2, points: 10 },
        { atMost: 3, points: 5 },
        { atMost: OPEN_ENDED_MAX, points: 0 },
      ],
    },
    // Predictable income makes it less likely that investments must be sold in a downturn.
    incomeStability: {
      maxPoints: 20,
      points: { 'salaried-stable': 20, 'salaried-variable': 12, 'self-employed': 10, irregular: 0 },
    },
    // Loan repayments are fixed commitments that leave less surplus when markets fall.
    emiToIncomePct: {
      maxPoints: 15,
      table: [
        { atMost: 0, points: 15 },
        { atMost: 20, points: 12 },
        { atMost: 35, points: 7 },
        { atMost: 50, points: 3 },
        { atMost: OPEN_ENDED_MAX, points: 0 },
      ],
    },
    // An emergency fund avoids selling investments at a loss to meet an urgent expense.
    emergencyCoverRatio: {
      maxPoints: 15,
      table: [
        { atLeast: 1, points: 15 },
        { atLeast: 0.5, points: 8 },
        { atLeast: ANY_POSITIVE, points: 3 },
        { atLeast: 0, points: 0 },
      ],
    },
  },
  tolerance: {
    // Stated reaction to a 20% fall — the most direct question about willingness to bear losses.
    lossReaction: { maxPoints: 70, points: { 'sell-all': 0, 'sell-some': 20, hold: 50, 'invest-more': 70 } },
    // Having lived through market falls before tends to make stated tolerance more reliable.
    experience: { maxPoints: 30, points: { none: 0, 'under-3-years': 12, '3-to-10-years': 22, 'over-10-years': 30 } },
  },
  profileBands: [
    { minScore: 85, profile: 'high-growth' },
    { minScore: 65, profile: 'growth' },
    { minScore: 45, profile: 'balanced' },
    { minScore: 25, profile: 'moderately-conservative' },
    { minScore: 0, profile: 'conservative' },
  ],
  // Illustrative educational ranges, not targets and not a recommendation. Debt = 100 − equity − gold.
  ranges: {
    conservative: { equity: { min: 0, max: 20 }, gold: { min: 0, max: 10 } },
    'moderately-conservative': { equity: { min: 15, max: 35 }, gold: { min: 0, max: 10 } },
    balanced: { equity: { min: 30, max: 55 }, gold: { min: 5, max: 15 } },
    growth: { equity: { min: 45, max: 70 }, gold: { min: 5, max: 15 } },
    'high-growth': { equity: { min: 60, max: 85 }, gold: { min: 5, max: 15 } },
  },
  // Equity ceiling tightens as retirement approaches and stays low after it.
  glidePath: [
    { yearsToRetirementAtLeast: 15, equityMaxPct: 100 },
    { yearsToRetirementAtLeast: 10, equityMaxPct: 70 },
    { yearsToRetirementAtLeast: 5, equityMaxPct: 55 },
    { yearsToRetirementAtLeast: 1, equityMaxPct: 40 },
    { yearsToRetirementAtLeast: OPEN_ENDED_MIN, equityMaxPct: 30 },
  ],
  yearsAfterRetirementDefault: 15,
  prerequisites: {
    highEmiToIncomePct: 40,
    shortHorizonYears: 3,
    shortHorizonEquityCapPct: 10,
    noEarnersEquityCapPct: 20,
    emergencyShortfallEquityCapPct: null,
    highEmiEquityCapPct: null,
  },
};

export const PROFILE_LABELS: Record<ProfileId, string> = {
  conservative: 'Conservative',
  'moderately-conservative': 'Moderately conservative',
  balanced: 'Balanced',
  growth: 'Growth-oriented',
  'high-growth': 'High growth',
};

/**
 * Optional reference: equity share (%) by age in PFRDA's NPS Auto Choice life-cycle funds.
 * Quoted from the primary source below (the "Asset Allocation in Auto Choice" table, ages up to 35 … 55).
 * The published table ends at 55; `holdsAfterAge: 55` records that Lakshya holds the age-55 value constant
 * after that, which is Lakshya's reading of the "…/55Y" fund names, not a PFRDA table row.
 * This is shown only as a reference curve; it is a product's rule, not a recommendation.
 */
export const PFRDA_AUTO_CHOICE_REFERENCE = {
  source: 'PFRDA — Pension Funds: Investment Choices, Asset Allocation in Auto Choice',
  url: 'https://pfrda.org.in/intermediaries/registered-intermediaries/pension-funds',
  verifiedOn: '2026-10-17',
  firstAge: 35,
  holdsAfterAge: 55,
  /** Equity % for ages 35 (and below), 36, …, 55. */
  equityPctByAge: {
    'LC75 – High (15E/55Y)': [75, 71, 67, 63, 59, 55, 51, 47, 43, 39, 35, 32, 29, 26, 23, 20, 19, 18, 17, 16, 15],
    'LC50 – Moderate (10E/55Y)': [50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10],
    'LC25 – Low (5E/55Y)': [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5],
    'LC – Aggressive (35E/55Y)': [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 48, 46, 44, 42, 40, 39, 38, 37, 36, 35],
  },
} as const;
