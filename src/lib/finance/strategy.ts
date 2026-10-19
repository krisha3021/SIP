/**
 * Strategy Lab engine (educational, deterministic + seeded simulation). It composes the tested engines — it does not
 * introduce new compounding maths:
 *   projection  → projectAccumulation (effective annual rate, end-of-month contributions)
 *   goal        → planGoal (target inflated to future ₹ unless given in future ₹)
 *   downside    → runMonteCarlo (seeded monthly lognormal; same seed for every strategy)
 *
 * Strategies
 *   fixed-sip, step-up-sip, contribution-75, contribution-125 — contributions only, at the BASE mix (the first mix).
 *   lumpsum-plus-sip — existing goal corpus invested at the start plus a fixed SIP, at the base mix.
 *   mix-1..mix-3 — same money as lumpsum-plus-sip, different equity/debt/gold weights.
 * Blended mix: expected return = Σ wᵢ·Eᵢ; volatility = √(wᵀΣw) with the user's correlations. These are the user's
 * assumptions, not forecasts. Illustrative rebalancing and STP are NOT modelled (listed in `notModelled`).
 */
import { z } from 'zod';
import { planGoal } from './goal';
import { runMonteCarlo } from './monteCarlo';
import { projectAccumulation } from './sip';
import { toTodaysRupees } from './rates';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, inflationPctSchema, parseInput } from './validation';

const assetSchema = z.object({ expectedReturnPct: z.number().min(-20).max(30), volatilityPct: z.number().min(0).max(60) });
const mixSchema = z
  .object({ label: z.string().min(1).max(40), equityPct: z.number().min(0).max(100), debtPct: z.number().min(0).max(100), goldPct: z.number().min(0).max(100) })
  .refine((m) => Math.abs(m.equityPct + m.debtPct + m.goldPct - 100) < 1e-9, 'Mix weights must add up to 100%');

export const DEFAULT_ASSETS = {
  equity: { expectedReturnPct: 12, volatilityPct: 18 },
  debt: { expectedReturnPct: 7, volatilityPct: 3 },
  gold: { expectedReturnPct: 8, volatilityPct: 15 },
};
export const DEFAULT_CORRELATIONS = { equityDebt: 0.1, equityGold: 0, debtGold: 0.1 };
export const DEFAULT_MIXES = [
  { label: 'Equity-heavy', equityPct: 80, debtPct: 15, goldPct: 5 },
  { label: 'Balanced', equityPct: 60, debtPct: 30, goldPct: 10 },
  { label: 'Debt-heavy', equityPct: 30, debtPct: 60, goldPct: 10 },
];

export const strategyInputSchema = z.object({
  /** Goal in today's ₹ (unless targetIsInTodaysRupees is false). Optional. */
  targetAmount: amountSchema.refine((v) => v > 0, 'Target must be greater than zero').optional(),
  targetIsInTodaysRupees: z.boolean().default(true),
  years: z.number().int().min(1).max(50),
  monthlyCapacity: amountSchema.refine((v) => v > 0, 'Monthly capacity must be greater than zero'),
  existingCorpus: amountSchema.default(0),
  stepUpPct: z.number().min(0).max(50).default(10),
  inflationPct: inflationPctSchema.default(6),
  /** Informational only: shown back to the user, never used to score or select. */
  liquidityReserveMonths: z.number().min(0).max(36).default(6),
  riskPreference: z.enum(['lower', 'balanced', 'higher']).default('balanced'),
  assets: z.object({ equity: assetSchema, debt: assetSchema, gold: assetSchema }).default(DEFAULT_ASSETS),
  correlations: z
    .object({ equityDebt: z.number().min(-1).max(1), equityGold: z.number().min(-1).max(1), debtGold: z.number().min(-1).max(1) })
    .default(DEFAULT_CORRELATIONS),
  mixes: z.array(mixSchema).min(1).max(3).default(DEFAULT_MIXES),
  simulations: z.number().int().min(100).max(5000).default(1000),
  seed: z.number().int().min(0).max(2 ** 32 - 1).default(20261019),
});
export type StrategyInput = z.input<typeof strategyInputSchema>;
type Parsed = z.infer<typeof strategyInputSchema>;

