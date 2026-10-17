/**
 * Shared types for the pure financial engines.
 *
 * Engines never throw for invalid user input. They return a `CalcResult`, so that
 * the UI can render a meaningful error state instead of a plausible-looking number.
 */

/** When a periodic contribution is invested relative to that period's growth. */
export type ContributionTiming = 'begin' | 'end';

/**
 * How an annual percentage rate is converted to a monthly rate.
 * - `nominal`:   monthly = annual / 12          (12% → 1.000%/month → 12.68% effective)
 * - `effective`: monthly = (1 + annual)^(1/12) − 1   (12% → 0.949%/month → 12.00% effective)
 */
export type RateConvention = 'nominal' | 'effective';

export type CalcErrorCode =
  | 'INVALID_INPUT'
  | 'OUT_OF_DOMAIN'
  | 'NON_FINITE_RESULT'
  | 'NO_ROOT'
  | 'NOT_CONVERGED'
  | 'INSUFFICIENT_DATA'
  | 'START_BEFORE_INCEPTION'
  | 'UNSUPPORTED'
  | 'UNVERIFIED_RULES';

export interface CalcError {
  code: CalcErrorCode;
  message: string;
  /** Optional field path for input-validation errors. */
  field?: string;
}

export type CalcResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; error: CalcError };

export const ok = <T>(value: T, warnings: string[] = []): CalcResult<T> => ({ ok: true, value, warnings });
export const fail = (code: CalcErrorCode, message: string, field?: string): CalcResult<never> => ({
  ok: false,
  error: field === undefined ? { code, message } : { code, message, field },
});
