/**
 * Canonical Report payloads, one builder per calculator.
 *
 * Builders only arrange values that the engines already returned. They never recalculate a financial
 * quantity, so a CSV/XLSX/print export always matches the screen. Inputs are re-parsed with the
 * engine's schema only to show resolved defaults (e.g. timing 'end' when the user left it unset).
 *
 * Usage (Agent 1): `const r = projectAccumulation(input); if (r.ok) download(reportToCsv(
 *   buildAccumulationReport(input, r.value, { generatedAt: new Date().toISOString(), warnings: r.warnings })))`.
 */
import type { CellValue } from './sanitize';
import type { Report, ReportTable } from './report';
import { accumulationInputSchema, type AccumulationInput, type AccumulationResult } from '../finance/sip';
import { goalInputSchema, type GoalInput, type GoalResult } from '../finance/goal';
import { swpInputSchema, type SwpInput, type SwpResult } from '../finance/swp';
import { monteCarloInputSchema, type MonteCarloInput, type MonteCarloResult } from '../finance/monteCarlo';
import { navBacktestInputSchema, type NavBacktestInput, type NavBacktestResult } from '../finance/navBacktest';
import type { RollingResult } from '../finance/rolling';
import { boosterInputSchema, type BoosterInput, type BoosterResult } from '../finance/booster';
import { incomeTaxInputSchema, type IncomeTaxInput, type IncomeTaxComparison } from '../finance/tax/incomeTax';
import { cashFlowInputSchema, type CashFlowInput, type CashFlowResult } from '../finance/cashflow';
import type { ScenarioComparisonResult } from '../finance/scenarios';
import { retirementInputSchema, type RetirementInput, type RetirementResult } from '../finance/retirement';
import { allocationInputSchema, type AllocationInput, type AllocationResult } from '../finance/allocation';
import type { Provenance } from '../data/provenance';
import type { StepUp } from '../finance/sip';
import type { ContributionTiming, RateConvention } from '../finance/types';

export interface ReportContext {
  /** ISO timestamp; passed in so that builders stay deterministic. */
  generatedAt: string;
  /** Warnings from the engine result (`CalcResult.warnings`). */
  warnings?: string[];
}

const MONEY = '#,##0.00';
const PCT = '0.00';
const PROJECTION_LABEL = 'Projection (assumption-based)';

export const TIMING_TEXT: Record<ContributionTiming, string> = {
  begin: 'Beginning of each month (annuity due): each contribution earns that month’s return',
  end: 'End of each month (ordinary annuity): each contribution starts earning from the next month',
};
export const RATE_TEXT: Record<RateConvention, string> = {
  effective: 'Effective annual: monthly rate = (1 + annual)^(1/12) − 1',
  nominal: 'Nominal annual compounded monthly: monthly rate = annual / 12',
};

function stepUpText(s: StepUp): string {
  switch (s.mode) {
    case 'none':
      return 'None';
    case 'percent':
      return `${s.value}% each year, from month 13${s.maxMonthlyContribution !== undefined ? `, capped at ₹${s.maxMonthlyContribution}` : ''}`;
    case 'amount':
      return `₹${s.value} each year, from month 13${s.maxMonthlyContribution !== undefined ? `, capped at ₹${s.maxMonthlyContribution}` : ''}`;
  }
}

export function provenanceRows(p: Provenance): Array<[string, string]> {
  return [
    ['Provider', p.provider],
    ['Identifier', p.identifier],
    ['Data classification', p.classification],
    ['Latest observation date', p.observedAt ?? 'Not available'],
    ['Last successful fetch', p.fetchedAt ?? 'Not available'],
    ['Coverage', p.coverage ? `${p.coverage.from} to ${p.coverage.to} (${p.coverage.observations} observations)` : 'Not available'],
    ['Plan / option', `${p.plan} / ${p.option}`],
    ['Units', p.units],
    ...p.notes.map((n, i): [string, string] => [`Note ${i + 1}`, n]),
  ];
}

const base = (title: string, ctx: ReportContext, methodology: string) => ({
  title,
  generatedAt: ctx.generatedAt,
  methodology,
  ...(ctx.warnings?.length ? { warnings: [...ctx.warnings] } : {}),
});

