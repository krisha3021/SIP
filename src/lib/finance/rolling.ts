/**
 * Rolling point-to-point CAGR on an observed NAV series.
 * Start points are sampled at the first observation of each calendar month. Each window ends at the
 * last observation on or before start + N years. Windows where that observation is more than
 * `toleranceDays` before the target date are dropped, never interpolated.
 * Annualisation: (NAV_end / NAV_start)^(365 / days) − 1.
 */
import { addYears, daysBetween } from './dates';
import { indexOnOrBefore, prepareNavSeries, type NavPoint } from './navSeries';
import { percentileSorted } from './stats';
import { fail, ok, type CalcResult } from './types';

export interface RollingWindow {
  startDate: string;
  endDate: string;
  cagrPct: number;
}

export interface RollingResult {
  windows: RollingWindow[];
  windowYears: number;
  stats: { min: number; median: number; max: number; positiveShare: number; count: number };
}

export function rollingReturns(raw: NavPoint[], windowYears: number, toleranceDays = 7): CalcResult<RollingResult> {
  if (!Number.isInteger(windowYears) || windowYears < 1 || windowYears > 30) {
    return fail('INVALID_INPUT', 'Window must be a whole number of years between 1 and 30.', 'windowYears');
  }
  const { points, warnings } = prepareNavSeries(raw);
  if (points.length < 2) return fail('INSUFFICIENT_DATA', 'Not enough NAV observations.');

  const windows: RollingWindow[] = [];
  let lastMonth = '';
  for (const start of points) {
    const month = start.date.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    const target = addYears(start.date, windowYears);
    const endIdx = indexOnOrBefore(points, target);
    const end = points[endIdx];
    if (!end || end.date <= start.date || daysBetween(end.date, target) > toleranceDays) continue;
    const days = daysBetween(start.date, end.date);
    windows.push({ startDate: start.date, endDate: end.date, cagrPct: (Math.pow(end.nav / start.nav, 365 / days) - 1) * 100 });
  }
  if (windows.length === 0) {
    return fail('INSUFFICIENT_DATA', `The NAV history is shorter than ${windowYears} year(s).`);
  }
  const sorted = windows.map((w) => w.cagrPct).sort((a, b) => a - b);
  return ok({
    windows,
    windowYears,
    stats: {
      min: sorted[0]!,
      median: percentileSorted(sorted, 0.5),
      max: sorted[sorted.length - 1]!,
      positiveShare: sorted.filter((x) => x > 0).length / sorted.length,
      count: sorted.length,
    },
  }, warnings);
}
