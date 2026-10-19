/**
 * Historical performance and risk metrics from an observed NAV series (no projections).
 *
 * - Point-to-point: each window ends at the last NAV on or before the as-of date and starts at the last NAV on or
 *   before (as-of − period), within 7 days; otherwise "insufficient-history". Periods < 1 year are absolute returns;
 *   periods ≥ 1 year are annualised CAGR on ACT/365: (end/start)^(365/days) − 1. Nothing before the first NAV is used.
 * - Volatility: sample standard deviation of daily log returns × √252, requiring ≥ 60 returns.
 * - Max drawdown: on the NAV itself (no contributions), with peak, trough and recovery dates.
 * - Calendar years: only complete years (an observation within 7 days of both year-ends).
 */
import { addYears, clampedDate, addMonths, daysBetween } from './dates';
import { maxDrawdown } from './drawdown';
import { indexOnOrBefore, prepareNavSeries, type NavPoint } from './navSeries';
import { fail, ok, type CalcResult } from './types';

export type PeriodKey = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '10Y' | 'SI';

export interface PeriodReturn {
  key: PeriodKey;
  label: string;
  kind: 'absolute' | 'annualised';
  status: 'available' | 'insufficient-history';
  valuePct: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface PerformanceResult {
  asOf: string;
  firstNavDate: string;
  periods: PeriodReturn[];
  volatility: { status: 'available' | 'insufficient-history'; annualisedPct: number | null; observations: number };
  maxDrawdown: { pct: number; peakDate: string; troughDate: string; recoveryDate: string | null } | null;
  calendarYears: Array<{ year: number; returnPct: number }>;
  bestYear: { year: number; returnPct: number } | null;
  worstYear: { year: number; returnPct: number } | null;
}

const TOLERANCE_DAYS = 7;
const PERIODS: Array<{ key: PeriodKey; label: string; months?: number; years?: number }> = [
  { key: '1M', label: '1 month', months: 1 },
  { key: '3M', label: '3 months', months: 3 },
  { key: '6M', label: '6 months', months: 6 },
  { key: '1Y', label: '1 year', years: 1 },
  { key: '3Y', label: '3 years', years: 3 },
  { key: '5Y', label: '5 years', years: 5 },
  { key: '10Y', label: '10 years', years: 10 },
  { key: 'SI', label: 'Since first NAV in this dataset' },
];

function minusMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const [ny, nm] = addMonths(y, m, -n);
  return clampedDate(ny, nm, d);
}

function periodReturn(start: NavPoint, end: NavPoint, annualise: boolean): number {
  const days = daysBetween(start.date, end.date);
  const growth = end.nav / start.nav;
  return (annualise ? Math.pow(growth, 365 / days) - 1 : growth - 1) * 100;
}

export function performanceMetrics(raw: NavPoint[], asOfDate?: string): CalcResult<PerformanceResult> {
  const prepared = prepareNavSeries(raw);
  const all = prepared.points;
  const pts = asOfDate ? all.filter((p) => p.date <= asOfDate) : all;
  if (pts.length < 2) return fail('INSUFFICIENT_DATA', 'At least two NAV observations are needed.');
  const first = pts[0]!;
  const end = pts[pts.length - 1]!;

  const periods: PeriodReturn[] = PERIODS.map(({ key, label, months, years }) => {
    if (key === 'SI') {
      const annualise = daysBetween(first.date, end.date) >= 365;
      return { key, label, kind: annualise ? 'annualised' : 'absolute', status: 'available', valuePct: periodReturn(first, end, annualise), startDate: first.date, endDate: end.date };
    }
    const kind = years ? 'annualised' : 'absolute';
    const target = years ? addYears(end.date, -years) : minusMonths(end.date, months!);
    const idx = indexOnOrBefore(pts, target);
    const start = idx >= 0 ? pts[idx] : undefined;
    if (!start || daysBetween(start.date, target) > TOLERANCE_DAYS || start.date >= end.date) {
      return { key, label, kind, status: 'insufficient-history', valuePct: null, startDate: null, endDate: null };
    }
    return { key, label, kind, status: 'available', valuePct: periodReturn(start, end, kind === 'annualised'), startDate: start.date, endDate: end.date };
  });

  const logReturns: number[] = [];
  for (let i = 1; i < pts.length; i++) logReturns.push(Math.log(pts[i]!.nav / pts[i - 1]!.nav));
  let volatility: PerformanceResult['volatility'];
  if (logReturns.length < 60) {
    volatility = { status: 'insufficient-history', annualisedPct: null, observations: logReturns.length };
  } else {
    const mean = logReturns.reduce((s, x) => s + x, 0) / logReturns.length;
    const variance = logReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / (logReturns.length - 1);
    volatility = { status: 'available', annualisedPct: Math.sqrt(variance) * Math.sqrt(252) * 100, observations: logReturns.length };
  }

  const dd = maxDrawdown(pts.map((p) => p.nav));
  const drawdown = dd
    ? { pct: dd.maxDrawdown * 100, peakDate: pts[dd.peakIndex]!.date, troughDate: pts[dd.troughIndex]!.date, recoveryDate: dd.recoveryIndex === null ? null : pts[dd.recoveryIndex]!.date }
    : null;

  const calendarYears: PerformanceResult['calendarYears'] = [];
  const firstYear = Number(first.date.slice(0, 4));
  const lastYear = Number(end.date.slice(0, 4));
  for (let y = firstYear; y <= lastYear; y++) {
    const yEnd = `${y}-12-31`;
    const prevEnd = `${y - 1}-12-31`;
    const e = pts[indexOnOrBefore(pts, yEnd)];
    const s = pts[indexOnOrBefore(pts, prevEnd)];
    if (!e || !s || e.date.slice(0, 4) !== String(y) || daysBetween(e.date, yEnd) > TOLERANCE_DAYS || daysBetween(s.date, prevEnd) > TOLERANCE_DAYS) continue;
    calendarYears.push({ year: y, returnPct: (e.nav / s.nav - 1) * 100 });
  }
  const sorted = [...calendarYears].sort((a, b) => a.returnPct - b.returnPct);

  return ok(
    {
      asOf: end.date,
      firstNavDate: first.date,
      periods,
      volatility,
      maxDrawdown: drawdown,
      calendarYears,
      bestYear: sorted.length ? sorted[sorted.length - 1]! : null,
      worstYear: sorted.length ? sorted[0]! : null,
    },
    prepared.warnings,
  );
}
