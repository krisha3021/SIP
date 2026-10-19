/**
 * Grounding checks for explanation text (deterministic or AI-generated).
 * Every number in the text must correspond to a computed fact (within display rounding), every [citation] must name a
 * known fact id, and guarantee / product-selection language is rejected. Text is data here — nothing in it is obeyed.
 *
 * The scanner recognises: ₹ amounts (with L / Cr / lakh / crore / k), unit words without ₹ ("8 crore"), percentages
 * ("12%", "12 percent", "12 per cent"), percentage ranges ("8–12.5%" → both ends are percentages), digits glued to
 * letters ("12x", "50k", "90th"), signed values with either minus sign, and number words next to a unit
 * ("twelve percent", "five crore"), which are always rejected because they cannot be matched to a fact.
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

/** A number with optional grouping commas, never ending in a comma (so "₹85,000," stops at "000"). */
const NUM = String.raw`(?:\d[\d,]*\d|\d)(?:\.\d+)?`;
/** A minus sign counts only at the start of a token (not inside "10-year"). */
const SIGN = String.raw`(?:(?<![\w.])[-−])?`;
const PCT_UNIT = String.raw`(?:%|percent\b|per\s?cent\b)`;
const NUM_WORD = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)`;

const SCAN_RE = new RegExp(
  [
    String.raw`(?<range>${SIGN}${NUM}\s?(?:–|—|-|to)\s?${SIGN}${NUM}\s?${PCT_UNIT})`,
    String.raw`(?<money>${SIGN}₹\s?${NUM}(?:\s?(?:L|Cr|lakh|crore|k)\b)?)`,
    String.raw`(?<pct>${SIGN}${NUM}\s?${PCT_UNIT})`,
    String.raw`(?<unitnum>${SIGN}${NUM}\s?(?:lakh|crore|L|Cr)\b)`,
    String.raw`(?<glued>${SIGN}${NUM}[A-Za-z]+)`,
    String.raw`(?<plain>${SIGN}${NUM})`,
    String.raw`(?<word>\b${NUM_WORD}(?:[\s-]+${NUM_WORD})*\s*(?:%|percent\b|per\s?cent\b|lakh\b|crore\b|rupees?\b|times\b))`,
  ].join('|'),
  'gi',
);
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
/** Bare small integers (ordinals, "2 of them") need no fact; ₹, %, unit and multiplier values always do. */
const FREE_INTEGER_MAX = 10;

type Kind = 'inr' | 'percent' | 'number';
interface Token {
  raw: string;
  /** Values to check; a range yields two. Empty with `reject` set means unmatchable by construction. */
  values: Array<{ kind: Kind; value: number; resolution: number; free: boolean }>;
  reject?: string;
}

function decimalsOf(s: string): number {
  const m = /\.(\d+)/.exec(s);
  return m ? m[1]!.length : 0;
}

function numbersIn(raw: string): Array<{ value: number; resolution: number }> {
  const out: Array<{ value: number; resolution: number }> = [];
  const re = new RegExp(String.raw`(${SIGN})(${NUM})`, 'g');
  for (const m of raw.matchAll(re)) {
    const sign = m[1] ? -1 : 1;
    out.push({ value: sign * Number(m[2]!.replace(/,/g, '')), resolution: Math.pow(10, -decimalsOf(m[2]!)) });
  }
  return out;
}

const multiplierOf = (raw: string) => (/\b(Cr|crore)\b/i.test(raw) ? 1e7 : /\b(L|lakh)\b/i.test(raw) ? 1e5 : /\dk\b|\sk\b/i.test(raw) ? 1e3 : 1);

function scan(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.replace(CITATION_RE, ' ').matchAll(SCAN_RE)) {
    const g = m.groups!;
    const raw = m[0].trim();
    if (g.word) {
      tokens.push({ raw, values: [], reject: `Number written in words ("${raw}") cannot be checked against the calculation` });
    } else if (g.range) {
      tokens.push({ raw, values: numbersIn(raw).map((n) => ({ kind: 'percent', ...n, free: false })) });
    } else if (g.money || g.unitnum) {
      const n = numbersIn(raw)[0]!;
      const mult = multiplierOf(raw);
      tokens.push({ raw, values: [{ kind: 'inr', value: n.value * mult, resolution: n.resolution * mult, free: false }] });
    } else if (g.pct) {
      tokens.push({ raw, values: numbersIn(raw).slice(0, 1).map((n) => ({ kind: 'percent', ...n, free: false })) });
    } else if (g.glued) {
      const suffix = raw.replace(/^[-−]?[\d,.]+/, '').toLowerCase();
      const n = numbersIn(raw)[0]!;
      if (suffix === 'k') tokens.push({ raw, values: [{ kind: 'inr', value: n.value * 1e3, resolution: n.resolution * 1e3, free: false }] });
      else if (/^(st|nd|rd|th)$/.test(suffix)) tokens.push({ raw, values: [{ kind: 'number', ...n, free: true }] });
      else tokens.push({ raw, values: [], reject: `"${raw}" is not a figure from the calculation` });
    } else {
      const n = numbersIn(raw)[0]!;
      tokens.push({ raw, values: [{ kind: 'number', ...n, free: true }] });
    }
  }
  return tokens;
}

export function extractNumberTokens(text: string): string[] {
  return scan(text).map((t) => t.raw);
}

function matchesFact(p: { kind: Kind; value: number; resolution: number }, facts: GroundingFact[]): boolean {
  return facts.some((f) => {
    const unitOk = p.kind === 'inr' ? f.unit === 'inr' : p.kind === 'percent' ? f.unit === 'percent' : f.unit === 'years' || f.unit === 'months' || f.unit === 'count';
    if (!unitOk) return false;
    const tol = p.resolution / 2 + (p.kind === 'inr' ? Math.abs(f.value) * 0.005 : 0) + 1e-9;
    return Math.abs(p.value - f.value) <= tol; // inclusive: toFixed ties (e.g. 11.15 → "11.1") are fair roundings
  });
}

export function checkGrounding(text: string, facts: GroundingFact[]): GroundingResult {
  const problems: string[] = [];
  const ids = new Set(facts.map((f) => f.id));
  for (const m of text.matchAll(CITATION_RE)) if (!ids.has(m[1]!)) problems.push(`Unknown citation [${m[1]}]`);
  for (const t of scan(text)) {
    if (t.reject) {
      problems.push(t.reject);
      continue;
    }
    for (const v of t.values) {
      if (!Number.isFinite(v.value)) {
        problems.push(`Unparseable number "${t.raw}"`);
        continue;
      }
      if (v.free && Number.isInteger(v.value) && v.value >= 0 && v.value <= FREE_INTEGER_MAX) continue;
      if (!matchesFact(v, facts)) problems.push(`Number "${t.raw}" does not match any computed fact`);
    }
  }
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`Disallowed wording (${re.source})`);
  return { grounded: problems.length === 0, problems };
}
