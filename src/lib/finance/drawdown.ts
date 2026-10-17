/**
 * Drawdown measured on a price/NAV/index series, never on a contribution-inflated portfolio
 * balance. For portfolios with cash flows, first convert to a time-weighted (unitised) index with
 * `timeWeightedIndex`.
 */

export interface DrawdownPoint {
  index: number;
  level: number;
  peak: number;
  /** ≤ 0, as a decimal (−0.25 = 25% below the running peak). */
  drawdown: number;
}

export interface MaxDrawdown {
  /** ≤ 0 decimal. */
  maxDrawdown: number;
  peakIndex: number;
  troughIndex: number;
  /** First index at or after the trough where the prior peak is regained; null if never. */
  recoveryIndex: number | null;
}

export function drawdownSeries(levels: number[]): DrawdownPoint[] {
  let peak = -Infinity;
  return levels.map((level, index) => {
    peak = Math.max(peak, level);
    return { index, level, peak, drawdown: peak > 0 ? level / peak - 1 : 0 };
  });
}

export function maxDrawdown(levels: number[]): MaxDrawdown | null {
  if (levels.length === 0 || levels.some((l) => !Number.isFinite(l) || l <= 0)) return null;
  let peak = levels[0]!;
  let peakIdx = 0;
  let worst = 0;
  let worstPeak = 0;
  let worstTrough = 0;
  for (let i = 1; i < levels.length; i++) {
    const l = levels[i]!;
    if (l > peak) {
      peak = l;
      peakIdx = i;
    }
    const dd = l / peak - 1;
    if (dd < worst) {
      worst = dd;
      worstPeak = peakIdx;
      worstTrough = i;
    }
  }
  let recovery: number | null = null;
  if (worst < 0) {
    const target = levels[worstPeak]!;
    for (let i = worstTrough + 1; i < levels.length; i++) {
      if (levels[i]! >= target) {
        recovery = i;
        break;
      }
    }
  }
  return { maxDrawdown: worst, peakIndex: worstPeak, troughIndex: worstTrough, recoveryIndex: recovery };
}

/**
 * Time-weighted index from portfolio values and the external cash flow that arrived at each step.
 * values[t] is the value at the end of period t *after* contribution[t] was added.
 * Index starts at 100. Period return = (V_t − C_t) / V_{t−1} − 1.
 */
export function timeWeightedIndex(values: number[], contributions: number[]): number[] {
  if (values.length !== contributions.length) throw new Error('values and contributions must align');
  const out: number[] = [];
  let idx = 100;
  for (let t = 0; t < values.length; t++) {
    if (t === 0) {
      out.push(idx);
      continue;
    }
    const prev = values[t - 1]!;
    if (prev > 0) idx *= (values[t]! - contributions[t]!) / prev;
    out.push(idx);
  }
  return out;
}
