/**
 * Grounding checks for explanation text (deterministic or AI-generated).
 * Every number in the text must correspond to a computed fact (within display rounding), every [citation] must name a
 * known fact id, and guarantee / product-selection language is rejected. Text is data here — nothing in it is obeyed.
 */
export interface GroundingFact {
  id: string;
  label: string;
  value: number;
  unit: 'inr' | 'percent' | 'years' | 'months' | 'count';
}

export interface GroundingResult {
  grounded: boolean;
  problems: string[];
}

/** A number with optional Indian/Western grouping commas, never ending in a comma (so "₹85,000," stops at "000"). */
const NUM = String.raw`(?:\d[\d,]*\d|\d)(?:\.\d+)?`;
const TOKEN_RE = new RegExp(String.raw`−?₹\s?${NUM}(?:\s?(?:L|Cr|lakh|crore)\b)?|−?${NUM}\s?%|\b${NUM}\b`, 'g');
const CITATION_RE = /\[([A-Za-z0-9.\-_]+)\]/g;
const FORBIDDEN = [
  /guarantee/i,
  /assured returns?/i,
  /risk[- ]free/i,
  /\bbest (mutual )?fund/i,
  /\btop[- ]rated fund/i,
  /you should (buy|sell|invest|switch)/i,
  /\bwill definitely\b/i,
  /\bcertain to\b/i,
];
/** Bare small integers (ordinals, "two strategies") are allowed without a fact; ₹ and % values never are. */
const FREE_INTEGER_MAX = 10;

export function extractNumberTokens(text: string): string[] {
  return (text.replace(CITATION_RE, ' ').match(TOKEN_RE) ?? []).map((t) => t.trim());
}

type Parsed = { kind: 'inr' | 'percent' | 'number'; value: number; resolution: number };

function decimalsOf(s: string): number {
  const m = /\.(\d+)/.exec(s);
  return m ? m[1]!.length : 0;
}

function parseToken(t: string): Parsed | null {
  const neg = t.startsWith('−') || t.startsWith('-');
  const sign = neg ? -1 : 1;
  if (t.includes('₹')) {
    const num = /\d[\d,]*(?:\.\d+)?/.exec(t)?.[0];
    if (!num) return null;
    const mult = /\b(Cr|crore)\b/.test(t) ? 1e7 : /\b(L|lakh)\b/.test(t) ? 1e5 : 1;
    const base = Number(num.replace(/,/g, ''));
    return { kind: 'inr', value: sign * base * mult, resolution: Math.pow(10, -decimalsOf(num)) * mult };
  }
  if (t.endsWith('%')) {
    const num = t.replace(/[−\-%\s]/g, '');
    return { kind: 'percent', value: sign * Number(num), resolution: Math.pow(10, -decimalsOf(num)) };
  }
  const num = t.replace(/,/g, '');
  return { kind: 'number', value: Number(num), resolution: Math.pow(10, -decimalsOf(num)) };
}

function matchesFact(p: Parsed, facts: GroundingFact[]): boolean {
  return facts.some((f) => {
    const unitOk = p.kind === 'inr' ? f.unit === 'inr' : p.kind === 'percent' ? f.unit === 'percent' : f.unit === 'years' || f.unit === 'months' || f.unit === 'count';
    if (!unitOk) return false;
    const tol = p.resolution / 2 + (p.kind === 'inr' ? Math.abs(f.value) * 0.005 : 0) + 1e-9;
    return Math.abs(p.value - f.value) <= tol;
  });
}

export function checkGrounding(text: string, facts: GroundingFact[]): GroundingResult {
  const problems: string[] = [];
  const ids = new Set(facts.map((f) => f.id));
  for (const m of text.matchAll(CITATION_RE)) if (!ids.has(m[1]!)) problems.push(`Unknown citation [${m[1]}]`);
  for (const t of extractNumberTokens(text)) {
    const p = parseToken(t);
    if (!p || !Number.isFinite(p.value)) {
      problems.push(`Unparseable number "${t}"`);
      continue;
    }
    if (p.kind === 'number' && Number.isInteger(p.value) && p.value >= 0 && p.value <= FREE_INTEGER_MAX) continue;
    if (!matchesFact(p, facts)) problems.push(`Number "${t}" does not match any computed fact`);
  }
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`Disallowed wording (${re.source})`);
  return { grounded: problems.length === 0, problems };
}