// ── Accumulation (SIP / step-up / lumpsum / corpus + SIP) ────────────────────

export function buildAccumulationReport(input: AccumulationInput, result: AccumulationResult, ctx: ReportContext): Report {
  const v = accumulationInputSchema.parse(input);
  const s = result.summary;
  return {
    ...base('SIP and lumpsum projection', ctx, `${PROJECTION_LABEL}. Month-by-month compounding at a constant assumed return; see docs/CALCULATION-METHODOLOGY.md §Accumulation.`),
    assumptions: [
      ['Monthly contribution (₹)', v.monthlyContribution],
      ['Initial amount (₹)', v.initialCorpus],
      ['Assumed annual return (%)', v.annualReturnPct],
      ['Horizon (months)', v.months],
      ['Step-up', stepUpText(v.stepUp)],
      ['Inflation for real values (%)', v.inflationPct],
      ['Pauses', v.pauses.length ? v.pauses.map((p) => `months ${p.fromMonth}–${p.toMonth}`).join('; ') : 'None'],
      ['Top-ups', v.topUps.length ? v.topUps.map((t) => `month ${t.month}: ₹${t.amount}`).join('; ') : 'None'],
    ],
    conventions: [
      ['Contribution timing', TIMING_TEXT[v.timing]],
      ['Rate convention', RATE_TEXT[v.rateConvention]],
      ['Step-up timing', 'Applied at the start of each contribution year (months 13, 25, …)'],
      ['Real values', 'Deflated by (1 + inflation)^(months / 12)'],
    ],
    summary: [
      ['Total invested (₹)', s.totalInvested],
      ['Projected value (₹)', s.finalValue],
      ['Gains (₹)', s.gains],
      ["Projected value in today's rupees (₹)", s.realFinalValue],
      ['First monthly contribution (₹)', s.firstMonthlyContribution],
      ['Last monthly contribution (₹)', s.lastMonthlyContribution],
      ['Effective annual rate used (%)', s.effectiveAnnualRatePct],
    ],
    tables: [
      {
        name: 'Year by year',
        columns: [{ header: 'Month' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'Value (₹)', numFmt: MONEY }, { header: 'Gains (₹)', numFmt: MONEY }, { header: "Value in today's ₹", numFmt: MONEY }],
        rows: result.yearly.map((r) => [r.month, r.invested, r.value, r.gains, r.realValue]),
      },
    ],
  };
}

// ── Goal / reverse SIP ───────────────────────────────────────────────────────

export function buildGoalReport(input: GoalInput, result: GoalResult, ctx: ReportContext): Report {
  const v = goalInputSchema.parse(input);
  return {
    ...base('Goal planner (reverse SIP)', ctx, `${PROJECTION_LABEL}. The required contribution is solved so that the forward SIP engine reaches the target exactly.`),
    assumptions: [
      ['Target amount (₹)', v.targetAmount],
      ['Target stated in', v.targetIsInTodaysRupees ? "Today's rupees (inflated to the goal date)" : 'Future (nominal) rupees'],
      ['Horizon (months)', v.months],
      ['Assumed annual return (%)', v.annualReturnPct],
      ['Inflation (%)', v.inflationPct],
      ['Existing corpus (₹)', v.initialCorpus],
      ['Step-up', stepUpText(v.stepUp)],
      ['Current monthly contribution (₹)', v.currentMonthlyContribution],
    ],
    conventions: [
      ['Contribution timing', TIMING_TEXT[v.timing]],
      ['Rate convention', RATE_TEXT[v.rateConvention]],
    ],
    summary: [
      ['Target at the goal date (₹, nominal)', result.futureTarget],
      ['Existing corpus at the goal date (₹)', result.corpusFutureValue],
      ['Required starting monthly contribution (₹)', result.requiredMonthlyContribution],
      ['Already funded by the existing corpus', result.alreadyFunded ? 'Yes' : 'No'],
      ['Projected value with current contribution (₹)', result.projectedWithCurrent],
      ['Shortfall with current contribution (₹)', result.shortfallWithCurrent],
      ['Additional monthly contribution needed (₹)', result.additionalMonthlyNeeded],
    ],
    tables: [],
  };
}

