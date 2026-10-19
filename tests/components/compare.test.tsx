// @vitest-environment jsdom
import './setup-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareFunds } from '@/features/compare/ui/CompareFunds';

/** Synthetic fixtures (not real data). */
const navs = Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), nav: 10 * Math.pow(1.1, i / 365) }));
const navResponse = (code: number, plan: 'Direct' | 'Regular') => ({
  ok: true,
  meta: { schemeCode: code, schemeName: `Fixture ${code} - ${plan} Plan - Growth`, fundHouse: 'Fixture AMC', category: 'Equity Scheme - Flexi Cap Fund', schemeType: 'Open Ended Schemes', isinGrowth: null, isinReinvestment: null, plan, option: 'Growth' },
  navs,
  provenance: { provider: 'Fixture', providerUrl: 'u', identifier: `Fixture ${code}`, observedAt: navs[navs.length - 1]!.date, fetchedAt: '2026-02-04T10:00:00Z', coverage: null, plan, option: 'Growth', currency: 'INR', units: 'INR per unit', classification: 'synthetic', notes: [] },
  freshness: 'synthetic',
  lastError: null,
  servedFrom: 'upstream',
  droppedRows: 0,
  timestamps: { dataAsOf: navs[navs.length - 1]!.date, providerPublishedAt: null, lastSuccessfulRetrieval: '2026-02-04T10:00:00Z', lastAttemptedRefresh: '2026-02-04T10:00:00Z', freshness: 'synthetic' },
});
const field = (status: string) => ({ value: null, unit: 'text', scheme_id: 1, plan_type: 'Direct', option_type: 'Growth', scope: 'plan', provider: 'None configured', source_url: null, observation_date: null, retrieved_at: null, license_or_usage_status: 'not-applicable', freshness_status: 'unavailable', validation_status: 'unvalidated', status, reason: 'fixture' });
const KEYS = ['ter', 'aaum', 'exitLoad', 'minInvestment', 'minSip', 'riskometer', 'benchmark', 'inceptionDate', 'fundManagers', 'managerTenure', 'holdings', 'sectorAllocation', 'assetAllocation', 'portfolioDisclosureDate', 'rating'];
const profileResponse = (code: number, plan: string) => ({
  ok: true,
  identity: { schemeId: code, schemeName: `Fixture ${code}`, amc: 'Fixture AMC', assetClass: 'Equity', subcategory: 'Flexi Cap Fund', schemeType: 'x', planType: plan, optionType: 'Growth', isin: null, isinStatus: 'missing' },
  fields: Object.fromEntries(KEYS.map((k) => [k, field(k === 'ter' ? 'blocked-licensing' : 'not-configured')])),
  providers: [],
  officialLinks: [],
});

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      const m = /\/api\/funds\/(\d+)\/(nav|profile)/.exec(u);
      if (m) {
        const code = Number(m[1]);
        const plan = code === 2 ? 'Regular' : 'Direct';
        return new Response(JSON.stringify(m[2] === 'nav' ? navResponse(code, plan) : profileResponse(code, plan)), { status: 200 });
      }
      if (u.includes('/api/funds/search')) {
        return new Response(JSON.stringify({ ok: true, query: 'fixture', provider: 'Fixture', results: [{ schemeCode: 5, schemeName: 'Fixture 5 - Direct Plan - Growth', plan: 'Direct', option: 'Growth' }] }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CompareFunds', () => {
  it('compares funds on the same rows and warns when plan types differ', async () => {
    stubFetch();
    render(<CompareFunds initialCodes={[1, 2]} />);
    const table = await screen.findByRole('table', { name: /fund comparison/i });
    expect(within(table).getByRole('rowheader', { name: 'Category' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Total expense ratio' })).toBeInTheDocument();
    expect(within(table).getAllByText('Not available — awaiting data permission').length).toBe(2);
    expect(await screen.findByText(/Plan types differ/)).toBeInTheDocument();
    expect(screen.getByText(/holdings data is not available/i)).toBeInTheDocument();
  });

  it('refuses a fifth fund', async () => {
    stubFetch();
    render(<CompareFunds initialCodes={[1, 2, 3, 4]} />);
    await screen.findByRole('table', { name: /fund comparison/i });
    await userEvent.type(screen.getByLabelText(/add a scheme/i), 'fixture');
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Fixture 5/ }));
    expect(await screen.findByText(/at most 4 funds/i)).toBeInTheDocument();
  });
});
