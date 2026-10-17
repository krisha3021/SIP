/**
 * Life-stage & Risk Planner — an EDUCATIONAL illustration. It is not a suitability assessment, not
 * investment advice, and it names no product or fund. It does not predict returns. It is not AI.
 *
 * Method (docs/CALCULATION-METHODOLOGY.md §17); every number comes from `lifeStageConfig.ts`:
 *   1. Risk CAPACITY (objective, 0–100) = sum of five factor scores: horizon, dependants per earner,
 *      income stability, EMI-to-income, emergency-fund cover against the user's own target.
 *   2. Risk TOLERANCE (subjective, 0–100) = stated reaction to a 20% fall + investing experience.
 *   3. Overall profile = the profile of the LOWER of the two scores (Lakshya's documented rule).
 *   4. Prerequisite flags are evaluated before any range; some carry an equity cap.
 *   5. Asset-class RANGES (min–max %, never a point) come from the profile table. Debt is the remainder.
 *   6. Glide path: from the current age to after retirement, the equity range is capped by years to
 *      retirement, so it never widens with age. The current range = the glide path at today's age,
 *      then the prerequisite caps.
 */
import { z } from 'zod';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, parseInput } from './validation';
import {
  EXPERIENCE,
  INCOME_STABILITY,
  LIFE_STAGE_CONFIG,
  LOSS_REACTION,
  PFRDA_AUTO_CHOICE_REFERENCE,
  PROFILE_LABELS,
  lifeStageConfigSchema,
  type LifeStageConfig,
  type ProfileId,
} from './lifeStageConfig';

export const LIFE_STAGE_NOTICE =
  'Educational illustration only. This is not a suitability assessment, not investment advice, and not a recommendation ' +
  'of any product, fund or allocation. Lakshya is not registered with SEBI as an investment adviser or research analyst. ' +
  'The scores and ranges come from a fixed, published rule applied to the answers you gave; they do not consider your full ' +
  'financial situation and do not predict returns. For personalised advice, consult a SEBI-registered investment adviser.';

export const lifeStageInputSchema = z
  .object({
    currentAge: z.number().int().min(18).max(100),
    /** Must exceed the current age. Early retirement is allowed. */
    targetRetirementAge: z.number().int().min(19).max(100),
    /** Last age shown on the glide path; defaults to retirement + `yearsAfterRetirementDefault` (max 110). */
    planUntilAge: z.number().int().min(20).max(110).optional(),
    dependants: z.number().int().min(0).max(20),
    earningMembers: z.number().int().min(0).max(20),
    monthlyHouseholdIncome: amountSchema,
    monthlyEssentialExpenses: amountSchema,
    monthlyEmis: amountSchema.default(0),
    incomeStability: z.enum(INCOME_STABILITY),
    emergencyFundMonthsHeld: z.number().min(0).max(120),
    /** The user's own emergency-fund target in months. */
    emergencyFundTargetMonths: z.number().int().min(1).max(36),
    investmentHorizonYears: z.number().int().min(0).max(60),
    investmentExperience: z.enum(EXPERIENCE),
    lossReaction: z.enum(LOSS_REACTION),
    includePfrdaReference: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.targetRetirementAge <= v.currentAge) {
      ctx.addIssue({ code: 'custom', message: 'Target retirement age must be greater than current age', path: ['targetRetirementAge'] });
    }
    if (v.planUntilAge !== undefined && v.planUntilAge <= v.targetRetirementAge) {
      ctx.addIssue({ code: 'custom', message: 'Plan-until age must be greater than the retirement age', path: ['planUntilAge'] });
    }
  });
export type LifeStageInput = z.input<typeof lifeStageInputSchema>;

export interface FactorScore {
  id: string;
  label: string;
  /** The input value as used, in words (e.g. "12 years"). */
  value: string;
  points: number;
  maxPoints: number;
  explanation: string;
}

export interface ScoreBreakdown {
  score: number;
  maxScore: 100;
  factors: FactorScore[];
}

export interface PctRange {
  min: number;
  max: number;
}
export interface AssetRange {
  equity: PctRange;
  debt: PctRange;
  gold: PctRange;
}

export type PrerequisiteId = 'emergency-fund-below-target' | 'high-emi' | 'no-earners' | 'short-horizon' | 'essentials-exceed-income';

export interface PrerequisiteFlag {
  id: PrerequisiteId;
  explanation: string;
  /** Equity cap this flag applies to the current range, or null when it is a flag only. */
  equityCapPct: number | null;
}

