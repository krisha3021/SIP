/**
 * Unified accumulation engine: standard SIP, step-up SIP, lumpsum, existing corpus + SIP,
 * SIP pauses and one-time top-ups all run through `projectAccumulation`.
 *
 * Conventions (see docs/CALCULATION-METHODOLOGY.md):
 * - Month m runs from 1..months. Initial corpus is invested at t = 0.
 * - timing 'begin': value_m = (value_{m-1} + c_m) · (1 + r)   (annuity due)
 *   timing 'end':   value_m =  value_{m-1} · (1 + r) + c_m    (ordinary annuity)
 * - Step-ups apply at the start of each contribution year: months 13, 25, 37, …
 * - Top-ups follow the same timing as regular contributions in their month.
 */
import { z } from 'zod';
import { monthlyRate, effectiveAnnualFromMonthly, toTodaysRupees } from './rates';
import { fail, ok, type CalcResult } from './types';
import {
  amountSchema,
  inflationPctSchema,
  monthsSchema,
  parseInput,
  rateConventionSchema,
  returnPctSchema,
  timingSchema,
  allFinite,
} from './validation';

export const stepUpSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),
  z.object({
    mode: z.literal('percent'),
    value: z.number().min(0).max(100),
    maxMonthlyContribution: amountSchema.optional(),
  }),
  z.object({
    mode: z.literal('amount'),
    value: amountSchema,
    maxMonthlyContribution: amountSchema.optional(),
  }),
]);
export type StepUp = z.infer<typeof stepUpSchema>;

