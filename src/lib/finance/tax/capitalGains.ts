/**
 * Capital-gains estimate for a resident individual redeeming Indian mutual-fund units (educational).
 * Separate from the income-tax module: slab-rate gains use the marginal slab rate the USER enters; this
 * module never computes income tax itself.
 *
 * Method (docs/CALCULATION-METHODOLOGY.md §18):
 *   1. Lots are matched first-in, first-out (FIFO) against the redeemed units, as registrars (RTAs) do.
 *   2. Each matched slice is classified by fund type and holding period:
 *        equity-oriented: > 12 months → LTCG s.112A, otherwise STCG s.111A
 *        specified MF (s.50AA), acquired on/after 1-4-2023 → deemed STCG at slab rate, any holding period
 *        other (and specified-MF units acquired before 1-4-2023): > 24 months → LTCG s.112 (no indexation),
 *          otherwise STCG at slab rate
 *   3. Equity units acquired before 1-2-2018 use the grandfathered cost (needs the 31-1-2018 value).
 *   4. Gains are netted within each treatment for THIS redemption; a net loss is taxed at zero (no set-off).
 *   5. s.112A exemption: ₹1,25,000 for the year, less what the user has already used elsewhere.
 *   6. Tax per component, then 4% cess on the total. No surcharge, no rounding.
 */
import { z } from 'zod';
import { addMonths, clampedDate, daysBetween, isIsoDate } from '../dates';
import { fail, ok, type CalcResult } from '../types';
import { amountSchema, parseInput } from '../validation';
import { CAPITAL_GAINS_YEARS, type CapitalGainsYearConfig, type RuleSource } from './capitalGainsConfig';

export const CAPITAL_GAINS_NOTICE =
  'Educational estimate only, for resident individuals redeeming Indian mutual-fund units. It is not tax advice. It applies ' +
  'only the rules listed, each checked against the source shown, and leaves out surcharge, loss set-off and carry-forward, the ' +
  'basic-exemption adjustment, the s.87A rebate and the other items listed. Your actual tax depends on your full return. Check ' +
  'with a qualified tax professional or the Income Tax Department before filing. Lakshya is not registered with SEBI as an ' +
  'investment adviser.';

export const FUND_TYPES = ['equity-oriented', 'specified', 'other'] as const;
export type FundType = (typeof FUND_TYPES)[number];

/** Plain-language explanation of each fund type, for the UI's selector. */
export const FUND_TYPE_EXPLANATIONS: Record<FundType, string> = {
  'equity-oriented':
    'A fund that invests at least 65% of its money in shares of Indian companies (for example most Indian equity funds and ELSS). ' +
    'Check the scheme information document or your AMC statement.',
  specified:
    'A "Specified Mutual Fund" under section 50AA. In the text in force from 1 April 2026, this is a fund that invests more than 65% of its money in ' +
    'debt and money-market instruments, or a fund that invests 65% or more in such funds. The earlier text covered funds with at most 35% in ' +
    'Indian shares. Units bought on or after 1 April 2023 are taxed at your slab rate however long you hold them. Your AMC statement usually shows this.',
  other:
    'Any other fund: for example hybrid funds with 35–65% in Indian shares, or units of a debt fund bought before 1 April 2023.',
};

export const SLAB_RATES_PCT = [0, 5, 10, 15, 20, 25, 30] as const;

const isoDate = z.string().refine(isIsoDate, 'Use a valid date (YYYY-MM-DD)');
const positive = (label: string) => z.number().refine((v) => Number.isFinite(v) && v > 0, `${label} must be greater than zero`);