// ── SWP ──────────────────────────────────────────────────────────────────────

const ORDER_TEXT = {
  'withdraw-then-grow': 'Withdrawal at the start of each month, then the balance earns that month’s return',
  'grow-then-withdraw': 'The balance earns that month’s return, then the withdrawal is taken at month end',
} as const;

export function buildSwpReport(input: SwpInput, result: SwpResult, ctx: ReportContext): Report {
  const v = swpInputSchema.parse(input);
  return {
    ...base('Systematic withdrawal plan', ctx, `${PROJECTION_LABEL}. Monthly ledger; the final month records the partial amount actually available.`),
    assumptions: [
      ['Starting corpus (₹)', v.corpus],
      ['First monthly withdrawal (₹)', v.monthlyWithdrawal],
      ['Yearly withdrawal increase (%)', v.annualIncreasePct],
      ['Assumed annual return (%)', v.annualReturnPct],
      ['Inflation for real values (%)', v.inflationPct],
      ['Horizon (months)', v.horizonMonths],
    ],
    conventions: [
      ['Withdrawal ordering', ORDER_TEXT[v.order]],
      ['Rate convention', RATE_TEXT[v.rateConvention]],
      ['Withdrawal increases', 'Applied once a year from month 13'],
    ],
    summary: [
      ['Initial withdrawal rate (% of corpus per year)', result.initialWithdrawalRatePct],
      ['Months fully funded', result.fullyFundedMonths],
      ['Depletion month', result.depletionMonth ?? 'Lasts the full horizon'],
      ['Final partial withdrawal (₹)', result.finalPartialWithdrawal ?? 'None'],
      ['Total withdrawn (₹)', result.totalWithdrawn],
      ['Remaining corpus (₹)', result.remainingCorpus],
      ["Remaining corpus in today's rupees (₹)", result.realRemainingCorpus],
    ],
    tables: [
      {
        name: 'Monthly ledger',
        columns: [{ header: 'Month' }, { header: 'Opening (₹)', numFmt: MONEY }, { header: 'Growth (₹)', numFmt: MONEY }, { header: 'Scheduled (₹)', numFmt: MONEY }, { header: 'Withdrawn (₹)', numFmt: MONEY }, { header: 'Closing (₹)', numFmt: MONEY }],
        rows: result.rows.map((r) => [r.month, r.openingBalance, r.growth, r.scheduledWithdrawal, r.actualWithdrawal, r.closingBalance]),
      },
    ],
  };
}

// ── Monte Carlo ──────────────────────────────────────────────────────────────

export function buildMonteCarloReport(input: MonteCarloInput, result: MonteCarloResult, ctx: ReportContext): Report {
  const v = monteCarloInputSchema.parse(input);
  return {
    ...base('Monte Carlo simulation', ctx, 'Synthetic simulation. Monthly log returns are i.i.d. Normal(μ/12, σ²/12) with μ = ln(1 + E) − σ²/2. Probabilities describe the model, not the market.'),
    assumptions: [
      ['Monthly contribution (₹)', v.monthlyContribution],
      ['Initial amount (₹)', v.initialCorpus],
      ['Years', v.years],
      ['Expected (arithmetic) annual return E (%)', v.expectedReturnPct],
      ['Annual volatility σ (%)', v.volatilityPct],
      ['Yearly step-up (%)', v.annualStepUpPct],
      ['Goal (₹)', v.goalAmount],
      ['Goal stated in', v.goalInTodaysRupees ? "Today's rupees" : 'Future rupees'],
      ['Inflation (%)', v.inflationPct],
      ['Simulations', result.simulations],
      ['Random seed', result.seed],
    ],
    conventions: [
      ['Contribution timing', TIMING_TEXT[v.timing]],
      ['Return model', 'Lognormal monthly growth; no fat tails, volatility clustering, fees or taxes'],
      ['Percentiles', 'Linear interpolation between order statistics (Hyndman–Fan type 7)'],
    ],
    summary: [
      ['Goal at horizon (₹, nominal)', result.goalNominal],
      ['Share of simulated paths reaching the goal (%)', result.goalSuccessRate * 100],
      ['10th percentile final value (₹)', result.terminal.p10],
      ['Median final value (₹)', result.terminal.p50],
      ['90th percentile final value (₹)', result.terminal.p90],
      ['Mean final value (₹)', result.terminal.mean],
      ['Total invested (₹)', result.totalInvested],
      ['Median annual return implied by the model (%)', result.model.medianAnnualReturnPct],
    ],
    tables: [
      {
        name: 'Percentile bands',
        columns: [{ header: 'Year' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'P10 (₹)', numFmt: MONEY }, { header: 'P25 (₹)', numFmt: MONEY }, { header: 'P50 (₹)', numFmt: MONEY }, { header: 'P75 (₹)', numFmt: MONEY }, { header: 'P90 (₹)', numFmt: MONEY }],
        rows: result.bands.map((b) => [b.year, b.invested, b.p10, b.p25, b.p50, b.p75, b.p90]),
      },
    ],
  };
}

