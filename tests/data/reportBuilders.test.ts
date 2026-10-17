import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { DISCLAIMER, reportToCsv, reportToXlsx, type Report } from '@/lib/export/report';
import {
  buildAccumulationReport,
  buildAllocationReport,
  buildBoosterReport,
  buildCashFlowReport,
  buildGoalReport,
  buildIncomeTaxReport,
  buildMonteCarloReport,
  buildNavBacktestReport,
  buildRetirementReport,
  buildRollingReport,
  buildScenarioReport,
  buildSwpReport,
} from '@/lib/export/reportBuilders';
import { projectAccumulation } from '@/lib/finance/sip';
import { planGoal } from '@/lib/finance/goal';
import { simulateSwp } from '@/lib/finance/swp';
import { runMonteCarlo } from '@/lib/finance/monteCarlo';
import { backtestSipOnNav } from '@/lib/finance/navBacktest';
import { rollingReturns } from '@/lib/finance/rolling';
import { compareBooster } from '@/lib/finance/booster';
import { compareIncomeTax } from '@/lib/finance/tax/incomeTax';
import { planCashFlow } from '@/lib/finance/cashflow';
import { compareScenarios } from '@/lib/finance/scenarios';
import { planRetirement } from '@/lib/finance/retirement';
import { exploreAllocation } from '@/lib/finance/allocation';
import { parseNavHistory } from '@/lib/data/mfapi';
import { businessDaySeries, mfapiHistoryFixture } from '../finance/fixtures';

const ctx = { generatedAt: '2026-10-17T10:00:00.000Z' };
const must = <T,>(r: { ok: true; value: T; warnings: string[] } | { ok: false; error: { message: string } }) => {
  if (!r.ok) throw new Error(r.error.message);
  return r;
};
const summaryValue = (rep: Report, label: string) => rep.summary.find(([k]) => k === label)?.[1];
const navs = businessDaySeries('2020-01-01', '2024-12-31', (_d, i) => 10 * (1 + 0.0004) ** i);
const prov = parseNavHistory(mfapiHistoryFixture, '2026-10-17T09:00:00.000Z').provenance;

