/**
 * "What an observed fall did": applies the largest peak-to-trough fall in a caller-supplied equity
 * NAV/index series to the two ends of a Life-stage equity range.
 *
 * - Uses ONLY the series passed in. There are no built-in crash figures.
 * - The window is the equity series' maximum drawdown (optionally within `window`). Debt and gold
 *   series, when supplied, are measured over the same dates: last observation on or before the peak date
 *   and on or before the trough date. Without a series (or without an observation on or before the peak
 *   date), that asset is ASSUMED unchanged and listed in `assumedUnchanged`. Nothing is interpolated.
 * - Mixes: equity at the range minimum and at the range maximum; gold at the midpoint of its range
 *   (limited to what equity leaves); debt takes the remainder.
 * - A past fall is not a forecast. Future falls can be larger, longer, or hit several assets at once.
 */
import { maxDrawdown } from './drawdown';
import { indexOnOrBefore, prepareNavSeries, type NavPoint } from './navSeries';
import type { AssetRange } from './lifeStage';
import { fail, ok, type CalcResult } from './types';
import { isIsoDate } from './dates';

export interface StressSeriesInput {
  equity: { label: string; points: NavPoint[] };
  debt?: { label: string; points: NavPoint[] };
  gold?: { label: string; points: NavPoint[] };
}

export interface StressMix {
  name: 'lower-equity' | 'upper-equity';
  weightsPct: { equity: number; debt: number; gold: number };
  portfolioChangePct: number;
  /** Change in rupees for `amount`, when an amount was given. */
  rupeeChange: number | null;
}

export interface StressTestResult {
  equityLabel: string;
  peakDate: string;
  troughDate: string;
  /** First date the equity series regained its peak; null if it had not by the end of the series. */
  recoveryDate: string | null;
  assetChangesPct: { equity: number; debt: number | null; gold: number | null };
  assumedUnchanged: Array<'debt' | 'gold'>;
  mixes: [StressMix, StressMix];
  observations: number;
}

export function stressTestRange(
  range: AssetRange,
  series: StressSeriesInput,
  opts: { window?: { from: string; to: string }; amount?: number } = {},
): CalcResult<StressTestResult> {
  if (opts.window && (!isIsoDate(opts.window.from) || !isIsoDate(opts.window.to) || opts.window.from >= opts.window.to)) {
    return fail('INVALID_INPUT', 'The window needs valid dates with "from" before "to".', 'window');
  }
  if (opts.amount !== undefined && (!Number.isFinite(opts.amount) || opts.amount < 0)) return fail('INVALID_INPUT', 'Amount must be zero or more.', 'amount');

  const inWindow = (pts: NavPoint[]) => (opts.window ? pts.filter((p) => p.date >= opts.window!.from && p.date <= opts.window!.to) : pts);
  const eq = prepareNavSeries(series.equity.points);
  const eqPts = inWindow(eq.points);
  if (eqPts.length < 2) return fail('INSUFFICIENT_DATA', 'The equity series needs at least two observations in the window.');

  const dd = maxDrawdown(eqPts.map((p) => p.nav));
  if (!dd) return fail('INSUFFICIENT_DATA', 'The equity series could not be analysed.');
  const warnings = [...eq.warnings, 'This shows one fall observed in the data supplied. It is not a forecast; future falls can be larger or last longer.'];
  if (dd.maxDrawdown === 0) warnings.push('The equity series never fell below an earlier peak in this window.');
  const peakDate = eqPts[dd.peakIndex]!.date;
  const troughDate = eqPts[dd.troughIndex]!.date;
  const recoveryDate = dd.recoveryIndex === null ? null : eqPts[dd.recoveryIndex]!.date;

  const assumedUnchanged: Array<'debt' | 'gold'> = [];
  const changeOver = (name: 'debt' | 'gold', s?: { label: string; points: NavPoint[] }): number | null => {
    if (!s) {
      assumedUnchanged.push(name);
      return null;
    }
    const pts = prepareNavSeries(s.points).points;
    const a = indexOnOrBefore(pts, peakDate);
    const b = indexOnOrBefore(pts, troughDate);
    if (a < 0 || b < 0) {
      assumedUnchanged.push(name);
      warnings.push(`The ${name} series (${s.label}) has no observation on or before ${peakDate}, so ${name} is assumed unchanged.`);
      return null;
    }
    return pts[b]!.nav / pts[a]!.nav - 1;
  };
  const debtChange = changeOver('debt', series.debt);
  const goldChange = changeOver('gold', series.gold);
  if (assumedUnchanged.length) warnings.push(`Assumed unchanged (0%) because no usable series was supplied: ${assumedUnchanged.join(', ')}.`);

  const goldMid = (range.gold.min + range.gold.max) / 2;
  const mix = (name: StressMix['name'], equity: number): StressMix => {
    const gold = Math.min(goldMid, 100 - equity);
    const debt = 100 - equity - gold;
    const change = (equity * dd.maxDrawdown + debt * (debtChange ?? 0) + gold * (goldChange ?? 0)) / 100;
    return {
      name,
      weightsPct: { equity, debt, gold },
      portfolioChangePct: change * 100,
      rupeeChange: opts.amount === undefined ? null : opts.amount * change,
    };
  };

  return ok(
    {
      equityLabel: series.equity.label,
      peakDate,
      troughDate,
      recoveryDate,
      assetChangesPct: {
        equity: dd.maxDrawdown * 100,
        debt: debtChange === null ? null : debtChange * 100,
        gold: goldChange === null ? null : goldChange * 100,
      },
      assumedUnchanged,
      mixes: [mix('lower-equity', range.equity.min), mix('upper-equity', range.equity.max)],
      observations: eqPts.length,
    },
    warnings,
  );
}
