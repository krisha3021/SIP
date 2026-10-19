/**
 * AMFI TER and scheme-wise average-AUM adapter.
 *
 * DISABLED BY DEFAULT. AMFI's website terms (verified 2026-10-19) permit "personal and non-commercial use only" and
 * forbid public display "unless you and we have agreed otherwise in writing". Network access is therefore gated on
 * AMFI_REUSE_APPROVED=true AND owner-confirmed data URLs (AMFI_TER_DATA_URL, AMFI_AAUM_DATA_URL) on an AMFI host.
 * No endpoint is assumed: the owner records the exact URL AMFI authorises.
 *
 * Input rows use Lakshya's normalised shape (below). The real export layout must be mapped to it when permission is
 * granted; the parsers are pure so that mapping is testable against fixtures.
 */
import { z } from 'zod';
import { availableField, unavailableField, type FieldContext, type ProvenancedField } from '../fields';
import type { SchemeIdentity } from '../identity';
import type { ProviderStatus, ResearchDeps, ResearchFieldKey, ResearchProvider } from './types';

export const AMFI_HOSTS = ['www.amfiindia.com', 'portal.amfiindia.com'];
export const AMFI_TERMS_URL = 'https://www.amfiindia.com/terms-of-use';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const terRow = z.object({
  amfiSchemeCode: z.number().int().positive(),
  schemeName: z.string().min(1),
  effectiveDate: isoDate,
  directTotalTerPct: z.number().nullable(),
  regularTotalTerPct: z.number().nullable(),
});
const aaumRow = z.object({
  amfiSchemeCode: z.number().int().positive(),
  schemeName: z.string().min(1),
  quarterLabel: z.string().min(3),
  periodEnd: isoDate,
  aaumCrore: z.number(),
});

function ctxFor(identity: SchemeIdentity, retrievedAt: string, sourceUrl: string, plan: boolean): FieldContext {
  return {
    scheme_id: identity.schemeId,
    plan_type: plan ? identity.planType : 'Unknown',
    option_type: plan ? identity.optionType : 'Unknown',
    provider: 'AMFI',
    source_url: sourceUrl,
    retrieved_at: retrievedAt,
    license_or_usage_status: 'permitted',
  };
}

function invalid(identity: SchemeIdentity, retrievedAt: string, src: string, unit: 'percent' | 'inr-crore', scope: 'plan' | 'scheme-aaum', reason: string): ProvenancedField {
  return { ...unavailableField('not-available', reason, ctxFor(identity, retrievedAt, src, scope === 'plan'), unit, scope), validation_status: 'invalid' };
}

/** TER for the identity's own plan. A Regular TER is never attached to a Direct record, and vice versa. */
export function parseAmfiTerRows(rows: unknown, identity: SchemeIdentity, retrievedAt: string, sourceUrl: string): ProvenancedField {
  const parsed = z.array(terRow).safeParse(rows);
  if (!parsed.success) return invalid(identity, retrievedAt, sourceUrl, 'percent', 'plan', 'AMFI TER data did not match the expected format.');
  const matches = parsed.data.filter((r) => r.amfiSchemeCode === identity.schemeId);
  if (matches.length === 0) return unavailableField('not-available', 'This scheme is not in the AMFI TER data.', ctxFor(identity, retrievedAt, sourceUrl, true), 'percent', 'plan');
  if (matches.length > 1) return invalid(identity, retrievedAt, sourceUrl, 'percent', 'plan', 'Ambiguous: more than one AMFI TER row matches this scheme code.');
  const row = matches[0]!;
  const value = identity.planType === 'Direct' ? row.directTotalTerPct : identity.planType === 'Regular' ? row.regularTotalTerPct : null;
  if (value === null) {
    return unavailableField('not-available', identity.planType === 'Unknown' ? 'Plan type is unknown, so no plan-level TER can be attached.' : `AMFI lists no ${identity.planType} plan TER.`, ctxFor(identity, retrievedAt, sourceUrl, true), 'percent', 'plan');
  }
  try {
    return availableField(value, 'percent', { ...ctxFor(identity, retrievedAt, sourceUrl, true), scope: 'plan', observation_date: row.effectiveDate });
  } catch (e) {
    return invalid(identity, retrievedAt, sourceUrl, 'percent', 'plan', `Rejected AMFI TER value: ${(e as Error).message}`);
  }
}

