import { describe, expect, it } from 'vitest';
import { availableField, unavailableField, assertSamePlan, type FieldContext } from '@/lib/data/fields';
import { isValidIsin, parseSchemeIdentity } from '@/lib/data/identity';

const ctx: FieldContext = {
  scheme_id: 122639,
  plan_type: 'Direct',
  option_type: 'Growth',
  provider: 'AMFI (fixture)',
  source_url: 'https://www.amfiindia.com/ter-of-mf-schemes',
  retrieved_at: '2026-10-19T04:00:00.000Z',
  license_or_usage_status: 'permitted',
};

describe('ISIN validation', () => {
  it('accepts real ISINs with a correct check digit', () => {
    expect(isValidIsin('US0378331005')).toBe(true); // Apple Inc., the standard worked example
    expect(isValidIsin('INF879O01027')).toBe(true); // PPFAS Flexi Cap Direct Growth, from MFAPI on 2026-10-17
  });
  it('rejects a wrong check digit, wrong length or lower case', () => {
    expect(isValidIsin('INF879O01028')).toBe(false);
    expect(isValidIsin('INF879O0102')).toBe(false);
    expect(isValidIsin('inf879o01027')).toBe(false);
  });
});

describe('parseSchemeIdentity', () => {
  it('splits MFAPI scheme_category into asset class and subcategory and keeps plan/option', () => {
    const id = parseSchemeIdentity({
      schemeCode: 122639,
      schemeName: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
      fundHouse: 'PPFAS Mutual Fund',
      category: 'Equity Scheme - Flexi Cap Fund',
      schemeType: 'Open Ended Schemes',
      isinGrowth: 'INF879O01027',
      isinReinvestment: null,
    });
    expect(id).toMatchObject({
      schemeId: 122639,
      amc: 'PPFAS Mutual Fund',
      assetClass: 'Equity',
      subcategory: 'Flexi Cap Fund',
      planType: 'Direct',
      optionType: 'Growth',
      isin: 'INF879O01027',
      isinStatus: 'valid',
    });
  });
  it('reports a malformed ISIN as invalid instead of passing it through as fact', () => {
    const id = parseSchemeIdentity({ schemeCode: 1, schemeName: 'X Fund - Regular Plan - Growth', fundHouse: null, category: null, schemeType: null, isinGrowth: 'BADISIN', isinReinvestment: null });
    expect(id.isin).toBeNull();
    expect(id.isinStatus).toBe('invalid');
    expect(id.assetClass).toBeNull();
    expect(id.subcategory).toBeNull();
  });
});

describe('ProvenancedField', () => {
  it('builds an available percent field with full provenance', () => {
    const f = availableField(0.63, 'percent', { ...ctx, scope: 'plan', observation_date: '2026-10-01' });
    expect(f).toMatchObject({ value: 0.63, unit: 'percent', status: 'available', validation_status: 'valid', scope: 'plan', plan_type: 'Direct', option_type: 'Growth' });
  });
  it('rejects a percent outside 0–100 or with more than 4 decimals', () => {
    expect(() => availableField(130, 'percent', { ...ctx, scope: 'plan', observation_date: '2026-10-01' })).toThrow(/percent/);
    expect(() => availableField(0.123456, 'percent', { ...ctx, scope: 'plan', observation_date: '2026-10-01' })).toThrow(/precision/);
  });
  it('rejects negative ₹ crore and malformed dates', () => {
    expect(() => availableField(-5, 'inr-crore', { ...ctx, scope: 'scheme-aaum', observation_date: '2026-09-30' })).toThrow();
    expect(() => availableField(100, 'inr-crore', { ...ctx, scope: 'scheme-aaum', observation_date: '30-09-2026' })).toThrow(/date/);
  });
  it('builds an unavailable field with no value and a reason', () => {
    const f = unavailableField('blocked-licensing', 'Awaiting AMFI written permission', { ...ctx, license_or_usage_status: 'awaiting-permission' }, 'percent', 'plan');
    expect(f.value).toBeNull();
    expect(f.status).toBe('blocked-licensing');
    expect(f.reason).toMatch(/AMFI/);
  });
});

describe('assertSamePlan', () => {
  const identity = { schemeId: 122639, planType: 'Direct' as const, optionType: 'Growth' as const };
  it('rejects a Regular-plan expense ratio on a Direct-plan record', () => {
    const regularTer = availableField(1.32, 'percent', { ...ctx, plan_type: 'Regular', scope: 'plan', observation_date: '2026-10-01' });
    expect(() => assertSamePlan(identity, regularTer)).toThrow(/plan/i);
  });
  it('rejects mixing Growth and IDCW', () => {
    const idcw = availableField(0.63, 'percent', { ...ctx, option_type: 'IDCW', scope: 'plan', observation_date: '2026-10-01' });
    expect(() => assertSamePlan(identity, idcw)).toThrow(/option/i);
  });
  it('rejects AMC-wide AUM in a scheme AUM slot', () => {
    const amcAum = availableField(100000, 'inr-crore', { ...ctx, scope: 'amc', observation_date: '2026-09-30' });
    expect(() => assertSamePlan(identity, amcAum, 'scheme-aaum')).toThrow(/scope/i);
  });
  it('rejects a field for another scheme', () => {
    const other = availableField(0.5, 'percent', { ...ctx, scheme_id: 999, scope: 'plan', observation_date: '2026-10-01' });
    expect(() => assertSamePlan(identity, other)).toThrow(/scheme/i);
  });
  it('accepts scheme-wide AAUM (both plans combined, plan/option Unknown) on a Direct-Growth record', () => {
    const aaum = availableField(150000, 'inr-crore', { ...ctx, plan_type: 'Unknown', option_type: 'Unknown', scope: 'scheme-aaum', observation_date: '2026-09-30' });
    expect(assertSamePlan(identity, aaum, 'scheme-aaum')).toBe(aaum);
  });
  it('still rejects a plan-scoped field with Unknown plan', () => {
    const unknownPlan = availableField(0.63, 'percent', { ...ctx, plan_type: 'Unknown', scope: 'plan', observation_date: '2026-10-01' });
    expect(() => assertSamePlan(identity, unknownPlan)).toThrow(/plan/i);
  });
  it('accepts a matching field', () => {
    const ok = availableField(0.63, 'percent', { ...ctx, scope: 'plan', observation_date: '2026-10-01' });
    expect(assertSamePlan(identity, ok)).toBe(ok);
  });
});
