/**
 * Cleaning and lookup for observed NAV series.
 * NAVs are never interpolated, extrapolated, or manufactured before the first observation.
 */
import { isIsoDate, daysBetween } from './dates';

export interface NavPoint {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  nav: number;
}

export interface PreparedNavSeries {
  points: NavPoint[];
  warnings: string[];
  droppedInvalid: number;
  duplicateDates: number;
  conflictingDuplicates: number;
}

/**
 * Sorts ascending, drops invalid dates and non-positive or non-finite NAVs, and collapses duplicate
 * dates. When duplicates disagree, the value appearing last in the input wins, and a warning is raised.
 */
export function prepareNavSeries(raw: NavPoint[]): PreparedNavSeries {
  const byDate = new Map<string, number>();
  let droppedInvalid = 0;
  let duplicateDates = 0;
  let conflicting = 0;
  for (const p of raw) {
    if (!p || typeof p.date !== 'string' || !isIsoDate(p.date) || !Number.isFinite(p.nav) || p.nav <= 0) {
      droppedInvalid++;
      continue;
    }
    const prev = byDate.get(p.date);
    if (prev !== undefined) {
      duplicateDates++;
      if (prev !== p.nav) conflicting++;
    }
    byDate.set(p.date, p.nav);
  }
  const points = [...byDate.entries()].map(([date, nav]) => ({ date, nav })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const warnings: string[] = [];
  if (droppedInvalid) warnings.push(`${droppedInvalid} invalid NAV observation(s) were ignored.`);
  if (conflicting) warnings.push(`${conflicting} date(s) had conflicting duplicate NAVs; the last reported value was used.`);
  return { points, warnings, droppedInvalid, duplicateDates, conflictingDuplicates: conflicting };
}

/** Index of the first observation on or after `date`, or −1. `points` must be sorted ascending. */
export function indexOnOrAfter(points: NavPoint[], date: string): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo < points.length ? lo : -1;
}

/** Index of the last observation on or before `date`, or −1. */
export function indexOnOrBefore(points: NavPoint[], date: string): number {
  const i = indexOnOrAfter(points, date);
  if (i === -1) return points.length - 1;
  return points[i]!.date === date ? i : i - 1;
}

/** Next-available-NAV rule: first NAV on/after the scheduled date, within `maxLagDays`. */
export function nextAvailableNav(
  points: NavPoint[],
  scheduled: string,
  maxLagDays: number,
): { point: NavPoint; lagDays: number } | null {
  const i = indexOnOrAfter(points, scheduled);
  if (i === -1) return null;
  const point = points[i]!;
  const lagDays = daysBetween(scheduled, point.date);
  return lagDays <= maxLagDays ? { point, lagDays } : null;
}
