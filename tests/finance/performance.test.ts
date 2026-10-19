import { describe, expect, it } from 'vitest';
import { performanceMetrics } from '@/lib/finance/performance';
import { daysBetween } from '@/lib/finance/dates';

/** Every calendar day from `from` to `to` with NAV = 100 × 1.1^(days/365): exactly 10% a year on ACT/365. */
function tenPercentSeries(from: string, to: string) {
  const out: Array<{ date: string; nav: number }> = [];
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, nav: 100 * Math.pow(1.1, daysBetween(from, iso) / 365) });
  }
  return out;
}

describe('performanceMetrics — point-to-point returns', () => {
  const navs = tenPercentSeries('2016-01-01', '2026-01-01');
  const r = performanceMetrics(navs);
  if (!r.ok) throw new Error(r.error.message);
  const p = Object.fromEntries(r.value.periods.map((x) => [x.key, x]));

  it('annualises periods of one year or more: a 10%-a-year series gives 10% for 1Y, 3Y, 5Y, 10Y and since first NAV', () => {
    for (const k of ['1Y', '3Y', '5Y', '10Y', 'SI']) {
      expect(p[k]!.kind).toBe('annualised');
      expect(p[k]!.valuePct).toBeCloseTo(10, 8);
    }
  });

  it('reports periods under a year as absolute returns over the actual days', () => {
    // 6M ends 2026-01-01 and starts 2025-07-01: 184 days.
    expect(p['6M']).toMatchObject({ kind: 'absolute', startDate: '2025-07-01', endDate: '2026-01-01' });
    expect(p['6M']!.valuePct).toBeCloseTo((Math.pow(1.1, 184 / 365) - 1) * 100, 8);
    expect(p['1M']!.valuePct).toBeCloseTo((Math.pow(1.1, 31 / 365) - 1) * 100, 8);
  });

  it('computes each complete calendar year, never a partial one', () => {
    const years = Object.fromEntries(r.value.calendarYears.map((y) => [y.year, y.returnPct]));
    expect(years[2019]).toBeCloseTo(10, 8); // 365-day year
    expect(years[2020]).toBeCloseTo((Math.pow(1.1, 366 / 365) - 1) * 100, 8); // leap year
    expect(years[2016]).toBeUndefined(); // no NAV at end of 2015, so 2016 is not complete
    expect(years[2026]).toBeUndefined();
    // Leap years compound one extra day; 2020 and 2024 tie for best.
    expect([2020, 2024]).toContain(r.value.bestYear?.year);
    expect(r.value.bestYear?.returnPct).toBeCloseTo((Math.pow(1.1, 366 / 365) - 1) * 100, 8);
    expect(r.value.worstYear?.returnPct).toBeCloseTo(10, 8);
  });

  it('a flat series has zero volatility and no drawdown', () => {
    const flat = Array.from({ length: 100 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), nav: 10 }));
    const f = performanceMetrics(flat);
    expect(f.ok && f.value.volatility).toMatchObject({ status: 'available', annualisedPct: 0 });
    expect(f.ok && f.value.maxDrawdown?.pct).toBe(0);
  });
});

describe('performanceMetrics — volatility and drawdown', () => {
  it('annualises the sample standard deviation of daily log returns with √252', () => {
    // 61 NAVs alternating 100, 101: 60 log returns of ±ln(1.01), mean 0.
    const navs = Array.from({ length: 61 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), nav: i % 2 === 0 ? 100 : 101 }));
    const r = performanceMetrics(navs);
    if (!r.ok) throw new Error(r.error.message);
    const expected = Math.log(1.01) * Math.sqrt(60 / 59) * Math.sqrt(252) * 100;
    expect(r.value.volatility.annualisedPct).toBeCloseTo(expected, 8);
    expect(r.value.volatility.observations).toBe(60);
  });

  it('needs at least 60 daily returns for volatility', () => {
    const navs = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), nav: 10 + i }));
    const r = performanceMetrics(navs);
    expect(r.ok && r.value.volatility).toMatchObject({ status: 'insufficient-history', annualisedPct: null });
  });

  it('reports max drawdown with its peak, trough and recovery dates', () => {
    const navs = [
      { date: '2025-01-01', nav: 100 },
      { date: '2025-01-02', nav: 120 },
      { date: '2025-01-03', nav: 90 },
      { date: '2025-01-04', nav: 130 },
    ];
    const r = performanceMetrics(navs);
    expect(r.ok && r.value.maxDrawdown).toEqual({ pct: -25, peakDate: '2025-01-02', troughDate: '2025-01-03', recoveryDate: '2025-01-04' });
  });
});

describe('performanceMetrics — insufficient history and validation', () => {
  it('marks periods longer than the history as insufficient, never extrapolated', () => {
    const navs = tenPercentSeries('2025-06-01', '2026-01-01');
    const r = performanceMetrics(navs);
    if (!r.ok) throw new Error(r.error.message);
    const p = Object.fromEntries(r.value.periods.map((x) => [x.key, x]));
    expect(p['1Y']).toMatchObject({ status: 'insufficient-history', valuePct: null, startDate: null });
    expect(p['6M']!.status).toBe('available');
  });

  it('rejects fewer than two observations', () => {
    expect(performanceMetrics([{ date: '2025-01-01', nav: 10 }]).ok).toBe(false);
  });

  it('ignores observations after the as-of date', () => {
    const navs = tenPercentSeries('2016-01-01', '2026-01-01');
    const r = performanceMetrics(navs, '2025-01-01');
    expect(r.ok && r.value.asOf).toBe('2025-01-01');
  });
});
