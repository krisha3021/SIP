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
  /** True when the year has been checked against primary text but awaits owner approval (estimates stay disabled). */
  pendingOwnerApproval?: boolean;
  /** Rule-by-rule record of what was checked, where, and when. */
  verificationEvidence?: Array<{ rule: string; reference: string; url: string; verifiedOn: string }>;
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
    // Verified by Agent 2 on 2026-10-17 against the primary texts below; left DISABLED until the owner approves.
    // To enable after review: set status to 'verified' and pendingOwnerApproval to false (one change).
    status: 'unverified',
    pendingOwnerApproval: true,
    verification:
      'Checked on 2026-10-17 against the Finance Act, 2026 (No. 4 of 2026, assent 30 March 2026, eGazette) and the Income-tax Act, 2025 as ' +
      'amended by the Finance Act, 2026 (Income Tax Department PDF). Every value used by this calculator is unchanged from FY 2025-26, under ' +
      'the new section numbers listed in verificationEvidence. Awaiting owner approval; estimates stay disabled until then.',
    verificationEvidence: [
      { rule: 'New-regime slabs: nil to ₹4,00,000; 5% to ₹8,00,000; 10% to ₹12,00,000; 15% to ₹16,00,000; 20% to ₹20,00,000; 25% to ₹24,00,000; 30% above', reference: 'Income-tax Act, 2025, s.202(1) Table', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'New regime disallows Chapter VIII deductions other than s.124(1), 124(2), 125(2) and 146', reference: 'Income-tax Act, 2025, s.202(2)(a)(xii)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Other-regime slabs: below 60 nil to ₹2,50,000, 5% to ₹5,00,000, 20% to ₹10,00,000, 30% above; 60–80 nil to ₹3,00,000; 80+ nil to ₹5,00,000 then 20% to ₹10,00,000', reference: 'Finance Act, 2026, s.3(1) and First Schedule Part I-B Paragraph A (I)–(III)', url: 'https://egazette.gov.in/WriteReadData/2026/271439.pdf', verifiedOn: '2026-10-17' },
      { rule: 'Rebate: 100% of tax up to ₹12,500 if total income ≤ ₹5,00,000', reference: 'Income-tax Act, 2025, s.156(1)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'New-regime rebate: up to ₹60,000 if income ≤ ₹12,00,000, with marginal relief above; capped at tax under s.202(1)', reference: 'Income-tax Act, 2025, s.156(2)(a), (b) and (3)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Standard deduction: ₹75,000 (or salary) under s.202(1); ₹50,000 (or salary) otherwise', reference: 'Income-tax Act, 2025, s.19(1) Table Sl. No. 2', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Schedule XV investments (former 80C) up to ₹1,50,000', reference: 'Income-tax Act, 2025, s.123', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Own pension-scheme contribution (former 80CCD(1B)) up to ₹50,000', reference: 'Income-tax Act, 2025, s.124(3)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Health insurance (former 80D): ₹25,000 self/family, ₹25,000 parents; ₹50,000 where the insured is a senior citizen', reference: 'Income-tax Act, 2025, s.126(2)(a), (2)(b) and (8)(a)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf', verifiedOn: '2026-10-17' },
      { rule: 'Surcharge starts above total income of ₹50,00,000 (the calculator refuses such cases)', reference: 'Finance Act, 2026, First Schedule Part I-B Paragraph F, Table 1 Sl. No. 1', url: 'https://egazette.gov.in/WriteReadData/2026/271439.pdf', verifiedOn: '2026-10-17' },
      { rule: 'Health and Education Cess at 4% of income-tax and surcharge', reference: 'Finance Act, 2026, s.3(15)', url: 'https://egazette.gov.in/WriteReadData/2026/271439.pdf', verifiedOn: '2026-10-17' },
    ],
    sources: [
      { label: 'Finance Act, 2026 (No. 4 of 2026), Gazette of India Extraordinary, 30 March 2026', url: 'https://egazette.gov.in/WriteReadData/2026/271439.pdf' },
      { label: 'Income-tax Act, 2025 as amended by the Finance Act, 2026 (Income Tax Department)', url: 'https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf' },
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
};

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_YEARS);
