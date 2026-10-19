/**
 * Fund-comparison checks. A comparison is only as fair as its inputs: these warnings tell the reader when categories,
 * NAV dates, plans, options, return periods or data coverage differ. Holdings overlap is defined here for when licensed
 * holdings data exists; until then it reports "unavailable".
 */
import { daysBetween } from './dates';
import type { PeriodKey } from './performance';
import { fail, ok, type CalcResult } from './types';

export const MAX_COMPARE = 4;

export interface CompareRow {
  schemeId: number;
  name: string;
  subcategory: string | null;
  planType: 'Direct' | 'Regular' | 'Unknown';
  optionType: 'Growth' | 'IDCW' | 'Unknown';
  navDate: string | null;
  availablePeriods: PeriodKey[];
  /** Count of research fields with no value (AUM, TER, holdings, …). */
  unavailableResearchFields: number;
}

export type ComparabilityCode =
  | 'CATEGORY_DIFFERS'
  | 'NAV_DATES_DIFFER'
  | 'PLAN_TYPES_DIFFER'
  | 'OPTION_TYPES_DIFFER'
  | 'RETURN_PERIODS_NOT_COMPARABLE'
  | 'INCOMPLETE_COVERAGE';

export interface ComparabilityWarning {
  code: ComparabilityCode;
  message: string;
}

const ALL_PERIODS: PeriodKey[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', '10Y', 'SI'];

export function comparabilityWarnings(rows: CompareRow[]): CalcResult<ComparabilityWarning[]> {
  if (rows.length < 2) return fail('INVALID_INPUT', 'Choose at least two funds to compare.');
  if (rows.length > MAX_COMPARE) return fail('INVALID_INPUT', `Compare at most ${MAX_COMPARE} funds at a time.`);
  const w: ComparabilityWarning[] = [];

  const cats = new Set(rows.map((r) => r.subcategory ?? 'Unknown'));
  if (cats.size > 1) w.push({ code: 'CATEGORY_DIFFERS', message: `Categories differ (${[...cats].join(', ')}). Funds in different categories take different risks, so their returns are not like-for-like.` });

  const dates = rows.map((r) => r.navDate).filter((d): d is string => d !== null).sort();
  if (dates.length !== rows.length || (dates.length > 1 && daysBetween(dates[0]!, dates[dates.length - 1]!) > 3)) {
    w.push({ code: 'NAV_DATES_DIFFER', message: `Latest NAV dates differ (${dates[0] ?? 'missing'} to ${dates[dates.length - 1] ?? 'missing'}), so returns end on different days.` });
  }

  const plans = new Set(rows.map((r) => r.planType));
  if (plans.size > 1) w.push({ code: 'PLAN_TYPES_DIFFER', message: `Plan types differ (${[...plans].join(', ')}). Regular plans carry distributor commission in their expense ratio; Direct plans do not.` });

  const options = new Set(rows.map((r) => r.optionType));
  if (options.size > 1) w.push({ code: 'OPTION_TYPES_DIFFER', message: `Options differ (${[...options].join(', ')}). IDCW NAVs fall when distributions are paid, so their NAV returns understate total return.` });

  const uneven = ALL_PERIODS.filter((p) => {
    const n = rows.filter((r) => r.availablePeriods.includes(p)).length;
    return n > 0 && n < rows.length;
  });
  if (uneven.length) w.push({ code: 'RETURN_PERIODS_NOT_COMPARABLE', message: `These periods are not available for every fund: ${uneven.join(', ')}.` });

  if (rows.some((r) => r.unavailableResearchFields > 0)) {
    w.push({ code: 'INCOMPLETE_COVERAGE', message: 'Some research fields (such as AUM, expense ratio, holdings and managers) are not available for one or more funds, so those rows cannot be compared.' });
  }
  return ok(w);
}

export interface HoldingsDisclosure {
  disclosureDate: string;
  /** Share of the portfolio the disclosure lists (100 = full portfolio). */
  coveragePct: number;
  holdings: Array<{ isin: string; weightPct: number }>;
}

export interface OverlapResult {
  status: 'available' | 'partial' | 'unavailable';
  overlapPct: number | null;
  commonHoldings: number;
  method: 'ISIN match';
  formula: string;
  note: string;
}

const FORMULA = 'Overlap = Σ over ISINs held by both funds of min(weight in fund A, weight in fund B), using the same-dated portfolio disclosures.';

/** Portfolio overlap. Meaningful only with complete, similarly dated disclosures; partial data is flagged. */
export function holdingsOverlap(a: HoldingsDisclosure | null, b: HoldingsDisclosure | null): OverlapResult {
  const empty = (note: string): OverlapResult => ({ status: 'unavailable', overlapPct: null, commonHoldings: 0, method: 'ISIN match', formula: FORMULA, note });
  if (!a || !b) return empty('Holdings data is not available from a licensed source for one or both funds.');
  if (Math.abs(daysBetween(a.disclosureDate, b.disclosureDate)) > 31) return empty('The two portfolio disclosures are more than 31 days apart, so they do not describe the same period.');
  const wb = new Map(b.holdings.map((h) => [h.isin, h.weightPct]));
  let overlap = 0;
  let common = 0;
  for (const h of a.holdings) {
    const other = wb.get(h.isin);
    if (other !== undefined) {
      overlap += Math.min(h.weightPct, other);
      common++;
    }
  }
  const partial = a.coveragePct < 95 || b.coveragePct < 95;
  return {
    status: partial ? 'partial' : 'available',
    overlapPct: overlap,
    commonHoldings: common,
    method: 'ISIN match',
    formula: FORMULA,
    note: partial ? 'At least one disclosure lists only part of the portfolio (for example top-10 holdings); this is not a complete portfolio, so the true overlap may be higher or lower.' : 'Based on full portfolio disclosures.',
  };
}