// ── NAV backtest ─────────────────────────────────────────────────────────────

export function buildNavBacktestReport(
  input: NavBacktestInput,
  result: NavBacktestResult,
  provenance: Provenance,
  ctx: ReportContext & { schemeName: string },
): Report {
  const v = navBacktestInputSchema.parse(input);
  const x = result.xirr;
  return {
    ...base(`Historical SIP backtest — ${ctx.schemeName}`, ctx, 'Historical data. Instalments are allotted at the first observed NAV on or after the scheduled date. Past performance does not indicate future results.'),
    assumptions: [
      ['Instalment (₹)', v.amount],
      ['Frequency', v.frequency],
      ['SIP day of month', v.sipDay],
      ['Start date', v.startDate],
      ['End date', v.endDate],
      ['Yearly step-up (%)', v.annualStepUpPct],
      ['Initial investment (₹)', v.initialInvestment],
      ['Transaction cost (%)', v.transactionCostPct],
    ],
    conventions: [
      ['NAV allocation rule', `First NAV on or after the scheduled date, within ${v.maxLagDays} days; otherwise the instalment is skipped`],
      ['Valuation', `Last NAV on or before the end date (${result.valuationDate})`],
      ['Unit rounding', v.unitDecimals === null ? 'None' : `Rounded down to ${v.unitDecimals} decimals`],
      ['XIRR day count', 'Actual/365 Fixed from the first cash flow'],
      ['Drawdown', 'Measured on the NAV series, not on the contribution-inflated balance'],
    ],
    provenance: provenanceRows(provenance),
    summary: [
      ['Total invested (₹)', result.totalInvested],
      ['Final value (₹)', result.finalValue],
      ['Gain (₹)', result.gain],
      ['Absolute return (%)', result.absoluteReturnPct],
      ['XIRR (% per year)', x.ok ? x.value.rate * 100 : `Not available (${x.error.message})`],
      ['XIRR has more than one solution', x.ok ? (x.value.multipleRootsPossible ? 'Possibly' : 'No') : 'Not applicable'],
      ['Maximum NAV drawdown (%)', result.navMaxDrawdownPct ?? 'Not available'],
      ['Units held', result.totalUnits],
      ['Valuation NAV (₹)', result.valuationNav],
      ['Skipped instalments', result.skipped.length],
    ],
    tables: [
      {
        name: 'Instalments',
        columns: [{ header: 'Type' }, { header: 'Scheduled' }, { header: 'Allotted' }, { header: 'Lag (days)' }, { header: 'NAV (₹)' }, { header: 'Amount (₹)', numFmt: MONEY }, { header: 'Units' }, { header: 'Cumulative units' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'Value (₹)', numFmt: MONEY }],
        rows: result.rows.map((r) => [r.kind, r.scheduledDate, r.effectiveDate, r.lagDays, r.nav, r.amount, r.units, r.cumulativeUnits, r.cumulativeInvested, r.value]),
      },
      ...(result.skipped.length
        ? [{ name: 'Skipped', columns: [{ header: 'Scheduled' }, { header: 'Reason' }], rows: result.skipped.map((s): CellValue[] => [s.scheduledDate, s.reason]) }]
        : []),
    ],
  };
}

