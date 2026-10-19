/**
 * Capital-gains rules for resident individuals redeeming Indian mutual-fund units, keyed by financial year.
 *
 * Every rule records the primary source it was checked against and the date of that check. A year whose
 * `status` is not 'verified' is disabled (UNVERIFIED_RULES). A rule path that could not be verified from a
 * primary source is listed in `disabledPaths` and refused, never estimated.
 *
 * Do not mark a year verified without checking the Income-tax Act / Finance Act text or the Income Tax
 * Department's own pages, and without owner review. See docs/CALCULATION-METHODOLOGY.md §18.
 */
import { TAX_YEARS } from './config';

export interface RuleSource {
  label: string;
  url: string;
  /** ISO date the text was read from a live copy of the page. */
  verifiedOn: string;
}

export interface CapitalGainsRule<T> {
  value: T;
  /** Plain-language statement of the rule as encoded. */
  rule: string;
  sources: RuleSource[];
}

export interface CapitalGainsYearConfig {
  fy: string;
  /** Inclusive ISO bounds of the financial year (1 April – 31 March). */
  from: string;
  to: string;
  status: 'verified' | 'unverified';
  verification: string;
  /** Transfers on or after this date use the rates below (Finance (No. 2) Act, 2024). */
  ratesApplyToTransfersFrom: string;
  equity: {
    /** Long-term if held for MORE than this many months. */
    longTermAfterMonths: CapitalGainsRule<number>;
    stcgRate111A: CapitalGainsRule<number>;
    ltcgRate112A: CapitalGainsRule<number>;
    ltcgExemption112A: CapitalGainsRule<number>;
    /** Units acquired before this date use the 31-Jan-2018 FMV cost rule. */
    grandfatheringAcquiredBefore: CapitalGainsRule<string>;
    sttOnRedemption: CapitalGainsRule<number>;
  };
  specified: {
    /** Units of a Specified Mutual Fund acquired on or after this date: deemed short-term at slab rates. */
    acquiredOnOrAfter: CapitalGainsRule<string>;
  };
  other: {
    longTermAfterMonths: CapitalGainsRule<number>;
    ltcgRate112: CapitalGainsRule<number>;
    indexation: CapitalGainsRule<false>;
  };
  cessRate: CapitalGainsRule<number>;
  disabledPaths: Array<{ id: 'listed-non-equity-units'; reason: string }>;
  exclusions: string[];
}

const VERIFIED_ON = '2026-10-17';
const SRC = {
  stcg: { label: 'Income Tax India — Tax on short-term capital gains', url: 'https://www.incometaxindia.gov.in/w/tax-on-short-term-capital-gains%E2%80%8B', verifiedOn: VERIFIED_ON },
  ltcg: { label: 'Income Tax India — Tax on long-term capital gains', url: 'https://www.incometaxindia.gov.in/w/tax-on-long-term-capital-gains%E2%80%8B', verifiedOn: VERIFIED_ON },
  s50AA: { label: 'Income-tax Act, 1961 — Section 50AA (as amended by Finance (No. 2) Act, 2024)', url: 'https://www.incometaxindia.gov.in/w/section-50aa-3', verifiedOn: VERIFIED_ON },
  s98: { label: 'Finance (No. 2) Act, 2004, Chapter VII — Section 98 (securities transaction tax)', url: 'https://www.incometaxindia.gov.in/w/section-98-55', verifiedOn: VERIFIED_ON },
} satisfies Record<string, RuleSource>;

const EXCLUSIONS = [
  'Surcharge: never added. The estimate does not check whether your total income crosses a surcharge threshold.',
  'Rounding of tax and income under sections 288A / 288B.',
  'Securities transaction tax and stamp duty amounts (enter stamp duty inside the purchase cost if you want it counted).',
  'Set-off of losses across gain types, and carry-forward of losses. Within one gain type, lots are netted for this redemption only.',
  'The adjustment that lets a resident individual use unexhausted basic exemption against s.111A / s.112A gains, and the s.87A rebate.',
  'Non-residents, TDS on redemption, HUFs and other taxpayers.',
  'IDCW (dividend) payouts, switches between schemes or plans, bonus units and segregated portfolios.',
  'ELSS lock-in: only a warning is shown if units seem to be redeemed within three years; it is not validated.',
  'Grandfathering without a 31 January 2018 value: the estimate fails rather than approximate it.',
  'Exchange-listed units of funds that are not equity-oriented (for example some ETFs): not estimated (rule not verified).',
];

