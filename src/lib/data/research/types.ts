import type { ProvenancedField } from '../fields';
import type { SchemeIdentity } from '../identity';

/** Every research field a fund profile can show. Order is display order. */
export const RESEARCH_FIELD_KEYS = [
  'ter',
  'aaum',
  'exitLoad',
  'minInvestment',
  'minSip',
  'riskometer',
  'benchmark',
  'inceptionDate',
  'fundManagers',
  'managerTenure',
  'holdings',
  'sectorAllocation',
  'assetAllocation',
  'portfolioDisclosureDate',
  'rating',
] as const;
export type ResearchFieldKey = (typeof RESEARCH_FIELD_KEYS)[number];

export type ProviderState = 'active' | 'disabled-awaiting-permission' | 'not-configured' | 'error';

export interface ProviderStatus {
  id: string;
  name: string;
  state: ProviderState;
  reason: string;
  /** Environment variables the owner must set to enable it (names only, never values). */
  requiredConfig: string[];
  fields: ResearchFieldKey[];
}

export interface ResearchProvider {
  status(): ProviderStatus;
  fetch(identity: SchemeIdentity, signal?: AbortSignal): Promise<Partial<Record<ResearchFieldKey, ProvenancedField>>>;
}

export interface ResearchDeps {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
  retries?: number;
}