// ── Rolling returns ──────────────────────────────────────────────────────────

export function buildRollingReport(result: RollingResult, provenance: Provenance, ctx: ReportContext & { schemeName: string; toleranceDays?: number }): Report {
  return {
    ...base(`Rolling ${result.windowYears}-year returns — ${ctx.schemeName}`, ctx, 'Historical data. Point-to-point CAGR = (NAV_end / NAV_start)^(365 / days) − 1; windows without an observation near the end date are dropped, never interpolated.'),
    assumptions: [['Window (years)', result.windowYears]],
    conventions: [
      ['Window starts', 'First observation of each calendar month'],
      ['Window end', `Last observation on or before start + ${result.windowYears} years, within ${ctx.toleranceDays ?? 7} days`],
    ],
    provenance: provenanceRows(provenance),
    summary: [
      ['Windows', result.stats.count],
      ['Minimum CAGR (%)', result.stats.min],
      ['Median CAGR (%)', result.stats.median],
      ['Maximum CAGR (%)', result.stats.max],
      ['Share of windows with a positive return (%)', result.stats.positiveShare * 100],
    ],
    tables: [
      {
        name: 'Windows',
        columns: [{ header: 'Start' }, { header: 'End' }, { header: 'CAGR (%)', numFmt: PCT }],
        rows: result.windows.map((w) => [w.startDate, w.endDate, w.cagrPct]),
      },
    ],
  };
}

// ── Booster ──────────────────────────────────────────────────────────────────

export function buildBoosterReport(input: BoosterInput, result: BoosterResult, provenance: Provenance, ctx: ReportContext & { seriesName: string }): Report {
  const v = boosterInputSchema.parse(input);
  const synthetic = provenance.classification === 'synthetic';
  return {
    ...base(
      `Drawdown booster comparison — ${ctx.seriesName}`,
      ctx,
      `${synthetic ? 'Synthetic simulation' : 'Historical data'}. The comparable-capital baseline invests the booster's extra money evenly; it knows the total in advance, so it is an attribution device, not a strategy.`,
    ),
    assumptions: [
      ['Base SIP (₹)', v.baseAmount],
      ['SIP day', v.sipDay],
      ['Start date', v.startDate],
      ['End date', v.endDate],
      ['Rules', v.rules.map((r) => `${r.multiplier}× when ≥ ${r.drawdownPct}% below the running peak`).join('; ')],
    ],
    conventions: [
      ['Drawdown signal', 'NAV versus its running peak using observations up to the instalment date only (no look-ahead)'],
      ['NAV allocation rule', `First NAV on or after the scheduled date, within ${v.maxLagDays} days`],
    ],
    provenance: provenanceRows(provenance),
    summary: [
      ['Timing effect: booster − comparable-capital value (₹)', result.timingEffect],
      ['Total difference: booster − base value (₹)', result.totalDifferenceVsBase],
      ['Boosted instalments', result.boostedInstalments],
      ['Largest multiplier used', result.maxMultiplier],
    ],
    tables: [
      {
        name: 'Strategies',
        columns: [{ header: 'Strategy' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'Final value (₹)', numFmt: MONEY }, { header: 'Profit (₹)', numFmt: MONEY }, { header: 'XIRR (%)', numFmt: PCT }, { header: 'Extra capital vs base (₹)', numFmt: MONEY }],
        rows: result.strategies.map((s) => [s.name, s.totalInvested, s.finalValue, s.profit, s.xirrPct ?? 'Not available', s.additionalCapital]),
      },
      {
        name: 'Instalments',
        columns: [{ header: 'Scheduled' }, { header: 'Allotted' }, { header: 'NAV' }, { header: 'Drawdown (%)', numFmt: PCT }, { header: 'Multiplier' }],
        rows: result.instalments.map((i) => [i.scheduledDate, i.effectiveDate, i.nav, i.drawdownPct, i.multiplier]),
      },
    ],
  };
}

