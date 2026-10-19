/**
 * Capital-gains estimator. Expected values are worked by hand from the rules quoted in
 * capitalGainsConfig.ts. One case reproduces the Income Tax Department's own grandfathering illustration
 * ("Mr. Saurabh", incometaxindia.gov.in, Tax on long-term capital gains), with fund units in place of shares.
 */
import { describe, expect, it } from 'vitest';
import { CAPITAL_GAINS_NOTICE, estimateCapitalGains, heldMoreThanMonths, type CapitalGainsInput, type CapitalGainsResult } from '@/lib/finance/tax/capitalGains';
import { CAPITAL_GAINS_YEARS } from '@/lib/finance/tax/capitalGainsConfig';
import { compareIncomeTax } from '@/lib/finance/tax/incomeTax';
import { buildCapitalGainsReport } from '@/lib/export/reportBuilders';
import { reportToCsv } from '@/lib/export/report';

const run = (input: CapitalGainsInput): { value: CapitalGainsResult; warnings: string[] } => {
  const r = estimateCapitalGains(input);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
};
const tax = (v: CapitalGainsResult, t: string) => v.byTreatment.find((b) => b.treatment === t);
const failure = (input: CapitalGainsInput) => {
  const r = estimateCapitalGains(input);
  if (r.ok) throw new Error('expected failure');
  return r.error;
};

