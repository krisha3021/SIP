/** Normalised scheme identity derived from provider metadata. Unparseable values become null with a status. */
import { inferPlanOption, type SchemeMeta } from './mfapi';
import type { Provenance } from './provenance';

export interface SchemeIdentity {
  schemeId: number;
  schemeName: string;
  amc: string | null;
  /** e.g. "Equity", from "Equity Scheme - Flexi Cap Fund". */
  assetClass: string | null;
  /** e.g. "Flexi Cap Fund". */
  subcategory: string | null;
  schemeType: string | null;
  planType: Provenance['plan'];
  optionType: Provenance['option'];
  isin: string | null;
  isinStatus: 'valid' | 'invalid' | 'missing';
}

/** ISO 6166 check: 2 letters, 9 alphanumerics, 1 check digit (Luhn over letters converted to 10–35). */
export function isValidIsin(s: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
  const digits = s
    .split('')
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

type MetaLike = Pick<SchemeMeta, 'schemeCode' | 'schemeName' | 'fundHouse' | 'category' | 'schemeType' | 'isinGrowth' | 'isinReinvestment'>;

export function parseSchemeIdentity(meta: MetaLike): SchemeIdentity {
  const { plan, option } = inferPlanOption(meta.schemeName);
  const m = meta.category ? /^\s*(.+?)\s+Scheme\s*[-–]\s*(.+?)\s*$/i.exec(meta.category) : null;
  const rawIsin = (option === 'IDCW' ? meta.isinReinvestment ?? meta.isinGrowth : meta.isinGrowth) ?? null;
  const isinStatus = rawIsin === null ? 'missing' : isValidIsin(rawIsin) ? 'valid' : 'invalid';
  return {
    schemeId: meta.schemeCode,
    schemeName: meta.schemeName,
    amc: meta.fundHouse ?? null,
    assetClass: m ? m[1]! : null,
    subcategory: m ? m[2]! : null,
    schemeType: meta.schemeType ?? null,
    planType: plan,
    optionType: option,
    isin: isinStatus === 'valid' ? rawIsin : null,
    isinStatus,
  };
}
