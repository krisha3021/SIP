/**
 * INR formatting with Indian digit grouping (12,34,56,789) and lakh/crore compaction.
 * Grouping is implemented explicitly, so output does not depend on the runtime's ICU data.
 */

export const NOT_AVAILABLE = '—';

/** Groups the integer digits Indian-style: last three, then pairs. */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  const rest = intDigits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Formats a number with Indian grouping and fixed decimals (no currency symbol). */
export function formatIndianNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int = '0', frac] = fixed.split('.');
  const body = groupIndian(int) + (frac ? '.' + frac : '');
  const isZero = Number(fixed) === 0;
  return (neg && !isZero ? '−' : '') + body;
}

/** Full-precision rupee amount, e.g. ₹12,34,567.89 (defaults to paise). */
export function formatINR(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  const s = formatIndianNumber(n, decimals);
  return s.startsWith('−') ? '−₹' + s.slice(1) : '₹' + s;
}

/**
 * Compact rupee amount using lakh (L) and crore (Cr): ₹4.52 Cr, ₹12.5 L, ₹85,000.
 * Amounts under ₹1 lakh are shown in full with grouping, so no "K" suffix appears.
 */
export function formatINRCompact(n: number): string {
  if (!Number.isFinite(n)) return NOT_AVAILABLE;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const trim = (x: string) => x.replace(/\.?0+$/, '');
  if (abs >= 1e7) return `${sign}₹${trim((abs / 1e7).toFixed(2))} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim((abs / 1e5).toFixed(2))} L`;
  return `${sign}₹${formatIndianNumber(Math.round(abs), 0)}`;
}

export function formatPct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NOT_AVAILABLE;
  return `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(decimals)}%`;
}