export interface GlidePathRow {
  age: number;
  yearsToRetirement: number;
  phase: 'accumulation' | 'retirement';
  equityCapPct: number;
  range: AssetRange;
}

export interface LifeStageResult {
  capacity: ScoreBreakdown;
  tolerance: ScoreBreakdown;
  profile: { id: ProfileId; label: string; score: number; limitedBy: 'capacity' | 'tolerance' | 'both'; explanation: string };
  /** Evaluated before any range. */
  prerequisites: PrerequisiteFlag[];
  /** Profile table range before the glide path and prerequisite caps. */
  profileRange: AssetRange;
  /** Range for today: glide path at the current age, then prerequisite caps. */
  currentRange: AssetRange;
  glidePath: GlidePathRow[];
  pfrdaReference: {
    source: string;
    url: string;
    verifiedOn: string;
    note: string;
    series: Array<{ name: string; points: Array<{ age: number; equityPct: number }> }>;
  } | null;
  configVersion: string;
  notice: string;
}

type AtLeastRow = { atLeast: number; points: number };
type AtMostRow = { atMost: number; points: number };
const fromAtLeast = (rows: AtLeastRow[], x: number) => [...rows].sort((a, b) => b.atLeast - a.atLeast).find((r) => x >= r.atLeast)?.points ?? 0;
const fromAtMost = (rows: AtMostRow[], x: number) => [...rows].sort((a, b) => a.atMost - b.atMost).find((r) => x <= r.atMost)?.points ?? 0;
const fmt = (x: number, d = 1) => (Number.isInteger(x) ? String(x) : x.toFixed(d));

/** Derives a coherent range: debt is whatever equity and gold leave, bounded to 0–100. */
export function deriveRange(equity: PctRange, gold: PctRange): AssetRange {
  return {
    equity: { ...equity },
    gold: { ...gold },
    debt: { min: Math.max(0, 100 - equity.max - gold.max), max: Math.max(0, 100 - equity.min - gold.min) },
  };
}

function equityCapForYears(config: LifeStageConfig, yearsToRetirement: number): number {
  const row = [...config.glidePath].sort((a, b) => b.yearsToRetirementAtLeast - a.yearsToRetirementAtLeast).find((r) => yearsToRetirement >= r.yearsToRetirementAtLeast);
  return row ? row.equityMaxPct : 0;
}

function capEquity(base: { equity: PctRange; gold: PctRange }, cap: number): AssetRange {
  const max = Math.min(base.equity.max, cap);
  return deriveRange({ min: Math.min(base.equity.min, max), max }, base.gold);
}

function pfrdaEquityAt(series: readonly number[], age: number): number {
  const { firstAge, holdsAfterAge } = PFRDA_AUTO_CHOICE_REFERENCE;
  if (age <= firstAge) return series[0]!;
  if (age >= holdsAfterAge) return series[series.length - 1]!;
  return series[age - firstAge]!;
}