/** Scheme-wide quarterly average AUM (both plans combined), labelled with its quarter — never "current AUM". */
export function parseAmfiAaumRows(rows: unknown, identity: SchemeIdentity, retrievedAt: string, sourceUrl: string): ProvenancedField {
  const parsed = z.array(aaumRow).safeParse(rows);
  if (!parsed.success) return invalid(identity, retrievedAt, sourceUrl, 'inr-crore', 'scheme-aaum', 'AMFI AAUM data did not match the expected format.');
  const matches = parsed.data.filter((r) => r.amfiSchemeCode === identity.schemeId);
  if (matches.length === 0) return unavailableField('not-available', 'This scheme is not in the AMFI AAUM data.', ctxFor(identity, retrievedAt, sourceUrl, false), 'inr-crore', 'scheme-aaum');
  if (matches.length > 1) return invalid(identity, retrievedAt, sourceUrl, 'inr-crore', 'scheme-aaum', 'Ambiguous: more than one AMFI AAUM row matches this scheme code.');
  const row = matches[0]!;
  try {
    return {
      ...availableField(row.aaumCrore, 'inr-crore', { ...ctxFor(identity, retrievedAt, sourceUrl, false), scope: 'scheme-aaum', observation_date: row.periodEnd }),
      reason: `Scheme average AUM for ${row.quarterLabel} (both plans combined).`,
    };
  } catch (e) {
    return invalid(identity, retrievedAt, sourceUrl, 'inr-crore', 'scheme-aaum', `Rejected AMFI AAUM value: ${(e as Error).message}`);
  }
}

function allowedAmfiUrl(u: string | undefined): boolean {
  if (!u) return false;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && AMFI_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

async function getJson(url: string, deps: ResearchDeps, signal?: AbortSignal): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  const retries = Math.max(0, Math.min(2, deps.retries ?? 1));
  let last = 'unknown error';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
    try {
      const res = await deps.fetchImpl(url, { signal: signal ?? AbortSignal.timeout(deps.timeoutMs ?? 8000), headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) {
        last = `AMFI responded with HTTP ${res.status}`;
        if (res.status >= 500 || res.status === 429) continue;
        return { ok: false, reason: last };
      }
      return { ok: true, body: await res.json() };
    } catch (e) {
      last = (e as { name?: string }).name === 'TimeoutError' ? 'AMFI did not respond in time' : 'AMFI could not be reached';
    }
  }
  return { ok: false, reason: last };
}

export function createAmfiResearchProvider(deps: ResearchDeps): ResearchProvider {
  const fields: ResearchFieldKey[] = ['ter', 'aaum'];
  const terUrl = deps.env.AMFI_TER_DATA_URL;
  const aaumUrl = deps.env.AMFI_AAUM_DATA_URL;
  const status = (): ProviderStatus => {
    const base = { id: 'amfi', name: 'AMFI (TER and scheme average AUM)', requiredConfig: ['AMFI_REUSE_APPROVED', 'AMFI_TER_DATA_URL', 'AMFI_AAUM_DATA_URL'], fields };
    if (deps.env.AMFI_REUSE_APPROVED !== 'true') {
      return { ...base, state: 'disabled-awaiting-permission', reason: `Awaiting AMFI written permission to display its data publicly (${AMFI_TERMS_URL}).` };
    }
    if (!terUrl || !aaumUrl) return { ...base, state: 'not-configured', reason: 'The owner has not confirmed the AMFI data URLs.' };
    if (!allowedAmfiUrl(terUrl) || !allowedAmfiUrl(aaumUrl)) return { ...base, state: 'not-configured', reason: `Configured URLs must be https on the AMFI host allowlist (${AMFI_HOSTS.join(', ')}).` };
    return { ...base, state: 'active', reason: 'Enabled under AMFI written permission.' };
  };

  return {
    status,
    async fetch(identity, signal) {
      const s = status();
      const retrievedAt = deps.now().toISOString();
      if (s.state !== 'active') {
        const ctx: FieldContext = { ...ctxFor(identity, retrievedAt, AMFI_TERMS_URL, true), retrieved_at: null, license_or_usage_status: s.state === 'disabled-awaiting-permission' ? 'awaiting-permission' : 'not-applicable' };
        const st = s.state === 'disabled-awaiting-permission' ? 'blocked-licensing' : 'not-configured';
        return {
          ter: unavailableField(st, s.reason, ctx, 'percent', 'plan'),
          aaum: unavailableField(st, s.reason, { ...ctx, plan_type: 'Unknown', option_type: 'Unknown' }, 'inr-crore', 'scheme-aaum'),
        };
      }
      const [ter, aaum] = await Promise.all([getJson(terUrl!, deps, signal), getJson(aaumUrl!, deps, signal)]);
      return {
        ter: ter.ok ? parseAmfiTerRows(ter.body, identity, retrievedAt, terUrl!) : unavailableField('not-available', ter.reason, ctxFor(identity, retrievedAt, terUrl!, true), 'percent', 'plan'),
        aaum: aaum.ok ? parseAmfiAaumRows(aaum.body, identity, retrievedAt, aaumUrl!) : unavailableField('not-available', aaum.reason, ctxFor(identity, retrievedAt, aaumUrl!, false), 'inr-crore', 'scheme-aaum'),
      };
    },
  };
}
