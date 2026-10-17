/**
 * Historical SIP backtest on observed NAVs.
 *
 * Rules (also stated in the UI and exports):
 * - Each instalment is scheduled on `sipDay` of the month, clamped to the month's last day.
 * - It is allotted at the first observed NAV on or after the scheduled date (next-available-NAV rule),
 *   provided that NAV is within `maxLagDays`. Otherwise the instalment is skipped and reported.
 * - The backtest cannot start before the first observation (scheme inception in the dataset).
 * - The portfolio is valued at the last observed NAV on or before `endDate`.
 * - The expense ratio is already reflected in NAV and is not deducted again. An optional
 *   `transactionCostPct` (e.g. stamp duty) reduces the amount converted to units.
 * - Simulated allocation dates are an approximation. Real allotment depends on cut-off times,
 *   payment realisation, and AMC/RTA processing.
 */
import { z } from 'zod';
import { addMonths, clampedDate, daysBetween, isIsoDate } from './dates';
import { maxDrawdown } from './drawdown';
import { indexOnOrBefore, nextAvailableNav, prepareNavSeries, type NavPoint } from './navSeries';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, parseInput } from './validation';
import { xirr, type DatedCashFlow, type XirrResult } from './xirr';

const isoDate = z.string().refine(isIsoDate, 'Use a valid date (YYYY-MM-DD)');

export const navBacktestInputSchema = z
  .object({
    amount: amountSchema.refine((v) => v > 0, 'SIP amount must be greater than zero'),
    frequency: z.enum(['monthly', 'quarterly']).default('monthly'),
    sipDay: z.number().int().min(1).max(31).default(5),
    startDate: isoDate,
    endDate: isoDate,
    annualStepUpPct: z.number().min(0).max(50).default(0),
    initialInvestment: amountSchema.default(0),
    maxLagDays: z.number().int().min(0).max(31).default(7),
    transactionCostPct: z.number().min(0).max(5).default(0),
    /** Round allotted units down to this many decimals (AMCs commonly use 3). Null = no rounding. */
    unitDecimals: z.union([z.literal(3), z.literal(4), z.null()]).default(null),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'End date must be after start date', path: ['endDate'] });
export type NavBacktestInput = z.input<typeof navBacktestInputSchema>;

export interface BacktestRow {
  kind: 'initial' | 'sip';
  instalment: number;
  scheduledDate: string;
  effectiveDate: string;
  lagDays: number;
  nav: number;
  amount: number;
  cost: number;
  units: number;
  cumulativeUnits: number;
  cumulativeInvested: number;
  value: number;
  gain: number;
}

export interface SkippedInstalment {
  scheduledDate: string;
  reason: 'NO_NAV_WITHIN_LAG' | 'AFTER_END_DATE';
}

export interface NavBacktestResult {
  rows: BacktestRow[];
  skipped: SkippedInstalment[];
  cashFlows: DatedCashFlow[];
  totalInvested: number;
  totalUnits: number;
  valuationDate: string;
  valuationNav: number;
  finalValue: number;
  gain: number;
  absoluteReturnPct: number;
  xirr: CalcResult<XirrResult>;
  /** Max drawdown of the NAV itself over the backtest window (not of the contribution-inflated balance). */
  navMaxDrawdownPct: number | null;
  coverage: { firstNavDate: string; lastNavDate: string; observations: number };
}

export function scheduleDates(startDate: string, endDate: string, sipDay: number, stepMonths: number): string[] {
  const [sy, sm] = startDate.split('-').map(Number) as [number, number];
  const out: string[] = [];
  let [y, m] = [sy, sm];
  for (let guard = 0; guard < 2400; guard++) {
    const d = clampedDate(y, m, sipDay);
    if (d > endDate) break;
    if (d >= startDate) out.push(d);
    [y, m] = addMonths(y, m, stepMonths);
  }
  return out;
}

function roundUnits(units: number, decimals: 3 | 4 | null): number {
  if (decimals === null) return units;
  const f = 10 ** decimals;
  return Math.floor(units * f + 1e-9) / f;
}