describe('report builders carry engine values, not recalculations', () => {
  it('accumulation: summary equals the engine summary and conventions are explicit', () => {
    const input = { monthlyContribution: 10_000, annualReturnPct: 12, rateConvention: 'nominal' as const, months: 120 };
    const r = must(projectAccumulation(input));
    const rep = buildAccumulationReport(input, r.value, { ...ctx, warnings: ['example warning'] });
    expect(summaryValue(rep, 'Projected value (₹)')).toBe(r.value.summary.finalValue);
    expect(rep.conventions.map(([k]) => k)).toEqual(['Contribution timing', 'Rate convention', 'Step-up timing', 'Real values']);
    expect(rep.conventions[0]![1]).toMatch(/^End of each month/); // resolved default
    expect(rep.tables[0]!.rows).toHaveLength(10);
    expect(rep.warnings).toEqual(['example warning']);
    const csv = reportToCsv(rep);
    expect(csv).toContain('Warnings\r\nexample warning');
    expect(csv).toContain(DISCLAIMER);
  });

  it('every calculator has a builder producing a complete payload', () => {
    const goalIn = { targetAmount: 1_000_000, months: 120, annualReturnPct: 10 };
    const swpIn = { corpus: 1_000_000, monthlyWithdrawal: 10_000, annualReturnPct: 8, horizonMonths: 24 };
    const mcIn = { monthlyContribution: 5_000, years: 5, expectedReturnPct: 10, volatilityPct: 15, goalAmount: 400_000, simulations: 200 };
    const btIn = { amount: 1_000, startDate: '2020-02-01', endDate: '2024-12-31' };
    const boostIn = { baseAmount: 1_000, startDate: '2020-02-01', endDate: '2024-12-31', rules: [{ drawdownPct: 10, multiplier: 2 }] };
    const taxIn = { fy: '2025-26', salaryIncome: 1_500_000 };
    const cfIn = { monthlyTakeHomeIncome: 80_000, essentialExpenses: 40_000, emergencyFundMonths: 6, emergencyFundBasis: 'essential' as const };
    const retIn = { currentAge: 35, retirementAge: 60, planUntilAge: 85, monthlyContribution: 20_000, preRetirementReturnPct: 10, postRetirementReturnPct: 7, inflationPct: 6, desiredMonthlyIncomeToday: 50_000 };
    const allocIn = { age: 35, horizonYears: 20, selfDescribedRiskComfort: 'balanced' as const };

    const reports: Report[] = [
      buildGoalReport(goalIn, must(planGoal(goalIn)).value, ctx),
      buildSwpReport(swpIn, must(simulateSwp(swpIn)).value, ctx),
      buildMonteCarloReport(mcIn, must(runMonteCarlo(mcIn)).value, ctx),
      buildNavBacktestReport(btIn, must(backtestSipOnNav(navs, btIn)).value, prov, { ...ctx, schemeName: 'Example Fund' }),
      buildRollingReport(must(rollingReturns(navs, 1)).value, prov, { ...ctx, schemeName: 'Example Fund' }),
      buildBoosterReport(boostIn, must(compareBooster(navs, boostIn)).value, { ...prov, classification: 'synthetic' }, { ...ctx, seriesName: 'Synthetic path' }),
      buildIncomeTaxReport(taxIn, must(compareIncomeTax(taxIn)).value, ctx),
      buildCashFlowReport(cfIn, must(planCashFlow(cfIn)).value, ctx),
      buildScenarioReport(must(compareScenarios({ scenarios: [{ label: 'A', input: { monthlyContribution: 1_000, annualReturnPct: 8, months: 36 } }] })).value, ctx),
      buildRetirementReport(retIn, must(planRetirement(retIn)).value, ctx),
      buildAllocationReport(allocIn, must(exploreAllocation(allocIn)).value, ctx),
    ];
    for (const rep of reports) {
      expect(rep.generatedAt).toBe(ctx.generatedAt);
      expect(rep.title.length).toBeGreaterThan(0);
      expect(rep.methodology.length).toBeGreaterThan(0);
      expect(rep.assumptions.length).toBeGreaterThan(0);
      expect(rep.summary.length).toBeGreaterThan(0);
      expect(() => reportToCsv(rep)).not.toThrow();
    }
    const [, , mc, bt, , boost, tax, , , ret, alloc] = reports;
    expect(mc!.methodology).toMatch(/^Synthetic simulation/);
    expect(bt!.provenance?.find(([k]) => k === 'Latest observation date')?.[1]).toBe('2026-10-16');
    expect(boost!.methodology).toMatch(/^Synthetic simulation/);
    expect(tax!.conventions.some(([k, v]) => k.startsWith('Source') && v.includes('incometax.gov.in'))).toBe(true);
    expect(ret!.summary.find(([k]) => k === 'Required corpus (₹)')?.[1]).toBe(must(planRetirement(retIn)).value.requiredCorpus);
    expect(alloc!.methodology).toMatch(/not investment advice/);
  });

  it('user-entered labels are neutralised against formula injection in CSV and XLSX', async () => {
    const res = must(compareScenarios({ scenarios: [{ label: '=HYPERLINK("http://x")', input: { monthlyContribution: 1_000, annualReturnPct: 8, months: 24 } }] }));
    const rep = buildScenarioReport(res.value, ctx);
    expect(reportToCsv(rep)).not.toMatch(/(^|,)=HYPERLINK/m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await reportToXlsx(rep)).buffer as ArrayBuffer);
    const sheet = wb.getWorksheet('Summary')!;
    const texts: string[] = [];
    sheet.eachRow((row) => row.eachCell((c) => texts.push(String(c.value))));
    expect(texts.some((t) => t.startsWith('=HYPERLINK'))).toBe(false);
    expect(texts.some((t) => t.startsWith("'=HYPERLINK"))).toBe(true);
  });
});
