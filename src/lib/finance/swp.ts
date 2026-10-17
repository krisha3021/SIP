/**
 * Systematic withdrawal plan (SWP) / retirement drawdown, simulated month by month.
 *
 * - `order: 'withdraw-then-grow'`: the withdrawal is taken at the start of the month, then the balance grows.
 * - `order: 'grow-then-withdraw'`: the balance grows for the month, then the withdrawal is taken.
 * - Withdrawals rise once a year (months 13, 25, …) by `annualIncreasePct`.
 * - When the balance cannot cover a withdrawal, the actual partial amount is recorded and the plan ends.
 */
import { z } from 'zod';
import { monthlyRate, toTodaysRupees } from './rates';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, inflationPctSchema, monthsSchema, parseInput, rateConventionSchema, returnPctSchema } from './validation';

export const swpInputSchema = z.object({
  corpus: amountSchema.refine((v) => v > 0, 'Corpus must be greater than zero'),
  monthlyWithdrawal: amountSchema.refine((v) => v > 0, 'Withdrawal must be greater than zero'),
  annualReturnPct: returnPctSchema,
  rateConvention: rateConventionSchema.default('effective'),
  /** Annual increase applied to the withdrawal amount; commonly set equal to inflation. */
  annualIncreasePct: z.number().min(0).max(30).default(0),
  /** Used only to express values in today's rupees. */
  inflationPct: inflationPctSchema.default(6),
  order: z.enum(['withdraw-then-grow', 'grow-then-withdraw']).default('grow-then-withdraw'),
  horizonMonths: monthsSchema.default(480),
});
export type SwpInput = z.input<typeof swpInputSchema>;

export interface SwpRow {
  month: number;
  openingBalance: number;
  growth: number;
  scheduledWithdrawal: number;
  actualWithdrawal: number;
  closingBalance: number;
  cumulativeWithdrawn: number;
  realClosingBalance: number;
  realWithdrawal: number;
}

export interface SwpResult {
  rows: SwpRow[];
  /** Month in which the corpus ran out (the month with a partial or final withdrawal); null if it lasted. */
  depletionMonth: number | null;
  /** Months for which the full scheduled withdrawal was paid. */
  fullyFundedMonths: number;
  /** Amount paid in the depletion month, if smaller than scheduled. */
  finalPartialWithdrawal: number | null;
  totalWithdrawn: number;
  remainingCorpus: number;
  realRemainingCorpus: number;
  initialWithdrawalRatePct: number;
}

/** Balances below 1 paisa are treated as exhausted, to avoid floating-point dust. */
const EPSILON = 0.005;

export function simulateSwp(input: SwpInput): CalcResult<SwpResult> {
  const parsed = parseInput(swpInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  const r = monthlyRate(v.annualReturnPct, v.rateConvention);

  const rows: SwpRow[] = [];
  let balance = v.corpus;
  let cumulative = 0;
  let depletionMonth: number | null = null;
  let finalPartial: number | null = null;
  let fullyFunded = 0;

  for (let m = 1; m <= v.horizonMonths; m++) {
    const scheduled = v.monthlyWithdrawal * Math.pow(1 + v.annualIncreasePct / 100, Math.floor((m - 1) / 12));
    const opening = balance;
    let growth: number;
    let actual: number;
    if (v.order === 'withdraw-then-grow') {
      actual = Math.min(scheduled, balance);
      const afterWithdrawal = balance - actual;
      growth = afterWithdrawal * r;
      balance = afterWithdrawal + growth;
    } else {
      growth = balance * r;
      const available = balance + growth;
      actual = Math.min(scheduled, Math.max(0, available));
      balance = available - actual;
    }
    if (balance < EPSILON) balance = 0;
    cumulative += actual;

    const shortfall = actual < scheduled - EPSILON;
    if (!shortfall) fullyFunded++;

    rows.push({
      month: m,
      openingBalance: opening,
      growth,
      scheduledWithdrawal: scheduled,
      actualWithdrawal: actual,
      closingBalance: balance,
      cumulativeWithdrawn: cumulative,
      realClosingBalance: toTodaysRupees(balance, v.inflationPct, m),
      // A withdrawal taken at the start of month m is paid at t = m − 1; one taken at the end, at t = m.
      realWithdrawal: toTodaysRupees(actual, v.inflationPct, v.order === 'withdraw-then-grow' ? m - 1 : m),
    });

    if (shortfall || balance === 0) {
      depletionMonth = m;
      finalPartial = shortfall ? actual : null;
      break;
    }
  }

  const last = rows[rows.length - 1];
  if (!last || !Number.isFinite(last.closingBalance) || !Number.isFinite(cumulative)) {
    return fail('NON_FINITE_RESULT', 'The result could not be represented.');
  }

  return ok({
    rows,
    depletionMonth,
    fullyFundedMonths: fullyFunded,
    finalPartialWithdrawal: finalPartial,
    totalWithdrawn: cumulative,
    remainingCorpus: last.closingBalance,
    realRemainingCorpus: last.realClosingBalance,
    initialWithdrawalRatePct: ((v.monthlyWithdrawal * 12) / v.corpus) * 100,
  });
}