// ── Income tax ───────────────────────────────────────────────────────────────

export function buildIncomeTaxReport(input: IncomeTaxInput, result: IncomeTaxComparison, ctx: ReportContext): Report {
  const v = incomeTaxInputSchema.parse(input);
  const regimeRows = (k: keyof IncomeTaxComparison['new'] & string, label: string): CellValue[] => [label, result.new[k] as CellValue, result.old[k] as CellValue];
  return {
    ...base(`Income-tax regime comparison — FY ${result.fy}`, ctx, 'Educational estimate for resident individuals. Not tax advice. See the exclusions and sources below.'),
    assumptions: [
      ['Financial year', result.fy],
      ['Age band', v.ageBand],
      ['Salary income (₹)', v.salaryIncome],
      ['Other income (₹)', v.otherIncome],
      ['80C claimed (₹)', v.deductions.sec80C],
      ['80CCD(1B) claimed (₹)', v.deductions.sec80CCD1B],
      ['80D self/family claimed (₹)', v.deductions.sec80DSelf],
      ['80D parents claimed (₹)', v.deductions.sec80DParents],
      ['Parents are senior citizens', v.deductions.parentsSenior ? 'Yes' : 'No'],
    ],
    conventions: [
      ['Verification', result.config.verification],
      ...result.config.sources.map((s, i): [string, string] => [`Source ${i + 1}`, `${s.label}: ${s.url}`]),
      ...result.config.exclusions.map((e, i): [string, string] => [`Not modelled ${i + 1}`, e]),
    ],
    summary: [
      ['Lower-tax regime', result.lowerRegime],
      ['Difference (₹)', result.difference],
      ['New regime total tax (₹)', result.new.totalTax],
      ['Old regime total tax (₹)', result.old.totalTax],
    ],
    tables: [
      {
        name: 'Regime detail',
        columns: [{ header: 'Item' }, { header: 'New regime (₹)', numFmt: MONEY }, { header: 'Old regime (₹)', numFmt: MONEY }],
        rows: [
          regimeRows('grossIncome', 'Gross income'),
          regimeRows('standardDeduction', 'Standard deduction'),
          regimeRows('chapterVIA', 'Chapter VI-A deductions'),
          regimeRows('taxableIncome', 'Taxable income'),
          regimeRows('slabTax', 'Tax on slabs'),
          regimeRows('rebate', 'Rebate u/s 87A'),
          regimeRows('taxAfterRebate', 'Tax after rebate'),
          regimeRows('cess', 'Health and education cess'),
          regimeRows('totalTax', 'Total tax'),
        ],
      },
    ],
  };
}

// ── Cash flow ────────────────────────────────────────────────────────────────