describe('equity-oriented funds', () => {
  const twoLots: CapitalGainsInput = {
    fy: '2025-26',
    fundType: 'equity-oriented',
    lots: [
      { purchaseDate: '2023-04-03', units: 10_000, navPerUnit: 20 },
      { purchaseDate: '2025-03-03', units: 2_000, navPerUnit: 30 },
    ],
    redemption: { date: '2025-09-15', units: 11_000, navPerUnit: 45 },
  };

  it('FIFO across a long and a short lot, with the ₹1.25 lakh exemption (hand-worked)', () => {
    const { value: v } = run(twoLots);
    // Lot 1: 10,000 × (45 − 20) = 2,50,000 long-term. Lot 2: 1,000 × (45 − 30) = 15,000 short-term.
    expect(v.slices.map((s) => [s.lotIndex, s.unitsRedeemed, s.term, s.treatment, s.gain])).toEqual([
      [0, 10_000, 'long', 'ltcg-112a', 250_000],
      [1, 1_000, 'short', 'stcg-111a', 15_000],
    ]);
    expect(v.unitsRemaining).toBe(1_000);
    expect(v.exemption112A).toEqual({ limit: 125_000, alreadyUsedElsewhere: 0, available: 125_000, used: 125_000 });
    expect(tax(v, 'ltcg-112a')).toMatchObject({ taxableGain: 125_000, rate: 0.125, tax: 15_625 });
    expect(tax(v, 'stcg-111a')).toMatchObject({ taxableGain: 15_000, rate: 0.2, tax: 3_000 });
    expect(v.taxBeforeCess).toBe(18_625);
    expect(v.cess).toBeCloseTo(745, 9); // 4%
    expect(v.totalTax).toBeCloseTo(19_370, 9);
  });

  it('exemption already used elsewhere reduces what is left', () => {
    const { value: v } = run({ ...twoLots, other112ALtcgAlreadyRealised: 100_000 });
    expect(v.exemption112A.available).toBe(25_000);
    expect(tax(v, 'ltcg-112a')!.tax).toBe(28_125); // (2,50,000 − 25,000) × 12.5%
    expect(v.totalTax).toBeCloseTo((28_125 + 3_000) * 1.04, 9);
  });

  it('FIFO does not depend on the order in which lots are entered', () => {
    const reversed = run({ ...twoLots, lots: [...twoLots.lots].reverse() }).value;
    expect(reversed.totalTax).toBeCloseTo(run(twoLots).value.totalTax, 9);
    expect(reversed.slices[0]!.purchaseDate).toBe('2023-04-03');
  });

  it('reproduces the Income Tax Department grandfathering illustration (cost = higher of actual and lower of FMV, sale)', () => {
    // Bought 100 @ 2,000 in July 2017; FMV 31-1-2018 = 3,800; sold @ 5,200 after 23-07-2024.
    // Cost = max(2,000, min(3,800, 5,200)) = 3,800 → LTCG 1,40,000 → taxable 15,000 @ 12.5% = 1,875.
    const { value: v } = run({
      fy: '2025-26',
      fundType: 'equity-oriented',
      lots: [{ purchaseDate: '2017-07-10', units: 100, navPerUnit: 2_000, fmvPerUnitOn20180131: 3_800 }],
      redemption: { date: '2025-08-01', units: 100, navPerUnit: 5_200 },
    });
    expect(v.slices[0]).toMatchObject({ grandfathered: true, costPerUnitUsed: 3_800, gain: 140_000 });
    expect(tax(v, 'ltcg-112a')).toMatchObject({ taxableGain: 15_000, tax: 1_875 });
    expect(v.totalTax).toBeCloseTo(1_950, 9);
  });

  it.each([
    [14, 18, 26, 18], // FMV between cost and sale → FMV
    [14, 30, 26, 26], // FMV above sale → sale value (gain 0)
    [20, 18, 26, 20], // actual cost above FMV → actual cost
  ])('grandfathered cost: actual %d, FMV %d, sale %d → %d', (actual, fmv, sale, expected) => {
    const { value: v } = run({
      fy: '2025-26',
      fundType: 'equity-oriented',
      lots: [{ purchaseDate: '2016-01-15', units: 100, navPerUnit: actual, fmvPerUnitOn20180131: fmv }],
      redemption: { date: '2025-08-01', units: 100, navPerUnit: sale },
    });
    expect(v.slices[0]!.costPerUnitUsed).toBe(expected);
  });

  it('fails rather than approximate when the 31 January 2018 value is missing', () => {
    const e = failure({ fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2016-01-15', units: 1, navPerUnit: 10 }], redemption: { date: '2025-08-01', units: 1, navPerUnit: 20 } });
    expect(e).toMatchObject({ code: 'INVALID_INPUT', field: 'lots.0.fmvPerUnitOn20180131' });
  });

  it('holding period: exactly 12 months is short-term, one more day is long-term', () => {
    const base = { fy: '2025-26', fundType: 'equity-oriented' as const, lots: [{ purchaseDate: '2024-09-15', units: 10, navPerUnit: 100 }] };
    expect(run({ ...base, redemption: { date: '2025-09-15', units: 10, navPerUnit: 110 } }).value.slices[0]!.term).toBe('short');
    expect(run({ ...base, redemption: { date: '2025-09-16', units: 10, navPerUnit: 110 } }).value.slices[0]!.term).toBe('long');
    expect(heldMoreThanMonths('2024-02-29', '2026-02-28', 24)).toBe(false); // 29 Feb + 24 months → 28 Feb 2026
    expect(heldMoreThanMonths('2024-02-29', '2026-03-01', 24)).toBe(true);
  });

  it('a short-term loss is taxed at zero with a warning', () => {
    const r = run({ fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2025-05-01', units: 100, navPerUnit: 50 }], redemption: { date: '2025-08-01', units: 100, navPerUnit: 40 } });
    expect(tax(r.value, 'stcg-111a')).toMatchObject({ netGain: -1_000, taxableGain: 0, tax: 0 });
    expect(r.value.totalTax).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/set-off against other gains and carry-forward are not modelled/);
  });

  it('warns about the ELSS lock-in but does not validate it', () => {
    const r = run({ fy: '2025-26', fundType: 'equity-oriented', isElss: true, lots: [{ purchaseDate: '2024-01-10', units: 10, navPerUnit: 100 }], redemption: { date: '2025-08-01', units: 10, navPerUnit: 120 } });
    expect(r.warnings.join(' ')).toMatch(/locked in for three years/);
  });

  it('accepts a total cost instead of a NAV', () => {
    const { value: v } = run({ fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2025-05-01', units: 1_000, totalCost: 10_050 }], redemption: { date: '2025-08-01', units: 1_000, navPerUnit: 12 } });
    expect(v.slices[0]!.actualCostPerUnit).toBeCloseTo(10.05, 12);
    expect(v.totals.gain).toBeCloseTo(1_950, 9);
  });
});

describe('specified mutual funds (s.50AA) and other funds', () => {
  it('specified fund bought on/after 1 April 2023: deemed short-term at the slab rate, even after 2+ years', () => {
    const { value: v } = run({ fy: '2025-26', fundType: 'specified', lots: [{ purchaseDate: '2023-05-02', units: 1_000, navPerUnit: 10 }], redemption: { date: '2025-10-01', units: 1_000, navPerUnit: 13 }, marginalSlabRatePct: 30 });
    expect(v.slices[0]).toMatchObject({ term: 'short', treatment: 'stcg-50aa-slab', gain: 3_000 });
    expect(v.taxBeforeCess).toBeCloseTo(900, 9);
    expect(v.totalTax).toBeCloseTo(936, 9);
  });

  it('specified fund bought before 1 April 2023 follows the rules for other funds', () => {
    const r = run({ fy: '2025-26', fundType: 'specified', lots: [{ purchaseDate: '2023-03-15', units: 1_000, navPerUnit: 10 }], redemption: { date: '2025-10-01', units: 1_000, navPerUnit: 13 } });
    expect(r.value.slices[0]).toMatchObject({ term: 'long', treatment: 'ltcg-112' });
    expect(r.value.taxBeforeCess).toBeCloseTo(375, 9); // 3,000 × 12.5%, no indexation
    expect(r.warnings.join(' ')).toMatch(/before 1 April 2023/);
  });

  it('other fund: 24-month boundary decides slab-rate STCG or 12.5% LTCG', () => {
    const lot = (d: string) => ({ fy: '2025-26', fundType: 'other' as const, lots: [{ purchaseDate: d, units: 500, navPerUnit: 100 }], redemption: { date: '2025-12-01', units: 500, navPerUnit: 120 }, marginalSlabRatePct: 20 });
    const short = run(lot('2024-01-10')).value;
    expect(short.slices[0]!.treatment).toBe('stcg-slab');
    expect(short.totalTax).toBeCloseTo(2_080, 9); // 10,000 × 20% × 1.04
    const long = run(lot('2023-06-01')).value;
    expect(long.slices[0]!.treatment).toBe('ltcg-112');
    expect(long.totalTax).toBeCloseTo(1_300, 9); // 10,000 × 12.5% × 1.04
  });

  it('asks for the slab rate only when a slab-taxed gain exists', () => {
    const base = { fy: '2025-26', fundType: 'other' as const, lots: [{ purchaseDate: '2025-01-10', units: 10, navPerUnit: 100 }] };
    expect(failure({ ...base, redemption: { date: '2025-12-01', units: 10, navPerUnit: 120 } })).toMatchObject({ code: 'INVALID_INPUT', field: 'marginalSlabRatePct' });
    expect(run({ ...base, redemption: { date: '2025-12-01', units: 10, navPerUnit: 90 } }).value.totalTax).toBe(0); // a loss needs no rate
    expect(estimateCapitalGains({ ...base, redemption: { date: '2025-12-01', units: 10, navPerUnit: 120 }, marginalSlabRatePct: 12 }).ok).toBe(false);
  });
});

describe('disabled paths and invalid input', () => {
  const ok: CapitalGainsInput = { fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2025-05-01', units: 10, navPerUnit: 10 }], redemption: { date: '2025-08-01', units: 10, navPerUnit: 11 } };

  it('FY 2026-27 is unverified and disabled; unknown years are unsupported', () => {
    expect(failure({ ...ok, fy: '2026-27', redemption: { ...ok.redemption, date: '2026-05-01' } }).code).toBe('UNVERIFIED_RULES');
    expect(failure({ ...ok, fy: '2024-25' }).code).toBe('UNSUPPORTED');
  });

  it('exchange-listed non-equity units are not estimated (rule not verified)', () => {
    const e = failure({ ...ok, fundType: 'other', listedOnExchange: true, marginalSlabRatePct: 30 });
    expect(e.code).toBe('UNVERIFIED_RULES');
    expect(e.message).toMatch(/could not be confirmed/);
  });

  it.each([
    [{ redemption: { date: '2026-04-01', units: 10, navPerUnit: 11 } }, 'redemption.date'],
    [{ redemption: { date: '2025-08-01', units: 11, navPerUnit: 11 } }, 'redemption.units'],
    [{ lots: [{ purchaseDate: '2025-09-01', units: 10, navPerUnit: 10 }] }, 'lots.0.purchaseDate'],
    [{ lots: [{ purchaseDate: '2025-05-01', units: 10, navPerUnit: 10, totalCost: 100 }] }, 'lots.0.navPerUnit'],
    [{ lots: [{ purchaseDate: '2025-05-01', units: 10 }] }, 'lots.0.navPerUnit'],
    [{ lots: [] }, 'lots'],
    [{ fundType: 'debt' }, 'fundType'],
  ])('rejects %j', (patch, field) => {
    expect(failure({ ...ok, ...patch } as CapitalGainsInput)).toMatchObject({ code: 'INVALID_INPUT', field });
  });
});

describe('provenance, notice and report', () => {
  it('every rule used names a primary source and a verification date', () => {
    for (const fundType of ['equity-oriented', 'specified', 'other'] as const) {
      const { value: v } = run({ fy: '2025-26', fundType, lots: [{ purchaseDate: '2025-05-01', units: 10, navPerUnit: 10 }], redemption: { date: '2025-08-01', units: 10, navPerUnit: 9 } });
      expect(v.rules.length).toBeGreaterThan(2);
      for (const r of v.rules) {
        expect(r.sources.length).toBeGreaterThan(0);
        for (const s of r.sources) {
          expect(s.url).toMatch(/^https:\/\/www\.(incometaxindia|incometax)\.gov\.in\//);
          expect(s.verifiedOn).toBe('2026-10-17');
        }
      }
    }
    expect(CAPITAL_GAINS_YEARS['2025-26']!.exclusions.join(' ')).toMatch(/Surcharge/);
  });

  it('the notice is attached and states that this is not tax advice', () => {
    const r = run({ fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2025-05-01', units: 10, navPerUnit: 10 }], redemption: { date: '2025-08-01', units: 10, navPerUnit: 11 } });
    expect(r.value.notice).toBe(CAPITAL_GAINS_NOTICE);
    expect(r.warnings[0]).toBe(CAPITAL_GAINS_NOTICE);
    expect(CAPITAL_GAINS_NOTICE).toMatch(/not tax advice/);
  });

  it('report payload carries engine values, sources and the FIFO convention', () => {
    const input: CapitalGainsInput = { fy: '2025-26', fundType: 'equity-oriented', lots: [{ purchaseDate: '2023-04-03', units: 10_000, navPerUnit: 20 }], redemption: { date: '2025-09-15', units: 10_000, navPerUnit: 45 } };
    const res = run(input).value;
    const rep = buildCapitalGainsReport(input, res, { generatedAt: '2026-10-17T10:00:00.000Z', schemeName: 'Example Fund' });
    expect(rep.summary.find(([k]) => k === 'Estimated total tax (₹)')?.[1]).toBe(res.totalTax);
    expect(rep.conventions.find(([k]) => k === 'Lot matching')?.[1]).toMatch(/FIFO/);
    expect(rep.conventions.some(([k, v]) => k.startsWith('Rule ltcg-112a') && v.includes('incometaxindia.gov.in'))).toBe(true);
    expect(reportToCsv(rep)).toContain('Cess at 4% (₹)');
  });
});

describe('income-tax comparison exposes the cess rate (0.4.0)', () => {
  it('returns the configured cessRate', () => {
    const r = compareIncomeTax({ fy: '2025-26', salaryIncome: 1_500_000 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.config.cessRate).toBe(0.04);
    expect(r.value.new.cess).toBeCloseTo(r.value.new.taxAfterRebate * r.value.config.cessRate, 9);
  });
});
