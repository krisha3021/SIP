/**
 * Deterministic fixtures for e2e tests. The NAV series is SYNTHETIC test data, labelled as such,
 * served only through Playwright route mocks. It is never shipped in the app and never shown as real data.
 */
import type { Page } from '@playwright/test';

export const FIXTURE_CODE = 999001;

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
};

export async function mockFundApi(page: Page) {
  await page.route('**/api/funds/search?**', (route) =>
    route.fulfill({
      json: {
        ok: true,
        query: 'fixture',
        provider: 'Playwright fixture (synthetic test data)',
        results: [{ schemeCode: FIXTURE_CODE, schemeName: NAV_RESPONSE.meta.schemeName, plan: 'Direct', option: 'Growth' }],
      },
    }),
  );
  await page.route(`**/api/funds/${FIXTURE_CODE}/nav`, (route) => route.fulfill({ json: NAV_RESPONSE }));
}