export interface StrategyOutcome {
  id: string;
  label: string;
  /** Number-free name used in facts and explanations, so naming a strategy never introduces an unbacked figure. */
  name: string;
  kind: 'contribution' | 'allocation';
  description: string;
  startingMonthly: number;
  stepUpPct: number;
  initialCorpus: number;
  mix: { equityPct: number; debtPct: number; goldPct: number };
  assumedReturnPct: number;
  assumedVolatilityPct: number;
  exceedsCapacity: boolean;
  totalContributions: number;
  corpusNominal: number;
  corpusToday: number;
  monteCarlo: { p10: number; p50: number; p90: number; goalSuccessRate: number | null };
  goal: { requiredMonthly: number; additionalMonthly: number; shortfallAtAssumedReturn: number } | null;
}

export interface StrategyFact {
  id: string;
  label: string;
  value: number;
  unit: 'inr' | 'percent' | 'years' | 'months' | 'count';
}

export interface StrategyResult {
  strategies: StrategyOutcome[];
  goal: { futureTarget: number; targetToday: number | null } | null;
  facts: StrategyFact[];
  assumptions: Parsed;
  notModelled: Array<{ id: string; label: string; reason: string }>;
  limitations: string[];
}

export function blendedAssumptions(
  mix: { equityPct: number; debtPct: number; goldPct: number },
  assets: Parsed['assets'],
  rho: Parsed['correlations'],
): { expectedReturnPct: number; volatilityPct: number } {
  const w = [mix.equityPct / 100, mix.debtPct / 100, mix.goldPct / 100];
  const s = [assets.equity.volatilityPct / 100, assets.debt.volatilityPct / 100, assets.gold.volatilityPct / 100];
  const c = [
    [1, rho.equityDebt, rho.equityGold],
    [rho.equityDebt, 1, rho.debtGold],
    [rho.equityGold, rho.debtGold, 1],
  ];
  let variance = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) variance += w[i]! * w[j]! * s[i]! * s[j]! * c[i]![j]!;
  return {
    expectedReturnPct: w[0]! * assets.equity.expectedReturnPct + w[1]! * assets.debt.expectedReturnPct + w[2]! * assets.gold.expectedReturnPct,
    volatilityPct: Math.sqrt(Math.max(0, variance)) * 100,
  };
}

interface Spec {
  id: string;
  label: string;
  name: string;
  kind: StrategyOutcome['kind'];
  description: string;
  monthly: number;
  stepUpPct: number;
  initialCorpus: number;
  mix: { equityPct: number; debtPct: number; goldPct: number };
}

