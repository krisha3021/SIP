/**
 * Income-tax regime comparison for resident individuals (educational estimate).
 * Capital-gains estimation is a separate concern and is not handled here.
 */
import { z } from 'zod';
import { fail, ok, type CalcResult } from '../types';
import { amountSchema, parseInput } from '../validation';
import { TAX_YEARS, type RegimeRules, type Slab, type TaxYearConfig } from './config';

export const incomeTaxInputSchema = z.object({
  fy: z.string(),
  ageBand: z.enum(['below60', 'age60to80', 'above80']).default('below60'),
  salaryIncome: amountSchema.default(0),
  otherIncome: amountSchema.default(0),
  deductions: z
    .object({
      sec80C: amountSchema.default(0),
      sec80CCD1B: amountSchema.default(0),
      sec80DSelf: amountSchema.default(0),
      sec80DParents: amountSchema.default(0),
      parentsSenior: z.boolean().default(false),
    })
    .default({ sec80C: 0, sec80CCD1B: 0, sec80DSelf: 0, sec80DParents: 0, parentsSenior: false }),
});
export type IncomeTaxInput = z.input<typeof incomeTaxInputSchema>;

export interface RegimeEstimate {
  regime: 'new' | 'old';
  grossIncome: number;
  standardDeduction: number;
  chapterVIA: number;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  taxAfterRebate: number;
  cess: number;
  totalTax: number;
}

export interface IncomeTaxComparison {
  fy: string;
  new: RegimeEstimate;
  old: RegimeEstimate;
  lowerRegime: 'new' | 'old' | 'equal';
  difference: number;
  config: Pick<TaxYearConfig, 'sources' | 'verification' | 'exclusions'>;
}

export function slabTax(income: number, slabs: Slab[]): number {
  let tax = 0;
  let lower = 0;
  for (const s of slabs) {
    if (income <= lower) break;
    tax += (Math.min(income, s.upTo) - lower) * s.rate;
    lower = s.upTo;
  }
  return tax;
}

function estimate(
  regime: 'new' | 'old',
  rules: RegimeRules,
  cfg: TaxYearConfig,
  v: z.infer<typeof incomeTaxInputSchema>,
): RegimeEstimate {
  const gross = v.salaryIncome + v.otherIncome;
  const std = Math.min(v.salaryIncome, rules.standardDeductionSalaried);
  let via = 0;
  if (rules.deductionsAllowed) {
    const selfLimit = v.ageBand === 'below60' ? cfg.limits.sec80DSelf : cfg.limits.sec80DSelfSenior;
    const parentsLimit = v.deductions.parentsSenior ? cfg.limits.sec80DParentsSenior : cfg.limits.sec80DParents;
    via =
      Math.min(v.deductions.sec80C, cfg.limits.sec80C) +
      Math.min(v.deductions.sec80CCD1B, cfg.limits.sec80CCD1B) +
      Math.min(v.deductions.sec80DSelf, selfLimit) +
      Math.min(v.deductions.sec80DParents, parentsLimit);
  }
  const taxable = Math.max(0, gross - std - via);
  const base = slabTax(taxable, rules.slabs[v.ageBand]);
  let rebate = 0;
  if (taxable <= rules.rebate.maxTaxableIncome) {
    rebate = Math.min(base, rules.rebate.maxRebate);
  } else if (rules.rebate.marginalRelief) {
    const excess = taxable - rules.rebate.maxTaxableIncome;
    if (base > excess) rebate = base - excess;
  }
  const after = base - rebate;
  const cess = after * cfg.cessRate;
  return {
    regime,
    grossIncome: gross,
    standardDeduction: std,
    chapterVIA: via,
    taxableIncome: taxable,
    slabTax: base,
    rebate,
    taxAfterRebate: after,
    cess,
    totalTax: after + cess,
  };
}

export function compareIncomeTax(input: IncomeTaxInput): CalcResult<IncomeTaxComparison> {
  const parsed = parseInput(incomeTaxInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  const cfg = TAX_YEARS[v.fy];
  if (!cfg) return fail('UNSUPPORTED', `Financial year ${v.fy} is not configured.`, 'fy');
  if (cfg.status !== 'verified') {
    return fail('UNVERIFIED_RULES', `Rules for FY ${cfg.fy} have not been verified yet, so no estimate is shown. ${cfg.verification}`, 'fy');
  }
  if (v.salaryIncome + v.otherIncome > cfg.surchargeThreshold) {
    return fail('UNSUPPORTED', 'Incomes above ₹50 lakh attract surcharge, which this calculator does not model.');
  }
  const n = estimate('new', cfg.regimes.new, cfg, v);
  const o = estimate('old', cfg.regimes.old, cfg, v);
  const diff = Math.abs(n.totalTax - o.totalTax);
  return ok({
    fy: cfg.fy,
    new: n,
    old: o,
    lowerRegime: diff < 0.5 ? 'equal' : n.totalTax < o.totalTax ? 'new' : 'old',
    difference: diff,
    config: { sources: cfg.sources, verification: cfg.verification, exclusions: cfg.exclusions },
  });
}
