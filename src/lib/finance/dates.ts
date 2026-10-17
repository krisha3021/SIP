/**
 * Calendar helpers on ISO dates ('YYYY-MM-DD'), computed in UTC so results never depend on
 * the server's or browser's time zone.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function toUtcMs(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export const MS_PER_DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Date in month (year, month1) at `day`, clamped to the month's last day (e.g. 31 → 28 Feb). */
export function clampedDate(year: number, month1: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month1));
  return `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Adds whole months to (year, month1), returning the new pair. */
export function addMonths(year: number, month1: number, n: number): [number, number] {
  const idx = year * 12 + (month1 - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

/** Adds years to an ISO date, clamping 29 Feb to 28 Feb in non-leap years. */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return clampedDate(y + years, m, d);
}

/** Converts MFAPI-style 'DD-MM-YYYY' to ISO, or null when malformed. */
export function ddmmyyyyToIso(s: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isIsoDate(iso) ? iso : null;
}