export function compareStrategies(input: StrategyInput): CalcResult<StrategyResult> {
  const parsed = parseInput(strategyInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  const months = v.years * 12;
  const baseMix = v.mixes[0]!;
  const cap = v.monthlyCapacity;

  const specs: Spec[] = [
    { id: 'fixed-sip', label: 'Fixed SIP', name: 'Fixed SIP', kind: 'contribution', description: 'Your monthly capacity, unchanged every year; existing corpus not invested here.', monthly: cap, stepUpPct: 0, initialCorpus: 0, mix: baseMix },
    { id: 'step-up-sip', label: `Step-up SIP (+${v.stepUpPct}%/yr)`, name: 'Step-up SIP', kind: 'contribution', description: `Starts at your capacity and rises ${v.stepUpPct}% each year.`, monthly: cap, stepUpPct: v.stepUpPct, initialCorpus: 0, mix: baseMix },
    { id: 'lumpsum-plus-sip', label: 'Lump sum + SIP', name: 'Lump sum + SIP', kind: 'contribution', description: 'Existing goal corpus invested at the start, plus a fixed SIP at your capacity.', monthly: cap, stepUpPct: 0, initialCorpus: v.existingCorpus, mix: baseMix },
    { id: 'contribution-75', label: 'SIP at 75% of capacity', name: 'Lower SIP level', kind: 'contribution', description: 'A lower fixed SIP, for comparison.', monthly: cap * 0.75, stepUpPct: 0, initialCorpus: 0, mix: baseMix },
    { id: 'contribution-125', label: 'SIP at 125% of capacity', name: 'Higher SIP level', kind: 'contribution', description: 'A higher fixed SIP than the capacity you entered — shown only for comparison.', monthly: cap * 1.25, stepUpPct: 0, initialCorpus: 0, mix: baseMix },
    ...v.mixes.map((m, i) => ({
      id: `mix-${i + 1}`,
      label: `${m.label} (${m.equityPct}/${m.debtPct}/${m.goldPct})`,
      name: /[0-9]/.test(m.label) ? `Mix ${['one', 'two', 'three'][i]}` : m.label,
      kind: 'allocation' as const,
      description: `Lump sum + fixed SIP with ${m.equityPct}% equity, ${m.debtPct}% debt, ${m.goldPct}% gold.`,
      monthly: cap,
      stepUpPct: 0,
      initialCorpus: v.existingCorpus,
      mix: m,
    })),
  ];

  const futureTarget =
    v.targetAmount === undefined ? null : v.targetIsInTodaysRupees ? v.targetAmount * Math.pow(1 + v.inflationPct / 100, v.years) : v.targetAmount;

  const strategies: StrategyOutcome[] = [];
  for (const s of specs) {
    const blend = blendedAssumptions(s.mix, v.assets, v.correlations);
    const stepUp = s.stepUpPct > 0 ? ({ mode: 'percent', value: s.stepUpPct } as const) : ({ mode: 'none' } as const);
    const proj = projectAccumulation({ monthlyContribution: s.monthly, initialCorpus: s.initialCorpus, annualReturnPct: blend.expectedReturnPct, months, stepUp, inflationPct: v.inflationPct });
    if (!proj.ok) return fail(proj.error.code, `${s.label}: ${proj.error.message}`, proj.error.field);
    const mc = runMonteCarlo({
      monthlyContribution: s.monthly,
      initialCorpus: s.initialCorpus,
      years: v.years,
      expectedReturnPct: blend.expectedReturnPct,
      volatilityPct: blend.volatilityPct,
      annualStepUpPct: s.stepUpPct,
      goalAmount: futureTarget ?? Math.max(1, proj.value.summary.finalValue),
      goalInTodaysRupees: false,
      inflationPct: v.inflationPct,
      simulations: v.simulations,
      seed: v.seed,
    });
    if (!mc.ok) return fail(mc.error.code, `${s.label}: ${mc.error.message}`);
    let goal: StrategyOutcome['goal'] = null;
    if (futureTarget !== null) {
      const g = planGoal({ targetAmount: futureTarget, targetIsInTodaysRupees: false, months, annualReturnPct: blend.expectedReturnPct, initialCorpus: s.initialCorpus, stepUp, currentMonthlyContribution: s.monthly });
      if (!g.ok) return fail(g.error.code, `${s.label}: ${g.error.message}`);
      goal = {
        requiredMonthly: g.value.requiredMonthlyContribution,
        additionalMonthly: g.value.additionalMonthlyNeeded,
        shortfallAtAssumedReturn: Math.max(0, futureTarget - proj.value.summary.finalValue),
      };
    }
    strategies.push({
      id: s.id,
      label: s.label,
      name: s.name,
      kind: s.kind,
      description: s.description,
      startingMonthly: s.monthly,
      stepUpPct: s.stepUpPct,
      initialCorpus: s.initialCorpus,
      mix: { equityPct: s.mix.equityPct, debtPct: s.mix.debtPct, goldPct: s.mix.goldPct },
      assumedReturnPct: blend.expectedReturnPct,
      assumedVolatilityPct: blend.volatilityPct,
      exceedsCapacity: s.monthly > cap + 1e-9,
      totalContributions: proj.value.summary.totalInvested,
      corpusNominal: proj.value.summary.finalValue,
      corpusToday: toTodaysRupees(proj.value.summary.finalValue, v.inflationPct, months),
      monteCarlo: { p10: mc.value.terminal.p10, p50: mc.value.terminal.p50, p90: mc.value.terminal.p90, goalSuccessRate: futureTarget === null ? null : mc.value.goalSuccessRate },
      goal,
    });
  }

  const facts: StrategyFact[] = [
    { id: 'inputs.years', label: 'Horizon', value: v.years, unit: 'years' },
    { id: 'inputs.monthlyCapacity', label: 'Monthly capacity you entered', value: cap, unit: 'inr' },
    { id: 'inputs.existingCorpus', label: 'Existing goal corpus', value: v.existingCorpus, unit: 'inr' },
    { id: 'inputs.inflationPct', label: 'Inflation assumption', value: v.inflationPct, unit: 'percent' },
    { id: 'inputs.stepUpPct', label: 'Yearly step-up used by the step-up SIP', value: v.stepUpPct, unit: 'percent' },
    { id: 'inputs.simulations', label: 'Simulated paths per strategy', value: v.simulations, unit: 'count' },
  ];
  if (futureTarget !== null) {
    facts.push({ id: 'goal.futureTarget', label: 'Goal in future rupees', value: futureTarget, unit: 'inr' });
    if (v.targetIsInTodaysRupees && v.targetAmount !== undefined) facts.push({ id: 'goal.targetToday', label: "Goal in today's rupees", value: v.targetAmount, unit: 'inr' });
  }
  for (const s of strategies) {
    const p = s.id;
    facts.push(
      { id: `${p}.startingMonthly`, label: `${s.name}: starting monthly amount`, value: s.startingMonthly, unit: 'inr' },
      { id: `${p}.totalContributions`, label: `${s.name}: total contributions`, value: s.totalContributions, unit: 'inr' },
      { id: `${p}.corpusNominal`, label: `${s.name}: projected corpus at the assumed return`, value: s.corpusNominal, unit: 'inr' },
      { id: `${p}.corpusToday`, label: `${s.name}: projected corpus in today's rupees`, value: s.corpusToday, unit: 'inr' },
      { id: `${p}.blendedReturnPct`, label: `${s.name}: assumed return`, value: s.assumedReturnPct, unit: 'percent' },
      { id: `${p}.blendedVolatilityPct`, label: `${s.name}: assumed volatility`, value: s.assumedVolatilityPct, unit: 'percent' },
      { id: `${p}.mcP10`, label: `${s.name}: simulated lower-decile corpus (weak outcome)`, value: s.monteCarlo.p10, unit: 'inr' },
      { id: `${p}.mcP50`, label: `${s.name}: simulated median corpus`, value: s.monteCarlo.p50, unit: 'inr' },
      { id: `${p}.mcP90`, label: `${s.name}: simulated upper-decile corpus (strong outcome)`, value: s.monteCarlo.p90, unit: 'inr' },
    );
    if (s.monteCarlo.goalSuccessRate !== null) facts.push({ id: `${p}.goalSuccessPct`, label: `${s.name}: share of simulated paths reaching the goal`, value: s.monteCarlo.goalSuccessRate * 100, unit: 'percent' });
    if (s.goal) {
      facts.push(
        { id: `${p}.requiredMonthly`, label: `${s.name}: monthly amount needed at the assumed return`, value: s.goal.requiredMonthly, unit: 'inr' },
        { id: `${p}.additionalMonthly`, label: `${s.name}: extra monthly amount needed`, value: s.goal.additionalMonthly, unit: 'inr' },
        { id: `${p}.shortfall`, label: `${s.name}: shortfall at the assumed return`, value: s.goal.shortfallAtAssumedReturn, unit: 'inr' },
      );
    }
  }

  return ok({
    strategies,
    goal: futureTarget === null ? null : { futureTarget, targetToday: v.targetIsInTodaysRupees ? v.targetAmount ?? null : null },
    facts,
    assumptions: v,
    notModelled: [
      { id: 'rebalancing', label: 'Illustrative rebalancing policies', reason: 'Not modelled in this release: each mix is treated as a constant blend, which already assumes the weights are maintained.' },
      { id: 'stp', label: 'Systematic transfer plan (STP)', reason: 'Not modelled in this release.' },
      { id: 'swp', label: 'Systematic withdrawal plan (SWP)', reason: 'Available separately in the SWP and Retirement planners.' },
    ],
    limitations: [
      'All returns, volatilities and correlations are your assumptions, not forecasts.',
      'The deterministic projection uses the assumed (mean) return; the simulated median is lower when volatility is higher.',
      'Simulations assume independent monthly lognormal returns; real markets have fat tails, regime changes and correlated shocks.',
      'Fees beyond those reflected in your return assumption, taxes and exit loads are not deducted.',
      'Liquidity reserve and risk preference are shown back to you but are not used to score or select any strategy.',
    ],
  });
}
