'use client';

import { useCallback, useMemo, useState } from 'react';
import { parseNumberInput } from '@/components/ui/NumberField';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Reads a numeric field from share-link params, keeping it only if it parses as a number. */
function fromParams(params: SearchParamsRecord | undefined, key: string): string | undefined {
  const v = params?.[key];
  if (typeof v !== 'string' || v.length > 20) return undefined;
  return parseNumberInput(v) === null ? undefined : v;
}

/** Reads an enumerated option from share-link params, falling back to the default. */
export function optionFromParams<T extends string>(params: SearchParamsRecord | undefined, key: string, allowed: readonly T[], fallback: T): T {
  const v = params?.[key];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Raw-text state for numeric inputs. Values stay as typed; `values` is the parsed number or null.
 * Nothing is coerced: an unparseable field yields null and a "Enter a number" error.
 */
export function useFields<K extends string>(defaults: Record<K, number | ''>, params?: SearchParamsRecord) {
  const initial = useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of Object.keys(defaults) as K[]) out[k] = fromParams(params, k) ?? String(defaults[k]);
    return out;
    // Initial state only; later param changes are handled by navigation remounting the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [raw, setRaw] = useState<Record<K, string>>(initial);

  const set = useCallback((k: K, v: string) => setRaw((prev) => ({ ...prev, [k]: v })), []);
  const reset = useCallback(() => {
    const out = {} as Record<K, string>;
    for (const k of Object.keys(defaults) as K[]) out[k] = String(defaults[k]);
    setRaw(out);
  }, [defaults]);

  const { values, parseErrors } = useMemo(() => {
    const values = {} as Record<K, number | null>;
    const parseErrors = {} as Partial<Record<K, string>>;
    for (const k of Object.keys(raw) as K[]) {
      const text = raw[k].trim();
      if (text === '' && defaults[k] === '') {
        values[k] = null; // optional field left empty
        continue;
      }
      const n = parseNumberInput(text);
      values[k] = n;
      if (n === null) parseErrors[k] = text === '' ? 'Enter a value' : 'Enter a number (digits only, e.g. 25000)';
    }
    return { values, parseErrors };
  }, [raw, defaults]);

  const allParsed = Object.keys(parseErrors).length === 0;
  return { raw, set, reset, values, parseErrors, allParsed };
}

/** Builds a share query from raw field text and options. Only the keys passed are included. */
export function buildQuery(entries: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v === null || v === undefined || v === '') continue;
    p.set(k, String(v).replace(/[,\s]/g, ''));
  }
  return p.toString();
}