export const capitalGainsInputSchema = z
  .object({
    fy: z.string(),
    fundType: z.enum(FUND_TYPES),
    /** Exchange-listed units (ETFs). Listed non-equity units are not estimated. */
    listedOnExchange: z.boolean().default(false),
    isElss: z.boolean().default(false),
    lots: z
      .array(
        z
          .object({
            purchaseDate: isoDate,
            units: positive('Units'),
            /** Purchase NAV per unit. Give this or `totalCost`. */
            navPerUnit: positive('NAV').optional(),
            /** Total cost of the lot in rupees (include stamp duty here if you want it counted). */
            totalCost: amountSchema.optional(),
            /** NAV on 31 January 2018. Required for equity-oriented units bought before 1 February 2018. */
            fmvPerUnitOn20180131: positive('31 January 2018 value').optional(),
          })
          .refine((l) => (l.navPerUnit === undefined) !== (l.totalCost === undefined), { message: 'Give either the purchase NAV or the total cost', path: ['navPerUnit'] }),
      )
      .min(1, 'Add at least one purchase')
      .max(500),
    redemption: z.object({ date: isoDate, units: positive('Units redeemed'), navPerUnit: positive('Redemption NAV') }),
    /** Your marginal income-tax slab rate (%), needed only when a gain is taxed at slab rates. */
    marginalSlabRatePct: z
      .number()
      .refine((r) => (SLAB_RATES_PCT as readonly number[]).includes(r), `Slab rate must be one of ${SLAB_RATES_PCT.join(', ')}%`)
      .optional(),
    /** s.112A long-term gains already realised elsewhere in the same year (uses up the exemption first). */
    other112ALtcgAlreadyRealised: amountSchema.default(0),
  })
  .superRefine((v, ctx) => {
    v.lots.forEach((l, i) => {
      if (isIsoDate(l.purchaseDate) && isIsoDate(v.redemption.date) && l.purchaseDate > v.redemption.date) {
        ctx.addIssue({ code: 'custom', message: 'Purchase date is after the redemption date', path: ['lots', i, 'purchaseDate'] });
      }
    });
    const held = v.lots.reduce((s, l) => s + (Number.isFinite(l.units) ? l.units : 0), 0);
    if (v.redemption.units > held + 1e-9) {
      ctx.addIssue({ code: 'custom', message: 'More units are redeemed than the purchases listed', path: ['redemption', 'units'] });
    }
  });
export type CapitalGainsInput = z.input<typeof capitalGainsInputSchema>;

export type GainTreatment = 'stcg-111a' | 'ltcg-112a' | 'stcg-50aa-slab' | 'stcg-slab' | 'ltcg-112';

export const TREATMENT_LABELS: Record<GainTreatment, string> = {
  'stcg-111a': 'Short-term, equity-oriented (s.111A)',
  'ltcg-112a': 'Long-term, equity-oriented (s.112A)',
  'stcg-50aa-slab': 'Deemed short-term, specified mutual fund (s.50AA), slab rate',
  'stcg-slab': 'Short-term, other fund, slab rate',
  'ltcg-112': 'Long-term, other fund (s.112, no indexation)',
};

export interface LotSlice {
  /** Index of the lot in the input. */
  lotIndex: number;
  purchaseDate: string;
  unitsRedeemed: number;
  holdingDays: number;
  term: 'short' | 'long';
  treatment: GainTreatment;
  actualCostPerUnit: number;
  /** Cost per unit used, after grandfathering when it applies. */
  costPerUnitUsed: number;
  grandfathered: boolean;
  costBasis: number;
  saleValue: number;
  gain: number;
}

export interface TreatmentTotal {
  treatment: GainTreatment;
  label: string;
  /** Net gain for this redemption (can be negative). */
  netGain: number;
  /** After the s.112A exemption (for ltcg-112a) and with losses floored at zero. */
  taxableGain: number;
  /** Decimal rate applied; null when there is no gain of this type. */
  rate: number | null;
  tax: number;
}

export interface CapitalGainsResult {
  fy: string;
  fundType: FundType;
  slices: LotSlice[];
  /** Units left in the listed purchases after FIFO matching. */
  unitsRemaining: number;
  totals: { saleValue: number; costBasis: number; gain: number };
  byTreatment: TreatmentTotal[];
  exemption112A: { limit: number; alreadyUsedElsewhere: number; available: number; used: number };
  taxBeforeCess: number;
  cessRate: number;
  cess: number;
  totalTax: number;
  rules: Array<{ id: string; rule: string; sources: RuleSource[] }>;
  verification: string;
  exclusions: string[];
  notice: string;
}

/** ISO date `months` calendar months after `iso`, clamped to month end (31 Jan + 1 month → 28/29 Feb). */
function plusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const [y2, m2] = addMonths(y, m, months);
  return clampedDate(y2, m2, d);
}

/** "Held for more than N months": the transfer date is after the date N calendar months after purchase. */
export function heldMoreThanMonths(purchaseDate: string, transferDate: string, months: number): boolean {
  return transferDate > plusMonths(purchaseDate, months);
}