export function backtestSipOnNav(rawNavs: NavPoint[], input: NavBacktestInput): CalcResult<NavBacktestResult> {
  const parsed = parseInput(navBacktestInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const prepared = prepareNavSeries(rawNavs);
  const pts = prepared.points;
  if (pts.length < 2) return fail('INSUFFICIENT_DATA', 'Not enough NAV observations to run a backtest.');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (v.startDate < first.date) {
    return fail(
      'START_BEFORE_INCEPTION',
      `NAV data for this scheme begins on ${first.date}. Choose a start date on or after it.`,
      'startDate',
    );
  }
  if (v.startDate > last.date) {
    return fail('INSUFFICIENT_DATA', `The latest available NAV is dated ${last.date}, before your start date.`, 'startDate');
  }

  const valuationIdx = indexOnOrBefore(pts, v.endDate);
  const valuation = pts[valuationIdx]!;
  const warnings = [...prepared.warnings];
  if (daysBetween(valuation.date, v.endDate) > 7) {
    warnings.push(
      `The last NAV on or before the end date is from ${valuation.date}; the portfolio is valued at that NAV.`,
    );
  }

  const stepMonths = v.frequency === 'monthly' ? 1 : 3;
  const perYear = 12 / stepMonths;
  const scheduled = scheduleDates(v.startDate, v.endDate, v.sipDay, stepMonths);

  const rows: BacktestRow[] = [];
  const skipped: SkippedInstalment[] = [];
  const flows: DatedCashFlow[] = [];
  let units = 0;
  let invested = 0;

  const allot = (kind: BacktestRow['kind'], instalment: number, scheduledDate: string, amount: number) => {
    const hit = nextAvailableNav(pts, scheduledDate, v.maxLagDays);
    if (!hit) {
      skipped.push({ scheduledDate, reason: 'NO_NAV_WITHIN_LAG' });
      return;
    }
    if (hit.point.date > valuation.date) {
      skipped.push({ scheduledDate, reason: 'AFTER_END_DATE' });
      return;
    }
    const cost = (amount * v.transactionCostPct) / 100;
    const u = roundUnits((amount - cost) / hit.point.nav, v.unitDecimals);
    units += u;
    invested += amount;
    flows.push({ date: hit.point.date, amount: -amount });
    rows.push({
      kind,
      instalment,
      scheduledDate,
      effectiveDate: hit.point.date,
      lagDays: hit.lagDays,
      nav: hit.point.nav,
      amount,
      cost,
      units: u,
      cumulativeUnits: units,
      cumulativeInvested: invested,
      value: units * hit.point.nav,
      gain: units * hit.point.nav - invested,
    });
  };

  if (v.initialInvestment > 0) allot('initial', 0, v.startDate, v.initialInvestment);
  scheduled.forEach((date, k) => {
    const amount = v.amount * Math.pow(1 + v.annualStepUpPct / 100, Math.floor(k / perYear));
    allot('sip', k + 1, date, amount);
  });

  if (rows.length === 0) return fail('INSUFFICIENT_DATA', 'No instalment could be matched to an observed NAV.');
  if (skipped.length) warnings.push(`${skipped.length} instalment(s) had no NAV within ${v.maxLagDays} days and were skipped.`);

  const finalValue = units * valuation.nav;
  const cashFlows = [...flows, { date: valuation.date, amount: finalValue }];
  const window = pts.slice(
    pts.findIndex((p) => p.date >= rows[0]!.effectiveDate),
    valuationIdx + 1,
  );
  const dd = maxDrawdown(window.map((p) => p.nav));

  return ok(
    {
      rows,
      skipped,
      cashFlows,
      totalInvested: invested,
      totalUnits: units,
      valuationDate: valuation.date,
      valuationNav: valuation.nav,
      finalValue,
      gain: finalValue - invested,
      absoluteReturnPct: (finalValue / invested - 1) * 100,
      xirr: xirr(cashFlows),
      navMaxDrawdownPct: dd ? dd.maxDrawdown * 100 : null,
      coverage: { firstNavDate: first.date, lastNavDate: last.date, observations: pts.length },
    },
    warnings,
  );
}
