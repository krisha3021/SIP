/**
 * Deterministic NAV fixtures for CI. These fixtures are not market data.
 * Business days are Mon–Fri, minus an explicit holiday list.
 */
import type { NavPoint } from '@/lib/finance/navSeries';

export function businessDaySeries(
  from: string,
  to: string,
  navFn: (isoDate: string, index: number) => number,
  holidays: string[] = [],
): NavPoint[] {
  const out: NavPoint[] = [];
  const skip = new Set(holidays);
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  let i = 0;
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    if (wd === 0 || wd === 6 || skip.has(iso)) continue;
    out.push({ date: iso, nav: navFn(iso, i++) });
  }
  return out;
}

/** A small MFAPI-shaped response (structure copied from a live response observed 2026-10-17; values are fictional). */
export const mfapiHistoryFixture = {
  meta: {
    fund_house: 'Example Mutual Fund',
    scheme_type: 'Open Ended Schemes',
    scheme_category: 'Equity Scheme - Flexi Cap Fund',
    scheme_code: 999001,
    scheme_name: 'Example Flexi Cap Fund - Direct Plan - Growth',
    isin_growth: 'INF000000001',
    isin_div_reinvestment: null,
  },
  data: [
    { date: '16-10-2026', nav: '90.88440' },
    { date: '15-10-2026', nav: '90.60400' },
    { date: '14-10-2026', nav: 'N.A.' },
    { date: '13-10-2026', nav: '89.58410' },
    { date: '31-02-2026', nav: '50.00000' },
  ],
  status: 'SUCCESS',
};
