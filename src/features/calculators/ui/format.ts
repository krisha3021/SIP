/** Presentation helpers for time labels and percentages. No financial arithmetic lives here. */
import { formatIndianNumber, formatPct } from '@/lib/format/inr';

/** "Year 3" for month 36, "Year 3, month 4" for month 28. */
export function monthLabel(month: number): string {
  const y = Math.floor((month - 1) / 12) + 1;
  const m = ((month - 1) % 12) + 1;
  return m === 12 ? `Year ${y}` : `Year ${y}, month ${m}`;
}

export function shortMonthLabel(month: number | string): string {
  const n = Number(month);
  return n % 12 === 0 ? `Yr ${n / 12}` : `M${n}`;
}

/** A 0–1 share rendered as a percentage (display unit conversion only). */
export function formatShare(share: number, decimals = 1): string {
  return formatPct(share * 100, decimals);
}

export function formatCount(n: number): string {
  return formatIndianNumber(n, 0);
}

export { formatPct };
