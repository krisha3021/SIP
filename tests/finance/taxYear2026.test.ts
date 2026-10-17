/**
 * FY 2026-27 income-tax config: verified against primary text but pending owner approval.
 * Expected values are the figures quoted in verificationEvidence (Income-tax Act, 2025 and Finance Act, 2026).
 */
import { describe, expect, it } from 'vitest';
import { TAX_YEARS } from '@/lib/finance/tax/config';
import { compareIncomeTax } from '@/lib/finance/tax/incomeTax';

const fy27 = TAX_YEARS['2026-27']!;
const fy26 = TAX_YEARS['2025-26']!;

describe('FY 2026-27 (tax year under the Income-tax Act, 2025)', () => {
  it('stays disabled until the owner approves', () => {
    expect(fy27.status).toBe('unverified');
    expect(fy27.pendingOwnerApproval).toBe(true);
    const r = compareIncomeTax({ fy: '2026-27', salaryIncome: 1_000_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNVERIFIED_RULES');
  });

  it('records primary-source evidence for every rule the calculator uses', () => {
    const refs = (fy27.verificationEvidence ?? []).map((e) => e.reference).join(' | ');
    for (const ref of ['s.202(1)', 's.156(1)', 's.156(2)', 's.19(1)', 's.123', 's.124(3)', 's.126', 'Part I-B Paragraph A', 'Paragraph F', 's.3(15)']) {
      expect(refs).toContain(ref);
    }
    for (const e of fy27.verificationEvidence ?? []) {
      expect(e.url).toMatch(/^https:\/\/(egazette\.gov\.in|www\.incometaxindia\.gov\.in)\//);
      expect(e.verifiedOn).toBe('2026-10-17');
    }
  });

  it('encodes the quoted values (unchanged from FY 2025-26)', () => {
    expect(fy27.regimes.new.slabs.below60.map((s) => [s.upTo, s.rate])).toEqual([
      [400_000, 0],
      [800_000, 0.05],
      [1_200_000, 0.1],
      [1_600_000, 0.15],
      [2_000_000, 0.2],
      [2_400_000, 0.25],
      [Infinity, 0.3],
    ]);
    expect(fy27.regimes.new.rebate).toEqual({ maxTaxableIncome: 1_200_000, maxRebate: 60_000, marginalRelief: true });
    expect(fy27.regimes.old.rebate).toEqual({ maxTaxableIncome: 500_000, maxRebate: 12_500, marginalRelief: false });
    expect([fy27.regimes.new.standardDeductionSalaried, fy27.regimes.old.standardDeductionSalaried]).toEqual([75_000, 50_000]);
    expect(fy27.limits).toEqual({ sec80C: 150_000, sec80CCD1B: 50_000, sec80DSelf: 25_000, sec80DSelfSenior: 50_000, sec80DParents: 25_000, sec80DParentsSenior: 50_000 });
    expect(fy27.regimes.old.slabs.above80.map((s) => s.upTo)).toEqual([500_000, 1_000_000, Infinity]);
    expect([fy27.cessRate, fy27.surchargeThreshold]).toEqual([0.04, 5_000_000]);
    expect(fy27.regimes).toEqual(fy26.regimes);
  });
});
