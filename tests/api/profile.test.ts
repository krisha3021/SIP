import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/funds/[schemeCode]/profile/route';

/** MFAPI-shaped synthetic fixture (structure as observed live on 2026-10-17; values are not real). */
const MFAPI = {
  meta: {
    fund_house: 'Fixture AMC',
    scheme_type: 'Open Ended Schemes',
    scheme_category: 'Equity Scheme - Flexi Cap Fund',
    scheme_code: 700001,
    scheme_name: 'Fixture Flexi Cap Fund - Direct Plan - Growth',
    isin_growth: 'US0378331005',
    isin_div_reinvestment: null,
  },
  data: [
    { date: '16-10-2026', nav: '90.00000' },
    { date: '15-10-2026', nav: '89.50000' },
  ],
  status: 'SUCCESS',
};

const call = (code: string) => GET(new Request(`http://localhost/api/funds/${code}/profile`), { params: Promise.resolve({ schemeCode: code }) });

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/funds/[code]/profile', () => {
  it('returns parsed identity and every research field, with AMFI fields blocked pending permission and no invented values', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith('https://api.mfapi.in/mf/700001')) return new Response(JSON.stringify(MFAPI), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('700001');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.identity).toMatchObject({ schemeId: 700001, assetClass: 'Equity', subcategory: 'Flexi Cap Fund', planType: 'Direct', optionType: 'Growth', isinStatus: 'valid' });
    expect(body.fields.ter).toMatchObject({ status: 'blocked-licensing', value: null });
    expect(body.fields.rating).toMatchObject({ status: 'not-configured', value: null });
    for (const f of Object.values(body.fields) as Array<{ value: unknown }>) expect(f.value).toBeNull();
    // Only MFAPI was called: the gated AMFI adapter never touched the network.
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('api.mfapi.in'))).toBe(true);
  });

  it('rejects an invalid scheme code without calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('abc');
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
