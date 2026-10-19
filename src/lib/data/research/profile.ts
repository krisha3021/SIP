/**
 * Assembles a fund's research profile from the configured providers. Every RESEARCH_FIELD_KEY is present; a key no
 * provider supplied is an explicit unavailable field with a reason. No value is ever filled in from elsewhere.
 */
import { unavailableField, type FieldContext, type FieldUnit, type FieldScope, type ProvenancedField } from '../fields';
import type { SchemeIdentity } from '../identity';
import { createAmfiResearchProvider } from './amfi';
import { RESEARCH_FIELD_KEYS, type ProviderStatus, type ResearchDeps, type ResearchFieldKey } from './types';

export { RESEARCH_FIELD_KEYS };

const AMFI_PORTFOLIO_URL = 'https://www.amfiindia.com/online-center/portfolio-disclosure';

const FIELD_META: Record<ResearchFieldKey, { unit: FieldUnit; scope: FieldScope; label: string }> = {
  ter: { unit: 'percent', scope: 'plan', label: 'Total expense ratio' },
  aaum: { unit: 'inr-crore', scope: 'scheme-aaum', label: 'Scheme average AUM' },
  exitLoad: { unit: 'text', scope: 'plan', label: 'Exit load' },
  minInvestment: { unit: 'inr', scope: 'plan', label: 'Minimum investment' },
  minSip: { unit: 'inr', scope: 'plan', label: 'Minimum SIP' },
  riskometer: { unit: 'text', scope: 'scheme', label: 'Riskometer' },
  benchmark: { unit: 'text', scope: 'scheme', label: 'Benchmark' },
  inceptionDate: { unit: 'date', scope: 'plan', label: 'Inception date' },
  fundManagers: { unit: 'text', scope: 'scheme', label: 'Fund managers' },
  managerTenure: { unit: 'text', scope: 'scheme', label: 'Manager tenure' },
  holdings: { unit: 'text', scope: 'portfolio-disclosure', label: 'Portfolio holdings' },
  sectorAllocation: { unit: 'text', scope: 'portfolio-disclosure', label: 'Sector allocation' },
  assetAllocation: { unit: 'text', scope: 'portfolio-disclosure', label: 'Asset allocation' },
  portfolioDisclosureDate: { unit: 'date', scope: 'portfolio-disclosure', label: 'Portfolio disclosure date' },
  rating: { unit: 'rating', scope: 'plan', label: 'Third-party rating' },
};
export const RESEARCH_FIELD_LABELS: Record<ResearchFieldKey, string> = Object.fromEntries(
  Object.entries(FIELD_META).map(([k, v]) => [k, v.label]),
) as Record<ResearchFieldKey, string>;

const DOCUMENT_FIELDS: ResearchFieldKey[] = ['exitLoad', 'minInvestment', 'minSip', 'riskometer', 'benchmark', 'inceptionDate', 'fundManagers', 'managerTenure'];
const PORTFOLIO_FIELDS: ResearchFieldKey[] = ['holdings', 'sectorAllocation', 'assetAllocation', 'portfolioDisclosureDate'];

export interface FundProfile {
  identity: SchemeIdentity;
  fields: Record<ResearchFieldKey, ProvenancedField>;
  providers: ProviderStatus[];
  /** Official places a reader can check fields we cannot show. */
  officialLinks: Array<{ label: string; url: string }>;
}

function documentsStatus(): ProviderStatus {
  return {
    id: 'documents',
    name: 'Scheme documents and portfolio disclosures (AMC SID, KIM, factsheets, monthly portfolios)',
    state: 'not-configured',
    reason: 'No licensed structured provider is configured; AMC documents differ in format and are not parsed.',
    requiredConfig: ['RESEARCH_DOCUMENTS_PROVIDER'],
    fields: [...DOCUMENT_FIELDS, ...PORTFOLIO_FIELDS],
  };
}

export function ratingsStatus(env: Record<string, string | undefined>): ProviderStatus {
  const licensed = Boolean(env.RATINGS_PROVIDER) && env.RATINGS_DISPLAY_LICENSED === 'true';
  return {
    id: 'ratings',
    name: env.RATINGS_PROVIDER ? `Ratings (${env.RATINGS_PROVIDER})` : 'Third-party ratings',
    state: 'not-configured',
    reason: licensed
      ? 'A rating licence is recorded, but no rating feed adapter is implemented yet.'
      : 'No licensed rating provider is configured. Third-party star ratings are proprietary and need display and attribution rights.',
    requiredConfig: ['RATINGS_PROVIDER', 'RATINGS_DISPLAY_LICENSED'],
    fields: ['rating'],
  };
}

export async function buildFundProfile(identity: SchemeIdentity, deps: ResearchDeps, signal?: AbortSignal): Promise<FundProfile> {
  const amfi = createAmfiResearchProvider(deps);
  const docs = documentsStatus();
  const ratings = ratingsStatus(deps.env);
  const supplied = await amfi.fetch(identity, signal);

  const baseCtx: FieldContext = {
    scheme_id: identity.schemeId,
    plan_type: identity.planType,
    option_type: identity.optionType,
    provider: 'None configured',
    source_url: null,
    retrieved_at: null,
    license_or_usage_status: 'not-applicable',
  };

  const fields = {} as Record<ResearchFieldKey, ProvenancedField>;
  for (const key of RESEARCH_FIELD_KEYS) {
    const got = supplied[key];
    if (got) {
      fields[key] = got;
      continue;
    }
    const meta = FIELD_META[key];
    const schemeWide = meta.scope !== 'plan';
    const ctx = schemeWide ? { ...baseCtx, plan_type: 'Unknown' as const, option_type: 'Unknown' as const } : baseCtx;
    const reason =
      key === 'rating'
        ? ratings.reason
        : PORTFOLIO_FIELDS.includes(key)
          ? 'No licensed holdings feed is configured. Each AMC publishes its own monthly portfolio disclosure; see the official portfolio disclosure link.'
          : 'Not available from a configured source. Check the scheme information document (SID/KIM) published by the AMC.';
    fields[key] = unavailableField('not-configured', reason, { ...ctx, license_or_usage_status: key === 'rating' ? 'unlicensed' : 'not-applicable' }, meta.unit, meta.scope);
  }

  return {
    identity,
    fields,
    providers: [amfi.status(), docs, ratings],
    officialLinks: [
      { label: 'AMFI portfolio disclosure (links to each AMC)', url: AMFI_PORTFOLIO_URL },
      { label: 'AMFI TER of mutual fund schemes', url: 'https://www.amfiindia.com/ter-of-mf-schemes' },
    ],
  };
}
