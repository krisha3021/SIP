/**
 * Financial-year-keyed income-tax configuration for resident individuals.
 *
 * Every year carries a `status`:
 *   - 'verified'   — rules were checked against the listed authoritative sources.
 *   - 'unverified' — the year is listed, but estimates are DISABLED until someone completes verification.
 *
 * Do not mark a year verified without checking the primary source (Finance Act / Income Tax
 * Department). Record who verified it and when in `verification`.
 */

export interface Slab {
  /** Upper bound of the slab in ₹ (Infinity for the top slab). */
  upTo: number;
  rate: number;
}

export interface RegimeRules {
  /** Slabs by age band. New-regime slabs are the same for all ages. */
  slabs: { below60: Slab[]; age60to80: Slab[]; above80: Slab[] };
  standardDeductionSalaried: number;
  rebate: { maxTaxableIncome: number; maxRebate: number; marginalRelief: boolean };
  deductionsAllowed: boolean;
}

export interface TaxYearConfig {
  fy: string;
  assessmentYear: string;
  status: 'verified' | 'unverified';
  verification: string;
  sources: Array<{ label: string; url: string }>;
  cessRate: number;
  /** Total income above which surcharge applies. Above this, the calculator declines to estimate. */
  surchargeThreshold: number;
  limits: { sec80C: number; sec80CCD1B: number; sec80DSelf: number; sec80DSelfSenior: number; sec80DParents: number; sec80DParentsSenior: number };
  regimes: { new: RegimeRules; old: RegimeRules };
  exclusions: string[];
}

const NEW_SLABS_FY26: Slab[] = [
  { upTo: 400_000, rate: 0 },
  { upTo: 800_000, rate: 0.05 },
  { upTo: 1_200_000, rate: 0.1 },
  { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.2 },
  { upTo: 2_400_000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

const OLD_SLABS = (exemption: number): Slab[] => [
  ...(exemption < 500_000 ? [{ upTo: exemption, rate: 0 }, { upTo: 500_000, rate: 0.05 }] : [{ upTo: 500_000, rate: 0 }]),
  { upTo: 1_000_000, rate: 0.2 },
  { upTo: Infinity, rate: 0.3 },
];

const COMMON_EXCLUSIONS = [
  'Surcharge (total income above ₹50 lakh) — the calculator does not estimate these cases.',
  'Special-rate income such as capital gains, lottery winnings and crypto-asset income.',
  'Employer NPS contribution (80CCD(2)), HRA, LTA, home-loan interest (24(b)), 80E, 80G, 80TTA/TTB and other deductions.',
  'Non-resident, HUF, firm and company taxpayers; agricultural-income aggregation.',
  'Rounding of total income under section 288A.',
];

export const TAX_YEARS: Record<string, TaxYearConfig> = {
  '2025-26': {
    fy: '2025-26',
    assessmentYear: '2026-27',
    status: 'verified',
    verification:
      'Slabs, the ₹60,000 / ₹12 lakh new-regime rebate with marginal relief, and the old-regime ₹12,500 / ₹5 lakh rebate were checked on 2026-10-17 against the Income Tax Department pages listed. Re-check before each launch.',
    sources: [
      { label: 'Income Tax Department — Salaried individuals, AY 2026-27', url: 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1' },
      { label: 'Income Tax India — Tax rates', url: 'https://www.incometaxindia.gov.in/w/tax-rates%E2%80%8B' },
    ],
    cessRate: 0.04,
    surchargeThreshold: 5_000_000,
    limits: { sec80C: 150_000, sec80CCD1B: 50_000, sec80DSelf: 25_000, sec80DSelfSenior: 50_000, sec80DParents: 25_000, sec80DParentsSenior: 50_000 },
    regimes: {
      new: {
        slabs: { below60: NEW_SLABS_FY26, age60to80: NEW_SLABS_FY26, above80: NEW_SLABS_FY26 },
        standardDeductionSalaried: 75_000,
        rebate: { maxTaxableIncome: 1_200_000, maxRebate: 60_000, marginalRelief: true },
        deductionsAllowed: false,
      },
      old: {
        slabs: { below60: OLD_SLABS(250_000), age60to80: OLD_SLABS(300_000), above80: OLD_SLABS(500_000) },
        standardDeductionSalaried: 50_000,
        rebate: { maxTaxableIncome: 500_000, maxRebate: 12_500, marginalRelief: false },
        deductionsAllowed: true,
      },
    },
    exclusions: COMMON_EXCLUSIONS,
  },
  '2026-27': {
    fy: '2026-27',
    assessmentYear: '2027-28 (tax year 2026-27 under the Income-tax Act, 2025)',
    status: 'unverified',
    verification:
      'Secondary sources report unchanged slabs under the Income-tax Act, 2025 (rebate now under section 157), but these have not been checked against the Finance Act 2026 text. Estimates are disabled until that check is complete.',
    sources: [{ label: 'Finance Bill 2026 (India Budget)', url: 'https://www.indiabudget.gov.in/doc/Finance_Bill.pdf' }],
    cessRate: 0.04,
    surchargeThreshold: 5_000_000,
    limits: { sec80C: 150_000, sec80CCD1B: 50_000, sec80DSelf: 25_000, sec80DSelfSenior: 50_000, sec80DParents: 25_000, sec80DParentsSenior: 50_000 },
    regimes: {
      new: {
        slabs: { below60: NEW_SLABS_FY26, age60to80: NEW_SLABS_FY26, above80: NEW_SLABS_FY26 },
        standardDeductionSalaried: 75_000,
        rebate: { maxTaxableIncome: 1_200_000, maxRebate: 60_000, marginalRelief: true },
        deductionsAllowed: false,
      },
      old: {
        slabs: { below60: OLD_SLABS(250_000), age60to80: OLD_SLABS(300_000), above80: OLD_SLABS(500_000) },
        standardDeductionSalaried: 50_000,
        rebate: { maxTaxableIncome: 500_000, maxRebate: 12_500, marginalRelief: false },
        deductionsAllowed: true,
      },
    },
    exclusions: COMMON_EXCLUSIONS,
  },
};

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_YEARS);
