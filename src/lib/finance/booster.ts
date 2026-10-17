/**
 * Drawdown-triggered contribution booster, compared fairly.
 *
 * Three strategies run on the same price/NAV series and schedule:
 *   1. base       — level SIP.
 *   2. booster    — SIP × multiplier when the price is below its running peak by a rule threshold.
 *                   The drawdown uses only observations up to the instalment date (no look-ahead).
 *   3. comparable — base SIP plus the booster's total extra capital spread evenly across all
 *                   instalments. This isolates timing from simply investing more money.
 *                   Note: this baseline knows the total extra capital in advance, which a real
 *                   investor would not. It is an attribution device, not an executable strategy.
 */
import { z } from 'zod';
import { nextAvailableNav, prepareNavSeries, indexOnOrBefore, type NavPoint } from './navSeries';
import { scheduleDates } from './navBacktest';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, parseInput } from './validation';
import { xirr, type DatedCashFlow } from './xirr';
import { isIsoDate } from './dates';

const ruleSchema = z.object({ drawdownPct: z.number().min(1).max(90), multiplier: z.number().min(1).max(10) });

export const boosterInputSchema = z.object({
  baseAmount: amountSchema.refine((v) => v > 0, 'Base SIP must be greater than zero'),
  sipDay: z.number().int().min(1).max(31).default(5),
  startDate: z.string().refine(isIsoDate),
  endDate: z.string().refine(isIsoDate),
  rules: z.array(ruleSchema).min(1).max(6),
  maxLagDays: z.number().int().min(0).max(31).default(7),
});
export type BoosterInput = z.input<typeof boosterInputSchema>;

export interface StrategyOutcome {
  name: 'base' | 'booster' | 'comparable';
  totalInvested: number;
  finalValue: number;
  profit: number;
  xirrPct: number | null;
  /** Capital invested beyond the base strategy. */
  additionalCapital: number;
}

export interface BoosterResult {
  strategies: [StrategyOutcome, StrategyOutcome, StrategyOutcome];
  /** Booster final value minus comparable-capital final value: the part attributable to timing. */
  timingEffect: number;
  /** Booster final value minus base final value: includes the effect of investing more money. */
  totalDifferenceVsBase: number;
  boostedInstalments: number;
  maxMultiplier: number;
  instalments: Array<{ scheduledDate: string; effectiveDate: string; nav: number; drawdownPct: number; multiplier: number }>;
}

export function compareBooster(rawNavs: NavPoint[], input: BoosterInput): CalcResult<BoosterResult> {
  const parsed = parseInput(boosterInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  if (v.endDate <= v.startDate) return fail('INVALID_INPUT', 'End date must be after start date', 'endDate');

  const { points } = prepareNavSeries(rawNavs);
  if (points.length < 2) return fail('INSUFFICIENT_DATA', 'Not enough price observations.');
  if (v.startDate < points[0]!.date) {
    return fail('START_BEFORE_INCEPTION', `Data begins on ${points[0]!.date}.`, 'startDate');
  }
  const valuation = points[indexOnOrBefore(points, v.endDate)]!;

  // Running peak up to each observation index.
  const runningPeak: number[] = [];
  let peak = -Infinity;
  for (const p of points) {
    peak = Math.max(peak, p.nav);
    runningPeak.push(peak);
  }
  const indexOf = new Map(points.map((p, i) => [p.date, i]));
  const rules = [...v.rules].sort((a, b) => a.drawdownPct - b.drawdownPct);

  const instalments: BoosterResult['instalments'] = [];
  for (const d of scheduleDates(v.startDate, v.endDate, v.sipDay, 1)) {
    const hit = nextAvailableNav(points, d, v.maxLagDays);
    if (!hit || hit.point.date > valuation.date) continue;
    const dd = hit.point.nav / runningPeak[indexOf.get(hit.point.date)!]! - 1;
    let mult = 1;
    // 1e-9 tolerance so an exact threshold (e.g. 108/120 − 1 = −10%) is not missed through float rounding.
    for (const r of rules) if (-dd * 100 >= r.drawdownPct - 1e-9) mult = Math.max(mult, r.multiplier);
    instalments.push({ scheduledDate: d, effectiveDate: hit.point.date, nav: hit.point.nav, drawdownPct: dd * 100, multiplier: mult });
  }
  if (instalments.length === 0) return fail('INSUFFICIENT_DATA', 'No instalment matched an observed price.');

  const baseInvested = v.baseAmount * instalments.length;
  const boosterAmounts = instalments.map((i) => v.baseAmount * i.multiplier);
  const extra = boosterAmounts.reduce((s, a) => s + a, 0) - baseInvested;
  const comparableAmounts = instalments.map(() => v.baseAmount + extra / instalments.length);

  const run = (name: StrategyOutcome['name'], amounts: number[]): StrategyOutcome => {
    let units = 0;
    const flows: DatedCashFlow[] = [];
    amounts.forEach((a, k) => {
      units += a / instalments[k]!.nav;
      flows.push({ date: instalments[k]!.effectiveDate, amount: -a });
    });
    const invested = amounts.reduce((s, a) => s + a, 0);
    const finalValue = units * valuation.nav;
    flows.push({ date: valuation.date, amount: finalValue });
    const x = xirr(flows);
    return {
      name,
      totalInvested: invested,
      finalValue,
      profit: finalValue - invested,
      xirrPct: x.ok ? x.value.rate * 100 : null,
      additionalCapital: invested - baseInvested,
    };
  };

  const base = run('base', instalments.map(() => v.baseAmount));
  const booster = run('booster', boosterAmounts);
  const comparable = run('comparable', comparableAmounts);

  return ok({
    strategies: [base, booster, comparable],
    timingEffect: booster.finalValue - comparable.finalValue,
    totalDifferenceVsBase: booster.finalValue - base.finalValue,
    boostedInstalments: instalments.filter((i) => i.multiplier > 1).length,
    maxMultiplier: Math.max(...instalments.map((i) => i.multiplier)),
    instalments,
  });
}