export const accumulationInputSchema = z
  .object({
    monthlyContribution: amountSchema,
    initialCorpus: amountSchema.default(0),
    annualReturnPct: returnPctSchema,
    months: monthsSchema,
    timing: timingSchema.default('end'),
    rateConvention: rateConventionSchema.default('effective'),
    stepUp: stepUpSchema.default({ mode: 'none' }),
    inflationPct: inflationPctSchema.default(0),
    pauses: z
      .array(z.object({ fromMonth: z.number().int().min(1), toMonth: z.number().int().min(1) }))
      .max(20)
      .default([]),
    topUps: z
      .array(z.object({ month: z.number().int().min(1), amount: amountSchema }))
      .max(50)
      .default([]),
    /** Optional monthly budget used only for affordability warnings. */
    affordableMonthlyLimit: amountSchema.optional(),
  })
  .superRefine((v, ctx) => {
    v.pauses.forEach((p, i) => {
      if (p.toMonth < p.fromMonth)
        ctx.addIssue({ code: 'custom', message: 'Pause must end on or after it starts', path: ['pauses', i] });
      if (p.fromMonth > v.months)
        ctx.addIssue({ code: 'custom', message: 'Pause starts after the plan ends', path: ['pauses', i] });
    });
    v.topUps.forEach((t, i) => {
      if (t.month > v.months)
        ctx.addIssue({ code: 'custom', message: 'Top-up falls after the plan ends', path: ['topUps', i] });
    });
    if (v.monthlyContribution === 0 && v.initialCorpus === 0 && v.topUps.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Enter a contribution or an initial amount', path: ['monthlyContribution'] });
  });
export type AccumulationInput = z.input<typeof accumulationInputSchema>;

export interface AccumulationRow {
  month: number;
  /** Regular contribution scheduled for this month (0 when paused). */
  contribution: number;
  topUp: number;
  /** Cumulative invested amount, including the initial corpus. */
  invested: number;
  value: number;
  gains: number;
  /** `value` deflated to today's rupees. */
  realValue: number;
}

export interface AccumulationSummary {
  totalInvested: number;
  finalValue: number;
  gains: number;
  realFinalValue: number;
  firstMonthlyContribution: number;
  lastMonthlyContribution: number;
  monthlyRate: number;
  effectiveAnnualRatePct: number;
}

export interface AccumulationResult {
  rows: AccumulationRow[];
  /** One row per completed year, plus the final partial year if any. */
  yearly: AccumulationRow[];
  summary: AccumulationSummary;
}

/** Scheduled regular contribution for month m (1-based) before pauses, honouring step-up and cap. */
export function scheduledContribution(base: number, stepUp: StepUp, month: number): number {
  const yearIndex = Math.floor((month - 1) / 12); // 0 for months 1..12
  let c: number;
  switch (stepUp.mode) {
    case 'none':
      return base;
    case 'percent':
      c = base * Math.pow(1 + stepUp.value / 100, yearIndex);
      break;
    case 'amount':
      c = base + stepUp.value * yearIndex;
      break;
  }
  return stepUp.maxMonthlyContribution !== undefined ? Math.min(c, Math.max(base, stepUp.maxMonthlyContribution)) : c;
}

export function projectAccumulation(input: AccumulationInput): CalcResult<AccumulationResult> {
  const parsed = parseInput(accumulationInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const r = monthlyRate(v.annualReturnPct, v.rateConvention);
  const paused = (m: number) => v.pauses.some((p) => m >= p.fromMonth && m <= p.toMonth);
  const topUpByMonth = new Map<number, number>();
  for (const t of v.topUps) topUpByMonth.set(t.month, (topUpByMonth.get(t.month) ?? 0) + t.amount);

  const rows: AccumulationRow[] = [];
  let value = v.initialCorpus;
  let invested = v.initialCorpus;
  let lastScheduled = v.monthlyContribution;

  for (let m = 1; m <= v.months; m++) {
    const scheduled = scheduledContribution(v.monthlyContribution, v.stepUp, m);
    lastScheduled = scheduled;
    const contribution = paused(m) ? 0 : scheduled;
    const topUp = topUpByMonth.get(m) ?? 0;
    const inflow = contribution + topUp;
    value = v.timing === 'begin' ? (value + inflow) * (1 + r) : value * (1 + r) + inflow;
    invested += inflow;
    rows.push({
      month: m,
      contribution,
      topUp,
      invested,
      value,
      gains: value - invested,
      realValue: toTodaysRupees(value, v.inflationPct, m),
    });
  }

  const last = rows[rows.length - 1];
  if (!last || !allFinite(last.value, last.realValue, last.invested)) {
    return fail('NON_FINITE_RESULT', 'The result is too large to represent. Shorten the horizon or reduce inputs.');
  }

  const warnings: string[] = [];
  if (v.stepUp.mode !== 'none' && v.monthlyContribution > 0 && lastScheduled > 10 * v.monthlyContribution) {
    warnings.push(
      `Step-up raises the monthly contribution to ${Math.round(lastScheduled / v.monthlyContribution)}× the starting amount. Check that this is affordable, or set a cap.`,
    );
  }
  if (v.affordableMonthlyLimit !== undefined && lastScheduled > v.affordableMonthlyLimit) {
    warnings.push('The scheduled contribution exceeds the monthly budget you entered.');
  }
  if (
    v.stepUp.mode !== 'none' &&
    v.stepUp.maxMonthlyContribution !== undefined &&
    v.stepUp.maxMonthlyContribution < v.monthlyContribution
  ) {
    warnings.push('The step-up cap is below the starting contribution, so it has no effect; contributions never fall below the starting amount.');
  }
  if (v.annualReturnPct < 0) warnings.push('A negative return assumption means the plan loses value over time.');

  const yearly = rows.filter((row) => row.month % 12 === 0 || row.month === v.months);

  return ok(
    {
      rows,
      yearly,
      summary: {
        totalInvested: last.invested,
        finalValue: last.value,
        gains: last.gains,
        realFinalValue: last.realValue,
        firstMonthlyContribution: v.monthlyContribution,
        lastMonthlyContribution: lastScheduled,
        monthlyRate: r,
        effectiveAnnualRatePct: effectiveAnnualFromMonthly(r) * 100,
      },
    },
    warnings,
  );
}
