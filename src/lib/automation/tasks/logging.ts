/**
 * Structured logging with redaction. Automation tasks log through this interface only.
 * Redaction removes values under secret-looking keys, bearer tokens inside strings, and URL query
 * strings (which can carry keys), recursively.
 */
export interface TaskLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

const SECRET_KEY = /(secret|token|password|passwd|authorization|cookie|api[-_]?key|credential)/i;
export const REDACTED = '[REDACTED]';

function redactString(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?[query redacted]');
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    return out;
  }
  return value;
}

/** JSON-lines logger on the console, with redaction applied to every field. */
export const consoleTaskLogger: TaskLogger = {
  info: (event, fields) => console.info(JSON.stringify({ level: 'info', event, ...(redact(fields ?? {}) as object) })),
  warn: (event, fields) => console.warn(JSON.stringify({ level: 'warn', event, ...(redact(fields ?? {}) as object) })),
  error: (event, fields) => console.error(JSON.stringify({ level: 'error', event, ...(redact(fields ?? {}) as object) })),
};

/** Wraps a logger so that every call is redacted, whatever the underlying sink does. */
export function redactingLogger(inner: TaskLogger): TaskLogger {
  return {
    info: (e, f) => inner.info(e, redact(f ?? {}) as Record<string, unknown>),
    warn: (e, f) => inner.warn(e, redact(f ?? {}) as Record<string, unknown>),
    error: (e, f) => inner.error(e, redact(f ?? {}) as Record<string, unknown>),
  };
}

export const silentTaskLogger: TaskLogger = { info: () => {}, warn: () => {}, error: () => {} };
