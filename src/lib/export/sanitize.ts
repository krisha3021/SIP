/**
 * Spreadsheet formula-injection protection (OWASP "CSV Injection").
 * Any text cell that starts with = + - @, a tab, or a carriage return is prefixed with a single
 * quote, so spreadsheet applications treat it as text. Numbers are never altered. Numeric values
 * must be passed as numbers, not strings.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export type CellValue = string | number | boolean | null | undefined | Date;

export function neutraliseText(text: string): string {
  return DANGEROUS_PREFIX.test(text) ? `'${text}` : text;
}

export function sanitiseCell(value: CellValue): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return neutraliseText(value);
  return value;
}