export function buildCashFlowReport(input: CashFlowInput, result: CashFlowResult, ctx: ReportContext): Report {
  const v = cashFlowInputSchema.parse(input);
  const ef = result.emergencyFund;
  const tables: ReportTable[] = [];
  if (result.surplusProjection) {
    tables.push({
      name: 'Surplus projection',
      columns: [{ header: 'Month' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'Value (₹)', numFmt: MONEY }],
      rows: result.surplusProjection.yearly.map((r) => [r.month, r.invested, r.value]),
    });
  }
  return {
    ...base('Household cash-flow plan', ctx, 'Arithmetic on the amounts entered. No return is assumed unless a surplus projection was requested.'),
    assumptions: [
      ['Monthly take-home income (₹)', v.monthlyTakeHomeIncome],
      ['Other monthly income (₹)', v.otherMonthlyIncome],
      ['Essential expenses (₹)', v.essentialExpenses],
      ['Discretionary expenses (₹)', v.discretionaryExpenses],
      ['Loan EMIs (₹)', v.loanEmis],
      ['Existing monthly investments (₹)', v.existingMonthlyInvestments],
      ['Emergency fund: months', v.emergencyFundMonths],
      ['Emergency fund: basis', v.emergencyFundBasis === 'essential' ? 'Essential expenses + EMIs' : 'All expenses + EMIs'],
      ['Current emergency savings (₹)', v.currentEmergencySavings],
      ...(v.surplusProjection
        ? ([
            ['Surplus projection: return (%)', v.surplusProjection.annualReturnPct],
            ['Surplus projection: months', v.surplusProjection.months],
          ] as Array<[string, CellValue]>)
        : []),
    ],
    conventions: [
      ['Savings rate', '(existing investments + surplus) / income; a negative surplus lowers it'],
      ...(v.surplusProjection
        ? ([
            ['Contribution timing', TIMING_TEXT[v.surplusProjection.timing]],
            ['Rate convention', RATE_TEXT[v.surplusProjection.rateConvention]],
          ] as Array<[string, string]>)
        : []),
    ],
    summary: [
      ['Total income (₹)', result.totalIncome],
      ['Total expenses incl. EMIs (₹)', result.totalExpenses],
      ['Monthly surplus (₹)', result.surplus],
      ['Savings rate (%)', result.savingsRatePct ?? 'Not available'],
      ['EMIs as % of income', result.emiToIncomePct ?? 'Not available'],
      ['Emergency-fund target (₹)', ef.target],
      ['Emergency-fund gap (₹)', ef.gap],
      ['Months of expenses covered', ef.monthsCovered ?? 'Not available'],
      ['Months of surplus to close the gap', ef.monthsToCloseGapFromSurplus ?? 'Not available'],
      ...(result.surplusProjection ? ([['Projected value of surplus (₹)', result.surplusProjection.summary.finalValue]] as Array<[string, CellValue]>) : []),
    ],
    tables,
  };
}

// ── Scenario comparison ──────────────────────────────────────────────────────

export function buildScenarioReport(result: ScenarioComparisonResult, ctx: ReportContext): Report {
  return {
    ...base('Scenario comparison', ctx, `${PROJECTION_LABEL}. Each scenario runs through the same accumulation engine; differences are against scenario 1.`),
    assumptions: result.scenarios.map((s): [string, CellValue] => [s.label, `${s.months} months; ${s.timing} timing; ${s.rateConvention} rate`]),
    conventions: [['Comparability', result.conventionsDiffer ? 'Scenarios use different conventions' : 'All scenarios use the same conventions']],
    summary: [
      ['Highest projected value', result.highestFinalValue],
      ...result.scenarios.flatMap((s): Array<[string, CellValue]> => [
        [`${s.label}: projected value (₹)`, s.summary.finalValue],
        [`${s.label}: total invested (₹)`, s.summary.totalInvested],
        [`${s.label}: difference vs ${result.scenarios[0]!.label} (₹)`, s.vsBaseline.finalValue],
      ]),
    ],
    tables: [
      {
        name: 'Year by year',
        columns: [{ header: 'Year' }, ...result.scenarios.map((s) => ({ header: `${s.label} (₹)`, numFmt: MONEY }))],
        rows: result.yearly.map((y) => [y.year, ...y.values]),
      },
    ],
  };
}

// ── Retirement ───────────────────────────────────────────────────────────────

