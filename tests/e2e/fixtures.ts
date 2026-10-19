/**
 * Deterministic fixtures for e2e tests. The NAV series is SYNTHETIC test data, labelled as such,
 * served only through Playwright route mocks. It is never shipped in the app and never shown as real data.
 */
import type { Page } from '@playwright/test';

export const FIXTURE_CODE = 999001;
/** Same synthetic series, labelled as an IDCW option, to exercise the eligibility refusal. */
export const IDCW_FIXTURE_CODE = 999002;

function syntheticNavs(): Array<{ date: string; nav: number }> {
  const out: Array<{ date: string; nav: number }> = [];
  const start = Date.UTC(2015, 0, 1);
  let nav = 10;
  for (let day = 0; day < 365 * 10; day++) {
    const d = new Date(start + day * 86_400_000);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    // Deterministic gentle drift with a periodic wobble; not modelled on any real fund.
    nav = nav * (1 + 0.0004 + 0.004 * Math.sin(day / 37));
    out.push({ date: d.toISOString().slice(0, 10), nav: Math.round(nav * 10000) / 10000 });
  }
  return out;
}

const NAVS = syntheticNavs();
const LAST = NAVS[NAVS.length - 1]!;
const FIRST = NAVS[0]!;

export const NAV_RESPONSE = {
  ok: true,
  meta: {
    schemeCode: FIXTURE_CODE,
    schemeName: 'TEST FIXTURE Synthetic Fund - Direct Plan - Growth',
    fundHouse: 'Test Fixture AMC',
    category: 'Synthetic test data',
    schemeType: 'Test',
    isinGrowth: null,
    isinReinvestment: null,
    plan: 'Direct',
    option: 'Growth',
  },
  navs: NAVS,
  provenance: {
    provider: 'Playwright fixture (synthetic test data)',
    providerUrl: 'https://example.invalid/fixture',
    identifier: `Fixture ${FIXTURE_CODE}`,
    observedAt: LAST.date,
    fetchedAt: '2025-01-01T10:00:00Z',
    coverage: { from: FIRST.date, to: LAST.date, observations: NAVS.length },
    plan: 'Direct',
    option: 'Growth',
    currency: 'INR',
    units: 'INR per unit',
    classification: 'synthetic',
    notes: ['Synthetic e2e fixture.'],
  },
  freshness: 'synthetic',
  lastError: null,
  servedFrom: 'upstream',
  droppedRows: 0,
  timestamps: { dataAsOf: LAST.date, providerPublishedAt: null, lastSuccessfulRetrieval: '2025-01-01T10:00:00Z', lastAttemptedRefresh: '2025-01-01T10:00:00Z', freshness: 'synthetic' },
};

export const IDCW_NAV_RESPONSE = {
  ...NAV_RESPONSE,
  meta: { ...NAV_RESPONSE.meta, schemeCode: IDCW_FIXTURE_CODE, schemeName: 'TEST FIXTURE Synthetic Fund - Direct Plan - IDCW', option: 'IDCW' },
  provenance: { ...NAV_RESPONSE.provenance, identifier: `Fixture ${IDCW_FIXTURE_CODE}`, option: 'IDCW' },
};

const KEYS = ['ter','aaum','exitLoad','minInvestment','minSip','riskometer','benchmark','inceptionDate','fundManagers','managerTenure','holdings','sectorAllocation','assetAllocation','portfolioDisclosureDate','rating'];
const unavailable = (key: string) => ({
  value: null, unit: key === 'ter' ? 'percent' : key === 'aaum' ? 'inr-crore' : 'text', scheme_id: FIXTURE_CODE,
  plan_type: 'Direct', option_type: 'Growth', scope: 'plan', provider: 'None configured', source_url: null, observation_date: null,
  published_at: null, retrieved_at: null, license_or_usage_status: key === 'rating' ? 'unlicensed' : 'awaiting-permission',
  freshness_status: 'unavailable', validation_status: 'unvalidated',
  status: key === 'ter' || key === 'aaum' ? 'blocked-licensing' : 'not-configured',
  reason: key === 'ter' || key === 'aaum' ? 'Awaiting AMFI written permission (synthetic e2e fixture).' : 'No configured source (synthetic e2e fixture).',
});
/** Synthetic profile fixture: identity plus every research field unavailable — mirrors the deployed state. */
export const PROFILE_RESPONSE = {
  ok: true,
  identity: { schemeId: FIXTURE_CODE, schemeName: NAV_RESPONSE.meta.schemeName, amc: NAV_RESPONSE.meta.fundHouse, assetClass: 'Equity', subcategory: 'Flexi Cap Fund', schemeType: 'Open Ended Schemes', planType: 'Direct', optionType: 'Growth', isin: null, isinStatus: 'missing' },
  fields: Object.fromEntries(KEYS.map((k) => [k, unavailable(k)])),
  providers: [{ id: 'amfi', name: 'AMFI (TER and scheme average AUM)', state: 'disabled-awaiting-permission', reason: 'Awaiting AMFI written permission (fixture).', requiredConfig: [], fields: ['ter', 'aaum'] }],
  officialLinks: [{ label: 'AMFI portfolio disclosure (links to each AMC)', url: 'https://www.amfiindia.com/online-center/portfolio-disclosure' }],
};

export async function mockFundApi(page: Page) {
  await page.route('**/api/funds/*/profile', (route) => route.fulfill({ json: { ...PROFILE_RESPONSE, identity: { ...PROFILE_RESPONSE.identity, schemeId: Number(route.request().url().split('/funds/')[1]!.split('/')[0]) } } }));
  await page.route('**/api/funds/search?**', (route) =>
    route.fulfill({
      json: {
        ok: true,
        query: 'fixture',
        provider: 'Playwright fixture (synthetic test data)',
        results: [
          { schemeCode: FIXTURE_CODE, schemeName: NAV_RESPONSE.meta.schemeName, plan: 'Direct', option: 'Growth' },
          { schemeCode: IDCW_FIXTURE_CODE, schemeName: IDCW_NAV_RESPONSE.meta.schemeName, plan: 'Direct', option: 'IDCW' },
        ],
      },
    }),
  );
  await page.route(`**/api/funds/${FIXTURE_CODE}/nav`, (route) => route.fulfill({ json: NAV_RESPONSE }));
  await page.route(`**/api/funds/${IDCW_FIXTURE_CODE}/nav`, (route) => route.fulfill({ json: IDCW_NAV_RESPONSE }));
}