function rulesUsed(cfg: CapitalGainsYearConfig, fundType: FundType): CapitalGainsResult['rules'] {
  const r = (id: string, x: { rule: string; sources: RuleSource[] }) => ({ id, rule: x.rule, sources: x.sources });
  const common = [r('cess', cfg.cessRate)];
  if (fundType === 'equity-oriented') {
    return [
      r('equity-holding-period', cfg.equity.longTermAfterMonths),
      r('stcg-111a', cfg.equity.stcgRate111A),
      r('ltcg-112a', cfg.equity.ltcgRate112A),
      r('ltcg-112a-exemption', cfg.equity.ltcgExemption112A),
      r('grandfathering', cfg.equity.grandfatheringAcquiredBefore),
      r('stt-on-redemption', cfg.equity.sttOnRedemption),
      ...common,
    ];
  }
  const other = [r('other-holding-period', cfg.other.longTermAfterMonths), r('ltcg-112', cfg.other.ltcgRate112), r('no-indexation', cfg.other.indexation)];
  return fundType === 'specified' ? [r('s50aa', cfg.specified.acquiredOnOrAfter), ...other, ...common] : [...other, ...common];
}

export function estimateCapitalGains(input: CapitalGainsInput): CalcResult<CapitalGainsResult> {
  const parsed = parseInput(capitalGainsInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;

  const cfg = CAPITAL_GAINS_YEARS[v.fy];
  if (!cfg) return fail('UNSUPPORTED', `Capital-gains rules for FY ${v.fy} are not configured.`, 'fy');
  if (cfg.status !== 'verified') return fail('UNVERIFIED_RULES', `Capital-gains rules for FY ${cfg.fy} have not been verified, so no estimate is shown. ${cfg.verification}`, 'fy');
  if (v.redemption.date < cfg.from || v.redemption.date > cfg.to) {
    return fail('INVALID_INPUT', `The redemption date must fall in FY ${cfg.fy} (${cfg.from} to ${cfg.to}).`, 'redemption.date');
  }
  if (v.redemption.date < cfg.ratesApplyToTransfersFrom) {
    return fail('UNSUPPORTED', `Only transfers on or after ${cfg.ratesApplyToTransfersFrom} are estimated.`, 'redemption.date');
  }
  if (v.fundType !== 'equity-oriented' && v.listedOnExchange) {
    const path = cfg.disabledPaths.find((p) => p.id === 'listed-non-equity-units');
    return fail('UNVERIFIED_RULES', path?.reason ?? 'This case is not estimated.', 'listedOnExchange');
  }

  // ── FIFO matching ──────────────────────────────────────────────────────────
  const order = v.lots.map((l, i) => ({ l, i })).sort((a, b) => (a.l.purchaseDate < b.l.purchaseDate ? -1 : a.l.purchaseDate > b.l.purchaseDate ? 1 : a.i - b.i));
  const saleNav = v.redemption.navPerUnit;
  let toRedeem = v.redemption.units;
  let unitsRemaining = 0;
  const slices: LotSlice[] = [];
  const warnings = [CAPITAL_GAINS_NOTICE];
  let elssWarned = false;

  for (const { l, i } of order) {
    const take = Math.min(l.units, Math.max(0, toRedeem));
    unitsRemaining += l.units - take;
    if (take <= 1e-12) continue;
    toRedeem -= take;

    const actualCostPerUnit = l.navPerUnit ?? l.totalCost! / l.units;
    let treatment: GainTreatment;
    let term: 'short' | 'long';
    let costPerUnitUsed = actualCostPerUnit;
    let grandfathered = false;

    if (v.fundType === 'equity-oriented') {
      term = heldMoreThanMonths(l.purchaseDate, v.redemption.date, cfg.equity.longTermAfterMonths.value) ? 'long' : 'short';
      treatment = term === 'long' ? 'ltcg-112a' : 'stcg-111a';
      if (term === 'long' && l.purchaseDate < cfg.equity.grandfatheringAcquiredBefore.value) {
        if (l.fmvPerUnitOn20180131 === undefined) {
          return fail(
            'INVALID_INPUT',
            `This purchase was made before 1 February 2018, so its cost depends on the NAV on 31 January 2018. Enter that NAV; Lakshya does not approximate it.`,
            `lots.${i}.fmvPerUnitOn20180131`,
          );
        }
        costPerUnitUsed = Math.max(actualCostPerUnit, Math.min(l.fmvPerUnitOn20180131, saleNav));
        grandfathered = true;
      }
      if (v.isElss && !elssWarned && !heldMoreThanMonths(l.purchaseDate, v.redemption.date, 36)) {
        warnings.push('ELSS units are normally locked in for three years from each purchase. Some of these units appear to be inside that period; Lakshya does not check whether the redemption is allowed.');
        elssWarned = true;
      }
    } else if (v.fundType === 'specified' && l.purchaseDate >= cfg.specified.acquiredOnOrAfter.value) {
      term = 'short';
      treatment = 'stcg-50aa-slab';
    } else {
      term = heldMoreThanMonths(l.purchaseDate, v.redemption.date, cfg.other.longTermAfterMonths.value) ? 'long' : 'short';
      treatment = term === 'long' ? 'ltcg-112' : 'stcg-slab';
    }

    const costBasis = costPerUnitUsed * take;
    const saleValue = saleNav * take;
    slices.push({
      lotIndex: i,
      purchaseDate: l.purchaseDate,
      unitsRedeemed: take,
      holdingDays: daysBetween(l.purchaseDate, v.redemption.date),
      term,
      treatment,
      actualCostPerUnit,
      costPerUnitUsed,
      grandfathered,
      costBasis,
      saleValue,
      gain: saleValue - costBasis,
    });
  }
  if (v.fundType === 'specified' && slices.some((s) => s.treatment !== 'stcg-50aa-slab')) {
    warnings.push('Units of a specified fund bought before 1 April 2023 are taxed under the ordinary rules for other funds.');
  }

  // ── Aggregate and tax ──────────────────────────────────────────────────────
  const net = (t: GainTreatment) => slices.filter((s) => s.treatment === t).reduce((sum, s) => sum + s.gain, 0);
  const present = new Set(slices.map((s) => s.treatment));
  const slabTreatments: GainTreatment[] = ['stcg-50aa-slab', 'stcg-slab'];
  if (slabTreatments.some((t) => present.has(t) && net(t) > 0) && v.marginalSlabRatePct === undefined) {
    return fail('INVALID_INPUT', 'Part of this gain is taxed at your income-tax slab rate. Enter your marginal slab rate.', 'marginalSlabRatePct');
  }
  const slab = (v.marginalSlabRatePct ?? 0) / 100;

  const limit = cfg.equity.ltcgExemption112A.value;
  const available = Math.max(0, limit - v.other112ALtcgAlreadyRealised);
  const ltcg112ANet = net('ltcg-112a');
  const used = present.has('ltcg-112a') ? Math.min(available, Math.max(0, ltcg112ANet)) : 0;

  const rateFor: Record<GainTreatment, number> = {
    'stcg-111a': cfg.equity.stcgRate111A.value,
    'ltcg-112a': cfg.equity.ltcgRate112A.value,
    'stcg-50aa-slab': slab,
    'stcg-slab': slab,
    'ltcg-112': cfg.other.ltcgRate112.value,
  };
  const byTreatment: TreatmentTotal[] = (Object.keys(TREATMENT_LABELS) as GainTreatment[])
    .filter((t) => present.has(t))
    .map((t) => {
      const netGain = net(t);
      const taxableGain = Math.max(0, netGain - (t === 'ltcg-112a' ? used : 0));
      return { treatment: t, label: TREATMENT_LABELS[t], netGain, taxableGain, rate: rateFor[t], tax: taxableGain * rateFor[t] };
    });
  if (byTreatment.some((b) => b.netGain < 0)) {
    warnings.push('A gain type shows a net loss. It is taxed at zero here; set-off against other gains and carry-forward are not modelled.');
  }

  const taxBeforeCess = byTreatment.reduce((s, b) => s + b.tax, 0);
  const cessRate = cfg.cessRate.value;
  const cess = taxBeforeCess * cessRate;
  const totals = {
    saleValue: slices.reduce((s, x) => s + x.saleValue, 0),
    costBasis: slices.reduce((s, x) => s + x.costBasis, 0),
    gain: slices.reduce((s, x) => s + x.gain, 0),
  };
  if (![totals.saleValue, totals.costBasis, taxBeforeCess, cess].every(Number.isFinite)) return fail('NON_FINITE_RESULT', 'The estimate could not be computed.');

  return ok(
    {
      fy: cfg.fy,
      fundType: v.fundType,
      slices,
      unitsRemaining,
      totals,
      byTreatment,
      exemption112A: { limit, alreadyUsedElsewhere: v.other112ALtcgAlreadyRealised, available, used },
      taxBeforeCess,
      cessRate,
      cess,
      totalTax: taxBeforeCess + cess,
      rules: rulesUsed(cfg, v.fundType),
      verification: cfg.verification,
      exclusions: cfg.exclusions,
      notice: CAPITAL_GAINS_NOTICE,
    },
    warnings,
  );
}