export function buildRetirementReport(input: RetirementInput, result: RetirementResult, ctx: ReportContext): Report {
  const v = retirementInputSchema.parse(input);
  return {
    ...base('Retirement plan', ctx, `${PROJECTION_LABEL}. Accumulation to retirement, then a monthly withdrawal ledger to the plan-until age.`),
    assumptions: [
      ['Current age', v.currentAge],
      ['Retirement age', v.retirementAge],
      ['Plan-until age', v.planUntilAge],
      ['Monthly contribution (₹)', v.monthlyContribution],
      ['Existing corpus (₹)', v.initialCorpus],
      ['Step-up', stepUpText(v.stepUp)],
      ['Return before retirement (%)', v.preRetirementReturnPct],
      ['Return after retirement (%)', v.postRetirementReturnPct],
      ['Inflation (%)', v.inflationPct],
      ["Desired monthly income (today's ₹)", v.desiredMonthlyIncomeToday],
      ['Yearly withdrawal increase (%)', result.withdrawalIncreasePct],
    ],
    conventions: [
      ['Contribution timing', TIMING_TEXT[v.timing]],
      ['Rate convention', RATE_TEXT[v.rateConvention]],
      ['Withdrawal ordering', ORDER_TEXT[v.withdrawalOrder]],
      ['Required corpus', 'Present value at retirement of all withdrawals, at the post-retirement rate'],
    ],
    summary: [
      ['Corpus at retirement (₹)', result.corpusAtRetirement],
      ['First monthly withdrawal (₹, nominal)', result.firstMonthlyWithdrawal],
      ['Required corpus (₹)', result.requiredCorpus],
      ['Surplus (+) or shortfall (−) (₹)', result.surplusOrShortfall],
      ['Money lasts until age', result.depletionAge === null ? `Beyond ${v.planUntilAge}` : Number(result.depletionAge.toFixed(2))],
      ['Additional monthly contribution needed (₹)', result.additionalMonthlyContributionNeeded],
      ['Total withdrawn (₹)', result.swp.totalWithdrawn],
    ],
    tables: [
      {
        name: 'Accumulation',
        columns: [{ header: 'Month' }, { header: 'Invested (₹)', numFmt: MONEY }, { header: 'Value (₹)', numFmt: MONEY }],
        rows: result.accumulation.yearly.map((r) => [r.month, r.invested, r.value]),
      },
      {
        name: 'Withdrawals',
        columns: [{ header: 'Month after retirement' }, { header: 'Withdrawn (₹)', numFmt: MONEY }, { header: 'Closing balance (₹)', numFmt: MONEY }, { header: 'Cumulative withdrawn (₹)', numFmt: MONEY }],
        rows: result.swp.yearly.map((r) => [r.month, r.actualWithdrawal, r.closingBalance, r.cumulativeWithdrawn]),
      },
    ],
  };
}

// ── Allocation Explorer ──────────────────────────────────────────────────────

export function buildAllocationReport(input: AllocationInput, result: AllocationResult, ctx: ReportContext): Report {
  const v = allocationInputSchema.parse(input);
  const a = result.assumptions;
  return {
    ...base('Allocation Explorer (educational)', ctx, result.notice),
    assumptions: [
      ['Age', v.age],
      ['Horizon (years)', v.horizonYears],
      ['Self-described comfort with volatility', v.selfDescribedRiskComfort],
      ['Age-rule constant', a.ageRuleConstant],
      ['Adjustments (cautious / balanced / comfortable)', `${a.riskAdjustmentPct.cautious} / ${a.riskAdjustmentPct.balanced} / ${a.riskAdjustmentPct.comfortable}`],
      ['Equity bounds (%)', `${a.minEquityPct}–${a.maxEquityPct}`],
      ['Short horizon rule', `Below ${a.shortHorizonYears} years, equity ≤ ${a.shortHorizonMaxEquityPct}%`],
      ['Gold (%)', a.goldPct],
      ...(v.expectedReturnsPct
        ? ([['Your return assumptions (equity / debt / gold, %)', `${v.expectedReturnsPct.equity} / ${v.expectedReturnsPct.debt} / ${v.expectedReturnsPct.gold}`]] as Array<[string, CellValue]>)
        : []),
    ],
    conventions: [['Nature', 'Rule of thumb, not advice and not a suitability assessment']],
    summary: [
      ['Equity (%)', result.equityPct],
      ['Debt (%)', result.debtPct],
      ['Gold (%)', result.goldPct],
      ['Blended return from your assumptions (%)', result.blendedExpectedReturnPct ?? 'Not calculated'],
      ...(result.rupeeSplit
        ? ([
            ['Equity amount (₹)', result.rupeeSplit.equity],
            ['Debt amount (₹)', result.rupeeSplit.debt],
            ['Gold amount (₹)', result.rupeeSplit.gold],
          ] as Array<[string, CellValue]>)
        : []),
    ],
    tables: [
      {
        name: 'How it was calculated',
        columns: [{ header: 'Step' }, { header: 'Equity after step (%)' }, { header: 'Explanation' }],
        rows: result.steps.map((s) => [s.step, s.equityPct, s.explanation]),
      },
    ],
  };
}
