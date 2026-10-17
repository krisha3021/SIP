/**
 * XIRR on dated cash flows.
 *
 * Day count: Actual/365 Fixed, measured from the earliest cash-flow date (the same convention as
 * spreadsheet XIRR functions). NPV(r) = Σ amount_i / (1 + r)^(days_i / 365).
 *
 * Method: scan a fixed grid of rates in (−100%, +100,000%) for sign changes of NPV, then refine the
 * root nearest to 0% by bisection to a relative tolerance. If no sign change exists, we return
 * NO_ROOT. We never return an unconverged estimate. When the flows change sign more than once,
 * several roots can exist. The result then carries `multipleRootsPossible` and lists all
 * bracketed roots.
 */
import { daysBetween, isIsoDate } from './dates';
import { fail, ok, type CalcResult } from './types';

export interface DatedCashFlow {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Negative = investment (outflow), positive = redemption/valuation (inflow). */
  amount: number;
}

export interface XirrResult {
  /** Annualised rate as a decimal (0.12 = 12%). */
  rate: number;
  iterations: number;
  multipleRootsPossible: boolean;
  /** All roots found on the scan grid, nearest-to-zero first. */
  roots: number[];
  dayCount: 'ACT/365F';
}

function npvFactory(flows: DatedCashFlow[]) {
  const start = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0]!.date);
  const terms = flows.map((f) => ({ t: daysBetween(start, f.date) / 365, a: f.amount }));
  const scale = flows.reduce((s, f) => s + Math.abs(f.amount), 0);
  return {
    scale,
    npv(rate: number): number {
      let s = 0;
      for (const { t, a } of terms) s += a / Math.pow(1 + rate, t);
      return s;
    },
  };
}

/** Rate grid: dense near zero, sparser further out. Strictly increasing in (−1, 1000). */
function rateGrid(): number[] {
  const g: number[] = [];
  for (let x = -0.9999; x < -0.5; x += 0.05) g.push(x);
  for (let x = -0.5; x < 1; x += 0.01) g.push(Number(x.toFixed(4)));
  for (let x = 1; x < 10; x += 0.1) g.push(Number(x.toFixed(4)));
  for (let x = 10; x <= 1000; x *= 1.25) g.push(x);
  return g;
}
const GRID = rateGrid();

function bisect(f: (r: number) => number, lo: number, hi: number, scale: number) {
  let flo = f(lo);
  for (let i = 1; i <= 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0 || (hi - lo) / 2 < 1e-12 * Math.max(1, Math.abs(mid))) {
      return { root: mid, iterations: i, residual: Math.abs(fm) / scale };
    }
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return null;
}

export function xirr(flows: DatedCashFlow[]): CalcResult<XirrResult> {
  if (!Array.isArray(flows) || flows.length < 2) {
    return fail('INSUFFICIENT_DATA', 'XIRR needs at least two cash flows.');
  }
  for (const f of flows) {
    if (!isIsoDate(f.date)) return fail('INVALID_INPUT', `Invalid cash-flow date: ${String(f.date)}`);
    if (!Number.isFinite(f.amount)) return fail('INVALID_INPUT', 'Cash-flow amounts must be finite numbers.');
  }
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) {
    return fail('NO_ROOT', 'XIRR needs at least one negative (investment) and one positive (value) cash flow.');
  }
  const dates = new Set(flows.map((f) => f.date));
  if (dates.size < 2) return fail('INSUFFICIENT_DATA', 'All cash flows fall on the same date, so no annual rate exists.');

  const { npv, scale } = npvFactory(flows);

  const brackets: Array<[number, number]> = [];
  let prevR = GRID[0]!;
  let prevV = npv(prevR);
  for (let i = 1; i < GRID.length; i++) {
    const r = GRID[i]!;
    const v = npv(r);
    if (!Number.isFinite(v) || !Number.isFinite(prevV)) {
      prevR = r;
      prevV = v;
      continue;
    }
    if (prevV === 0) brackets.push([prevR, prevR]);
    else if (Math.sign(v) !== Math.sign(prevV) && v !== 0) brackets.push([prevR, r]);
    prevR = r;
    prevV = v;
  }
  if (brackets.length === 0) {
    return fail('NO_ROOT', 'No rate between −100% and +100,000% makes the cash flows balance, so XIRR is unavailable.');
  }

  const roots: number[] = [];
  let iterations = 0;
  for (const [lo, hi] of brackets) {
    if (lo === hi) {
      roots.push(lo);
      continue;
    }
    const res = bisect(npv, lo, hi, scale);
    if (!res || res.residual > 1e-7) {
      return fail('NOT_CONVERGED', 'XIRR did not converge to a reliable value.');
    }
    iterations += res.iterations;
    roots.push(res.root);
  }
  roots.sort((a, b) => Math.abs(a) - Math.abs(b));

  // Count sign changes in date-ordered flows (Descartes' rule bound on positive-root count).
  const ordered = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).filter((f) => f.amount !== 0);
  let signChanges = 0;
  for (let i = 1; i < ordered.length; i++) if (Math.sign(ordered[i]!.amount) !== Math.sign(ordered[i - 1]!.amount)) signChanges++;

  const warnings = roots.length > 1 ? ['These cash flows have more than one valid XIRR; the value nearest 0% is shown.'] : [];
  return ok(
    {
      rate: roots[0]!,
      iterations,
      multipleRootsPossible: signChanges > 1 || roots.length > 1,
      roots,
      dayCount: 'ACT/365F',
    },
    warnings,
  );
}