const FY_2025_26: CapitalGainsYearConfig = {
  fy: '2025-26',
  from: '2025-04-01',
  to: '2026-03-31',
  status: 'verified',
  verification:
    'Each rule below was read on 2026-10-17 from the Income Tax Department / Income-tax Act pages listed with it. ' +
    'All transfers in FY 2025-26 fall after 23 July 2024, so only the post-amendment rates apply. Re-check before each launch.',
  ratesApplyToTransfersFrom: '2024-07-23',
  equity: {
    longTermAfterMonths: {
      value: 12,
      rule: 'Units of an equity-oriented mutual fund are long-term when held for more than 12 months before the transfer.',
      sources: [SRC.ltcg],
    },
    stcgRate111A: {
      value: 0.2,
      rule: 'Short-term gains on equity-oriented fund units under s.111A (transaction chargeable to STT) are taxed at 20% for transfers on or after 23-07-2024.',
      sources: [SRC.stcg],
    },
    ltcgRate112A: {
      value: 0.125,
      rule: 'Long-term gains on equity-oriented fund units under s.112A are taxed at 12.5% on the amount above the annual exemption, for transfers on or after 23-07-2024.',
      sources: [SRC.ltcg],
    },
    ltcgExemption112A: {
      value: 125_000,
      rule: 'Only s.112A long-term gains above ₹1,25,000 in the year are taxed.',
      sources: [SRC.ltcg],
    },
    grandfatheringAcquiredBefore: {
      value: '2018-02-01',
      rule:
        'For units acquired before 1 February 2018, cost = higher of the actual cost and the lower of (fair market value on 31 January 2018, sale value). ' +
        'For units not listed on an exchange, that fair market value is the NAV on 31 January 2018.',
      sources: [SRC.ltcg],
    },
    sttOnRedemption: {
      value: 0.00001,
      rule: 'Sale of a unit of an equity-oriented fund to the Mutual Fund is chargeable to STT at 0.001% (paid by the seller), so redemptions meet the STT condition of s.111A / s.112A.',
      sources: [SRC.s98],
    },
  },
  specified: {
    acquiredOnOrAfter: {
      value: '2023-04-01',
      rule:
        'Gains on units of a Specified Mutual Fund acquired on or after 1 April 2023 are deemed short-term capital gains, whatever the holding period, ' +
        'and are therefore taxed at the slab rate. (s.50AA)',
      sources: [SRC.s50AA, SRC.stcg],
    },
  },
  other: {
    longTermAfterMonths: {
      value: 24,
      rule: 'Other mutual-fund units (not equity-oriented, not covered by s.50AA) are long-term when held for more than 24 months, for transfers on or after 23-07-2024.',
      sources: [SRC.ltcg],
    },
    ltcgRate112: {
      value: 0.125,
      rule: 'Long-term gains on other assets are taxed at 12.5% under s.112 for transfers on or after 23-07-2024; short-term gains are taxed at the slab rate.',
      sources: [SRC.ltcg, SRC.stcg],
    },
    indexation: {
      value: false,
      rule: 'No indexation is allowed for long-term capital assets transferred on or after 23-07-2024 (the land/building exception does not apply to fund units).',
      sources: [SRC.ltcg],
    },
  },
  cessRate: {
    value: TAX_YEARS['2025-26']!.cessRate,
    rule: 'Health and education cess of 4% on the tax (same verified FY 2025-26 rate as the income-tax module).',
    sources: TAX_YEARS['2025-26']!.sources.map((s) => ({ ...s, verifiedOn: VERIFIED_ON })),
  },
  disabledPaths: [
    {
      id: 'listed-non-equity-units',
      reason:
        'The holding period for exchange-listed units of funds that are not equity-oriented (for example some ETFs) could not be confirmed from a ' +
        'primary source page, so Lakshya does not estimate it.',
    },
  ],
  exclusions: EXCLUSIONS,
};

export const CAPITAL_GAINS_YEARS: Record<string, CapitalGainsYearConfig> = {
  '2025-26': FY_2025_26,
  '2026-27': {
    ...FY_2025_26,
    fy: '2026-27',
    from: '2026-04-01',
    to: '2027-03-31',
    status: 'unverified',
    verification:
      'FY 2026-27 falls under the Income-tax Act, 2025 and the Finance Act 2026. These rules have not been checked against that text, so estimates are disabled.',
  },
};

export const SUPPORTED_CAPITAL_GAINS_YEARS = Object.keys(CAPITAL_GAINS_YEARS);
