import { z } from 'zod';
import { fail, type CalcResult } from './types';

/** Supported domain for annual return inputs, in percent. Documented in CALCULATION-METHODOLOGY.md. */
export const RETURN_PCT_MIN = -50;
export const RETURN_PCT_MAX = 50;
/** Longest horizon accepted: 100 years. */
export const MAX_MONTHS = 1200;
/** Largest single monetary input accepted: ₹1,000 crore. */
export const MAX_AMOUNT = 1e10;

export const timingSchema = z.enum(['begin', 'end']);
export const rateConventionSchema = z.enum(['nominal', 'effective']);
export const amountSchema = z.number().min(0).max(MAX_AMOUNT);
export const returnPctSchema = z.number().min(RETURN_PCT_MIN).max(RETURN_PCT_MAX);
export const inflationPctSchema = z.number().min(-5).max(30);
export const monthsSchema = z.number().int().min(1).max(MAX_MONTHS);

/** Parses input with a schema, converting the first Zod issue into a CalcResult failure. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; result: CalcResult<never> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.') || undefined;
  return {
    ok: false,
    result: fail('INVALID_INPUT', issue?.message ?? 'Invalid input', field),
  };
}

export function allFinite(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v));
}
