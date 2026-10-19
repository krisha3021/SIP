/**
 * Field-level provenance. Every financial value shown on a fund page is a ProvenancedField: the value travels with its
 * unit, scheme/plan/option identity, scope, provider, source, dates, usage status and validation status.
 * An unavailable field carries a status and a reason — never a placeholder value.
 */
import { isIsoDate } from '../finance/dates';
import type { FreshnessState, Provenance } from './provenance';

export type FieldUnit = 'percent' | 'inr' | 'inr-crore' | 'inr-per-unit' | 'count' | 'date' | 'text' | 'rating';
export type FieldScope = 'scheme' | 'plan' | 'scheme-aaum' | 'amc' | 'portfolio-disclosure';
export type UsageStatus = 'permitted' | 'awaiting-permission' | 'unlicensed' | 'not-applicable';
export type ValidationStatus = 'valid' | 'invalid' | 'unvalidated';
export type FieldStatus = 'available' | 'not-available' | 'insufficient-history' | 'blocked-licensing' | 'not-configured' | 'stale';

export interface ProvenancedField<T = number | string> {
  value: T | null;
  unit: FieldUnit;
  currency?: 'INR';
  scheme_id: number;
  plan_type: Provenance['plan'];
  option_type: Provenance['option'];
  scope: FieldScope;
  provider: string;
  source_url: string | null;
  observation_date: string | null;
  published_at?: string | null;
  retrieved_at: string | null;
  license_or_usage_status: UsageStatus;
  freshness_status: FreshnessState;
  validation_status: ValidationStatus;
  status: FieldStatus;
  reason?: string;
}

export interface FieldContext {
  scheme_id: number;
  plan_type: Provenance['plan'];
  option_type: Provenance['option'];
  provider: string;
  source_url: string | null;
  retrieved_at: string | null;
  license_or_usage_status: UsageStatus;
}

const CURRENCY_UNITS: FieldUnit[] = ['inr', 'inr-crore', 'inr-per-unit'];

function decimals(n: number): number {
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1]!.length : 0;
}

function validateValue(value: number | string, unit: FieldUnit): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite ${unit} value`);
    if (unit === 'percent') {
      if (value < 0 || value > 100) throw new Error(`percent value ${value} is outside 0–100 (percent, not a decimal fraction)`);
      if (decimals(value) > 4) throw new Error(`percent value ${value} exceeds the source precision of 4 decimals`);
    }
    if ((unit === 'inr' || unit === 'inr-crore' || unit === 'inr-per-unit' || unit === 'count') && value < 0) {
      throw new Error(`${unit} value must not be negative`);
    }
  } else if (unit === 'date' && !isIsoDate(value)) {
    throw new Error(`date value ${value} is not an ISO date`);
  }
}

/** Builds a validated, available field. Throws on unit, identifier or date problems so bad data can't render as fact. */
export function availableField<T extends number | string>(
  value: T,
  unit: FieldUnit,
  ctx: FieldContext & { scope: FieldScope; observation_date: string; published_at?: string | null; freshness_status?: FreshnessState },
): ProvenancedField<T> {
  if (!Number.isInteger(ctx.scheme_id) || ctx.scheme_id <= 0) throw new Error('scheme_id must be a positive integer');
  if (!isIsoDate(ctx.observation_date)) throw new Error(`observation date ${ctx.observation_date} is not an ISO date`);
  validateValue(value, unit);
  return {
    value,
    unit,
    ...(CURRENCY_UNITS.includes(unit) ? { currency: 'INR' as const } : {}),
    scheme_id: ctx.scheme_id,
    plan_type: ctx.plan_type,
    option_type: ctx.option_type,
    scope: ctx.scope,
    provider: ctx.provider,
    source_url: ctx.source_url,
    observation_date: ctx.observation_date,
    published_at: ctx.published_at ?? null,
    retrieved_at: ctx.retrieved_at,
    license_or_usage_status: ctx.license_or_usage_status,
    freshness_status: ctx.freshness_status ?? 'historical',
    validation_status: 'valid',
    status: 'available',
  };
}

export function unavailableField(
  status: Exclude<FieldStatus, 'available'>,
  reason: string,
  ctx: FieldContext,
  unit: FieldUnit,
  scope: FieldScope,
): ProvenancedField<never> {
  return {
    value: null,
    unit,
    scheme_id: ctx.scheme_id,
    plan_type: ctx.plan_type,
    option_type: ctx.option_type,
    scope,
    provider: ctx.provider,
    source_url: ctx.source_url,
    observation_date: null,
    published_at: null,
    retrieved_at: ctx.retrieved_at,
    license_or_usage_status: ctx.license_or_usage_status,
    freshness_status: 'unavailable',
    validation_status: 'unvalidated',
    status,
    reason,
  };
}

/**
 * Guards against attaching data to the wrong record: another scheme, another plan (Regular TER on a Direct record),
 * another option (Growth vs IDCW), or the wrong scope (AMC-wide AUM in a scheme slot).
 */
export function assertSamePlan<F extends ProvenancedField<unknown>>(
  identity: { schemeId: number; planType: Provenance['plan']; optionType: Provenance['option'] },
  field: F,
  expectedScope?: FieldScope,
): F {
  if (field.scheme_id !== identity.schemeId) throw new Error(`Field belongs to scheme ${field.scheme_id}, not ${identity.schemeId}`);
  if (expectedScope && field.scope !== expectedScope) throw new Error(`Field scope is ${field.scope}, expected ${expectedScope}`);
  // Scheme-wide figures (e.g. AMFI AAUM, which combines both plans) carry no plan/option; plan-scoped ones must match.
  const schemeWide = field.scope === 'scheme' || field.scope === 'scheme-aaum' || field.scope === 'portfolio-disclosure';
  if (schemeWide && (field.plan_type !== 'Unknown' || field.option_type !== 'Unknown')) {
    if (field.plan_type !== identity.planType) throw new Error(`Field is for the ${field.plan_type} plan, record is ${identity.planType}`);
    if (field.option_type !== identity.optionType) throw new Error(`Field is for the ${field.option_type} option, record is ${identity.optionType}`);
  }
  if (!schemeWide) {
    if (field.plan_type !== identity.planType) throw new Error(`Field is for the ${field.plan_type} plan, record is ${identity.planType}`);
    if (field.option_type !== identity.optionType) throw new Error(`Field is for the ${field.option_type} option, record is ${identity.optionType}`);
  }
  return field;
}