export function planLifeStageRisk(input: LifeStageInput, configInput: LifeStageConfig = LIFE_STAGE_CONFIG): CalcResult<LifeStageResult> {
  const parsed = parseInput(lifeStageInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  const cfgParsed = lifeStageConfigSchema.safeParse(configInput);
  if (!cfgParsed.success) {
    const issue = cfgParsed.error.issues[0];
    return fail('INVALID_INPUT', `Planner configuration is invalid: ${issue?.message ?? 'unknown issue'}`, `config.${issue?.path.join('.') ?? ''}`);
  }
  const c = cfgParsed.data;
  const cap = c.capacity;
  const tol = c.tolerance;

  // ── 1. Capacity ────────────────────────────────────────────────────────────
  const horizonPts = fromAtLeast(cap.horizonYears.table, v.investmentHorizonYears);
  const ratio = v.earningMembers > 0 ? v.dependants / v.earningMembers : null;
  const depPts = ratio === null ? 0 : fromAtMost(cap.dependantsPerEarner.table, ratio);
  const stabilityPts = cap.incomeStability.points[v.incomeStability];
  const emiPct = v.monthlyHouseholdIncome > 0 ? (v.monthlyEmis / v.monthlyHouseholdIncome) * 100 : null;
  const emiPts = emiPct === null ? 0 : fromAtMost(cap.emiToIncomePct.table, emiPct);
  const coverRatio = v.emergencyFundMonthsHeld / v.emergencyFundTargetMonths;
  const coverPts = fromAtLeast(cap.emergencyCoverRatio.table, coverRatio);

  const capacityFactors: FactorScore[] = [
    {
      id: 'horizon',
      label: 'Investment horizon',
      value: `${v.investmentHorizonYears} year(s)`,
      points: horizonPts,
      maxPoints: cap.horizonYears.maxPoints,
      explanation: `The longer until the money is needed, the more time it has to recover from a market fall. Yours is ${v.investmentHorizonYears} year(s).`,
    },
    {
      id: 'dependants-per-earner',
      label: 'Dependants per earning member',
      value: ratio === null ? `${v.dependants} dependant(s), no earning member` : `${fmt(ratio, 2)} (${v.dependants} dependant(s) ÷ ${v.earningMembers} earner(s))`,
      points: depPts,
      maxPoints: cap.dependantsPerEarner.maxPoints,
      explanation:
        ratio === null
          ? 'No one in the household earns, so there is no income to fall back on if investments lose value.'
          : 'The more people each earner supports, the less room the household has to absorb a loss.',
    },
    {
      id: 'income-stability',
      label: 'Income stability',
      value: v.incomeStability,
      points: stabilityPts,
      maxPoints: cap.incomeStability.maxPoints,
      explanation: 'A predictable income makes it less likely that investments must be sold during a downturn.',
    },
    {
      id: 'emi-to-income',
      label: 'Loan EMIs as a share of income',
      value: emiPct === null ? 'No income entered' : `${fmt(emiPct)}%`,
      points: emiPts,
      maxPoints: cap.emiToIncomePct.maxPoints,
      explanation: emiPct === null ? 'Without income, loan repayments cannot be assessed against it.' : 'EMIs are fixed commitments; a higher share leaves less surplus when markets fall.',
    },
    {
      id: 'emergency-cover',
      label: 'Emergency fund against your target',
      value: `${fmt(v.emergencyFundMonthsHeld)} of ${v.emergencyFundTargetMonths} month(s)`,
      points: coverPts,
      maxPoints: cap.emergencyCoverRatio.maxPoints,
      explanation: 'An emergency fund lets you meet an urgent expense without selling investments at a loss.',
    },
  ];
  const capacityScore = capacityFactors.reduce((s, f) => s + f.points, 0);

  // ── 2. Tolerance ───────────────────────────────────────────────────────────
  const reactionText: Record<(typeof LOSS_REACTION)[number], string> = {
    'sell-all': 'sell everything',
    'sell-some': 'sell some',
    hold: 'hold and wait',
    'invest-more': 'invest more',
  };
  const toleranceFactors: FactorScore[] = [
    {
      id: 'loss-reaction',
      label: 'Reaction to a 20% fall',
      value: reactionText[v.lossReaction],
      points: tol.lossReaction.points[v.lossReaction],
      maxPoints: tol.lossReaction.maxPoints,
      explanation: 'How you expect to act after a large fall is the most direct sign of how much loss you are willing to bear.',
    },
    {
      id: 'experience',
      label: 'Investing experience',
      value: v.investmentExperience,
      points: tol.experience.points[v.investmentExperience],
      maxPoints: tol.experience.maxPoints,
      explanation: 'People who have already lived through market falls tend to judge their own reaction more accurately.',
    },
  ];
  const toleranceScore = toleranceFactors.reduce((s, f) => s + f.points, 0);

  // ── 3. Profile = lower of the two ──────────────────────────────────────────
  const overall = Math.min(capacityScore, toleranceScore);
  const band = [...c.profileBands].sort((a, b) => b.minScore - a.minScore).find((b) => overall >= b.minScore)!;
  const limitedBy = capacityScore === toleranceScore ? 'both' : capacityScore < toleranceScore ? 'capacity' : 'tolerance';
  const profileExplanation =
    limitedBy === 'both'
      ? `Capacity and tolerance are both ${overall} out of 100.`
      : `Your ${limitedBy} score (${overall}) is lower than your ${limitedBy === 'capacity' ? 'tolerance' : 'capacity'} score (${limitedBy === 'capacity' ? toleranceScore : capacityScore}), so it sets the profile. Lakshya's rule always uses the lower of the two.`;

  // ── 4. Prerequisites (before any range) ────────────────────────────────────
  const p = c.prerequisites;
  const prerequisites: PrerequisiteFlag[] = [];
  if (v.emergencyFundMonthsHeld < v.emergencyFundTargetMonths) {
    prerequisites.push({
      id: 'emergency-fund-below-target',
      explanation: `Your emergency fund covers ${fmt(v.emergencyFundMonthsHeld)} month(s), below your own target of ${v.emergencyFundTargetMonths}. Many people build this buffer before taking market risk.`,
      equityCapPct: p.emergencyShortfallEquityCapPct,
    });
  }
  if (emiPct !== null && emiPct > p.highEmiToIncomePct) {
    prerequisites.push({
      id: 'high-emi',
      explanation: `Loan EMIs take ${fmt(emiPct)}% of income, above the ${p.highEmiToIncomePct}% level this planner flags. High fixed repayments reduce the ability to stay invested through a fall.`,
      equityCapPct: p.highEmiEquityCapPct,
    });
  }
  if (v.earningMembers === 0) {
    prerequisites.push({
      id: 'no-earners',
      explanation: `No household member has an earned income, so losses could not be made up from new savings. Equity is limited to ${p.noEarnersEquityCapPct}% in today's range.`,
      equityCapPct: p.noEarnersEquityCapPct,
    });
  }
  if (v.investmentHorizonYears < p.shortHorizonYears) {
    prerequisites.push({
      id: 'short-horizon',
      explanation: `Money needed within ${v.investmentHorizonYears} year(s) has little time to recover from a fall. Equity is limited to ${p.shortHorizonEquityCapPct}% in today's range.`,
      equityCapPct: p.shortHorizonEquityCapPct,
    });
  }
  if (v.monthlyEssentialExpenses + v.monthlyEmis > v.monthlyHouseholdIncome) {
    prerequisites.push({
      id: 'essentials-exceed-income',
      explanation: 'Essential expenses and EMIs are higher than household income, so there is no regular surplus to invest.',
      equityCapPct: null,
    });
  }

  // ── 5–6. Ranges and glide path ─────────────────────────────────────────────
  const base = c.ranges[band.profile];
  const profileRange = deriveRange(base.equity, base.gold);
  const endAge = Math.min(110, v.planUntilAge ?? v.targetRetirementAge + c.yearsAfterRetirementDefault);
  const glidePath: GlidePathRow[] = [];
  for (let age = v.currentAge; age <= endAge; age++) {
    const ytr = v.targetRetirementAge - age;
    const capPct = equityCapForYears(c, ytr);
    glidePath.push({ age, yearsToRetirement: ytr, phase: age < v.targetRetirementAge ? 'accumulation' : 'retirement', equityCapPct: capPct, range: capEquity(base, capPct) });
  }
  const caps = prerequisites.map((f) => f.equityCapPct).filter((x): x is number => x !== null);
  const today = glidePath[0]!.range;
  const currentRange = caps.length ? capEquity({ equity: today.equity, gold: today.gold }, Math.min(...caps)) : today;

  const pfrdaReference = v.includePfrdaReference
    ? {
        source: PFRDA_AUTO_CHOICE_REFERENCE.source,
        url: PFRDA_AUTO_CHOICE_REFERENCE.url,
        verifiedOn: PFRDA_AUTO_CHOICE_REFERENCE.verifiedOn,
        note: `Equity share of PFRDA's NPS Auto Choice life-cycle funds by age, as published. PFRDA's table covers ages up to ${PFRDA_AUTO_CHOICE_REFERENCE.firstAge} through ${PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge}; values after ${PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge} hold the age-${PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge} value. Shown for comparison only; it is one product's rule, not a recommendation.`,
        series: Object.entries(PFRDA_AUTO_CHOICE_REFERENCE.equityPctByAge).map(([name, s]) => ({
          name,
          points: glidePath.map((r) => ({ age: r.age, equityPct: pfrdaEquityAt(s, r.age) })),
        })),
      }
    : null;

  const warnings = [LIFE_STAGE_NOTICE];
  if (prerequisites.length) warnings.push(`${prerequisites.length} prerequisite(s) flagged; review them before the ranges.`);

  return ok(
    {
      capacity: { score: capacityScore, maxScore: 100, factors: capacityFactors },
      tolerance: { score: toleranceScore, maxScore: 100, factors: toleranceFactors },
      profile: { id: band.profile, label: PROFILE_LABELS[band.profile], score: overall, limitedBy, explanation: profileExplanation },
      prerequisites,
      profileRange,
      currentRange,
      glidePath,
      pfrdaReference,
      configVersion: c.version,
      notice: LIFE_STAGE_NOTICE,
    },
    warnings,
  );
}
