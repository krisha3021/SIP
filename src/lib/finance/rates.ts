import type { RateConvention } from './types';

/** Lowest annual return accepted by engines (−99%). Below this, monthly compounding is undefined. */
export const MIN_ANNUAL_RETURN_PCT = -99;

/** Converts an annual percentage (e.g. 12 for 12%) to a monthly decimal rate under a convention. */
export function monthlyRate(annualPct: number, convention: RateConvention): number {
  const a = annualPct / 100;
  return convention === 'nominal' ? a / 12 : Math.pow(1 + a, 1 / 12) - 1;
}

/** Effective annual rate (decimal) implied by a monthly decimal rate. */
export function effectiveAnnualFromMonthly(monthly: number): number {
  return Math.pow(1 + monthly, 12) - 1;
}

/** Effective annual rate (decimal) from a nominal annual percentage compounded monthly. */
export function effectiveFromNominalPct(nominalPct: number): number {
  return effectiveAnnualFromMonthly(nominalPct / 100 / 12);
}

/** Nominal annual rate (decimal, compounded monthly) equivalent to an effective annual percentage. */
export function nominalFromEffectivePct(effectivePct: number): number {
  return 12 * (Math.pow(1 + effectivePct / 100, 1 / 12) - 1);
}

/** Fisher real rate (decimal) from nominal and inflation percentages, both effective annual. */
export function realRate(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

/** Deflates a future value observed `months` from today to today's rupees. Inflation is effective annual. */
export function toTodaysRupees(value: number, inflationPct: number, months: number): number {
  return value / Math.pow(1 + inflationPct / 100, months / 12);
}

/** Inflates today's rupees to the nominal amount needed `months` from today. */
export function toFutureRupees(todayValue: number, inflationPct: number, months: number): number {
  return todayValue * Math.pow(1 + inflationPct / 100, months / 12);
}
