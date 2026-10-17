/**
 * Interim Report assembly for calculator exports.
 *
 * These functions map engine output fields one-to-one into the shared `Report` shape. They perform
 * no arithmetic. Agent 2 owns report payload content (docs/CONTRACTS.md rule 7); when Agent 2 ships
 * report builders through `@/contracts`, these should be replaced by them. Listed as an open item.
 */
import type {
  AccumulationResult,
  GoalResult,
  IncomeTaxComparison,
  MonteCarloResult,
  NavBacktestResult,
  Provenance,
  Report,
  SwpResult,
} from '@/contracts';

const INR = '#,##0.00';
const PCT_LABEL = (n: number) => `${n}%`;

type Kv = Array<[string, string | number | boolean | null]>;

function base(title: string, assumptions: Kv, conventions: Array<[string, string]>, summary: Kv, methodology: string): Omit<Report, 'tables'> {
  return { title, generatedAt: new Date().toISOString(), assumptions, conventions, summary, methodology };
}

export const PROJECTION_NOTE = 'Projection (assumption-based). Results depend entirely on the stated assumptions.';

export function accumulationReport(
  title: string,
  assumptions: Kv,
  conventions: Array<[string, string]>,
  r: AccumulationResult,
  warnings: string[],
): Report {
  return {
    ...base(
      title,
      assumptions,
      conventions,
      [
        ['Classification', PROJECTION_NOTE],
        ['Total invested (₹)', r.summary.totalInvested],
        ['Projected value (₹)', r.summary.finalValue],
        ['Gain / loss (₹)', r.summary.gains],
        ["Projected value in today's rupees (₹)", r.summary.realFinalValue],
        ['First monthly contribution (₹)', r.summary.firstMonthlyContribution],
        ['Last monthly contribution (₹)', r.summary.lastMonthlyContribution],
        ['Effective annual rate used (%)', r.summary.effectiveAnnualRatePct],
        ...warnings.map((w, i): [string, string] => [`Warning ${i + 1}`, w]),
      ],
      'Month-by-month compounding with the stated timing and rate convention. See the Methodology page.',
    ),
    tables: [
      {
        name: 'Yearly',
        columns: [{ header: 'Month' }, { header: 'Invested (₹)', numFmt: INR }, { header: 'Value (₹)', numFmt: INR }, { header: 'Gain (₹)', numFmt: INR }, { header: "Value in today's ₹", numFmt: INR }],
        rows: r.yearly.map((y) => [y.month, y.invested, y.value, y.gains, y.realValue]),
      },
      {
        name: 'Monthly',
        columns: [
          { header: 'Month' },
          { header: 'Contribution (₹)', numFmt: INR },
          { header: 'Top-up (₹)', numFmt: INR },
          { header: 'Invested (₹)', numFmt: INR },
          { header: 'Value (₹)', numFmt: INR },
          { header: 'Gain (₹)', numFmt: INR },
          { header: "Value in today's ₹", numFmt: INR },
        ],
        rows: r.rows.map((m) => [m.month, m.contribution, m.topUp, m.invested, m.value, m.gains, m.realValue]),
      },
    ],
  };
}

export function goalReport(assumptions: Kv, conventions: Array<[string, string]>, g: GoalResult, path: AccumulationResult | null, warnings: string[]): Report {
  return {
    ...base(
      'Goal planner (reverse SIP)',
      assumptions,
      conventions,
      [
        ['Classification', PROJECTION_NOTE],
        ['Target at horizon, nominal (₹)', g.futureTarget],
        ['Existing corpus at horizon (₹)', g.corpusFutureValue],
        ['Required starting monthly contribution (₹)', g.requiredMonthlyContribution],
        ['Already funded by corpus', g.alreadyFunded],
        ['Projected value with current contribution (₹)', g.projectedWithCurrent],
        ['Shortfall with current contribution (₹)', g.shortfallWithCurrent],
        ['Additional monthly contribution needed (₹)', g.additionalMonthlyNeeded],
        ...warnings.map((w, i): [string, string] => [`Warning ${i + 1}`, w]),
      ],
      'Closed-form annuity factor (or bracketed bisection with a cap), using the same timing and rate convention as the SIP engine.',
    ),
    tables: path
      ? [
          {
            name: 'Path at required SIP',
            columns: [{ header: 'Month' }, { header: 'Invested (₹)', numFmt: INR }, { header: 'Value (₹)', numFmt: INR }, { header: "Value in today's ₹", numFmt: INR }],
            rows: path.yearly.map((y) => [y.month, y.invested, y.value, y.realValue]),
          },
        ]
      : [],
  };
}

export function swpReport(assumptions: Kv, conventions: Array<[string, string]>, s: SwpResult): Report {
  return {
    ...base(
      'SWP / retirement withdrawal',
      assumptions,
      conventions,
      [
        ['Classification', PROJECTION_NOTE],
        ['Total withdrawn (₹)', s.totalWithdrawn],
        ['Remaining corpus (₹)', s.remainingCorpus],
        ["Remaining corpus in today's rupees (₹)", s.realRemainingCorpus],
        ['Depletion month', s.depletionMonth ?? 'Not depleted within horizon'],
        ['Months fully funded', s.fullyFundedMonths],
        ['Final partial withdrawal (₹)', s.finalPartialWithdrawal],
        ['Initial withdrawal rate (% of corpus per year)', s.initialWithdrawalRatePct],
      ],
      'Monthly ledger. When the balance cannot cover a withdrawal, the partial amount actually paid is recorded and the plan ends.',
    ),
    tables: [
      {
        name: 'Monthly ledger',
        columns: [
          { header: 'Month' },
          { header: 'Opening (₹)', numFmt: INR },
          { header: 'Growth (₹)', numFmt: INR },
          { header: 'Scheduled (₹)', numFmt: INR },
          { header: 'Paid (₹)', numFmt: INR },
          { header: 'Closing (₹)', numFmt: INR },
          { header: 'Cumulative paid (₹)', numFmt: INR },
          { header: "Closing in today's ₹", numFmt: INR },
        ],
        rows: s.rows.map((r) => [r.month, r.openingBalance, r.growth, r.scheduledWithdrawal, r.actualWithdrawal, r.closingBalance, r.cumulativeWithdrawn, r.realClosingBalance]),
      },
    ],
  };
}

export function monteCarloReport(assumptions: Kv, conventions: Array<[string, string]>, m: MonteCarloResult): Report {
  return {
    ...base(
      'Monte Carlo goal simulator',
      assumptions,
      conventions,
      [
        ['Classification', 'Synthetic simulation (model output, not a forecast or guarantee)'],
        ['Simulations', m.simulations],
        ['Seed', m.seed],
        ['Goal at horizon, nominal (₹)', m.goalNominal],
        ['Share of simulated paths reaching the goal (0–1)', m.goalSuccessRate],
        ['Total invested (₹)', m.totalInvested],
        ['Terminal 10th percentile (₹)', m.terminal.p10],
        ['Terminal median (₹)', m.terminal.p50],
        ['Terminal 90th percentile (₹)', m.terminal.p90],
        ['Terminal mean (₹)', m.terminal.mean],
        ['Model median annual return (%)', m.model.medianAnnualReturnPct],
      ],
      'Monthly lognormal returns, i.i.d., calibrated so the expected annual growth equals the input. Ignores fat tails, volatility clustering, fees and taxes.',
    ),
    tables: [
      {
        name: 'Percentiles by year',
        columns: [
          { header: 'Year' },
          { header: 'Invested (₹)', numFmt: INR },
          { header: 'P10 (₹)', numFmt: INR },
          { header: 'P25 (₹)', numFmt: INR },
          { header: 'Median (₹)', numFmt: INR },
          { header: 'P75 (₹)', numFmt: INR },
          { header: 'P90 (₹)', numFmt: INR },
        ],
        rows: m.bands.map((b) => [b.year, b.invested, b.p10, b.p25, b.p50, b.p75, b.p90]),
      },
    ],
  };
}

export function taxReport(assumptions: Kv, t: IncomeTaxComparison): Report {
  const row = (label: string, k: keyof IncomeTaxComparison['new']) => [label, t.new[k], t.old[k]];
  return {
    ...base(
      `Income-tax regime comparison, FY ${t.fy}`,
      assumptions,
      [['Rules', `FY ${t.fy} configuration (${t.config.verification})`]],
      [
        ['Classification', 'Educational estimate under the stated rules and exclusions'],
        ['Lower-tax regime', t.lowerRegime],
        ['Difference (₹)', t.difference],
        ...t.config.exclusions.map((e, i): [string, string] => [`Not modelled ${i + 1}`, e]),
      ],
      'Slab tax, rebate (with marginal relief where configured) and 4% cess for resident individuals.',
    ),
    provenance: t.config.sources.map((s): [string, string] => [s.label, s.url]),
    tables: [
      {
        name: 'Regimes',
        columns: [{ header: 'Item' }, { header: 'New regime (₹)', numFmt: INR }, { header: 'Old regime (₹)', numFmt: INR }],
        rows: [
          row('Gross income', 'grossIncome'),
          row('Standard deduction', 'standardDeduction'),
          row('Chapter VI-A deductions', 'chapterVIA'),
          row('Taxable income', 'taxableIncome'),
          row('Slab tax', 'slabTax'),
          row('Rebate', 'rebate'),
          row('Tax after rebate', 'taxAfterRebate'),
          row('Cess', 'cess'),
          row('Total tax', 'totalTax'),
        ],
      },
    ],
  };
}

export function provenanceRows(p: Provenance): Array<[string, string]> {
  return [
    ['Provider', p.provider],
    ['Provider URL', p.providerUrl],
    ['Identifier', p.identifier],
    ['Plan / option', `${p.plan} / ${p.option}`],
    ['Latest observation date', p.observedAt ?? 'Not available'],
    ['Fetched at', p.fetchedAt ?? 'Not available'],
    ['Coverage', p.coverage ? `${p.coverage.from} to ${p.coverage.to} (${p.coverage.observations} observations)` : 'Not available'],
    ['Classification', p.classification],
    ['Units', p.units],
  ];
}

export function backtestReport(schemeName: string, assumptions: Kv, b: NavBacktestResult, provenance: Provenance): Report {
  return {
    ...base(
      `SIP backtest on observed NAVs — ${schemeName}`,
      assumptions,
      [
        ['Allotment rule', 'First observed NAV on or after the scheduled date, within the maximum lag; otherwise skipped'],
        ['Valuation', `Last observed NAV on or before the end date (${b.valuationDate})`],
        ['XIRR day count', 'ACT/365F'],
      ],
      [
        ['Classification', 'Historical data (observed NAVs). Past performance does not indicate future results.'],
        ['Total invested (₹)', b.totalInvested],
        ['Final value (₹)', b.finalValue],
        ['Gain / loss (₹)', b.gain],
        ['Absolute return (%)', b.absoluteReturnPct],
        ['XIRR (decimal)', b.xirr.ok ? b.xirr.value.rate : `Not available: ${b.xirr.error.message}`],
        ['NAV max drawdown in window (%)', b.navMaxDrawdownPct],
        ['Units held', b.totalUnits],
        ['Valuation NAV (₹)', b.valuationNav],
        ['Skipped instalments', b.skipped.length],
      ],
      'Next-available-NAV allotment on observed NAVs, valued at the last NAV on or before the end date. Drawdown is measured on the NAV, not the contribution-inflated balance.',
    ),
    provenance: provenanceRows(provenance),
    tables: [
      {
        name: 'Instalments',
        columns: [
          { header: 'Instalment' },
          { header: 'Scheduled' },
          { header: 'Allotted' },
          { header: 'Lag (days)' },
          { header: 'NAV (₹)', numFmt: '#,##0.0000' },
          { header: 'Amount (₹)', numFmt: INR },
          { header: 'Units', numFmt: '#,##0.0000' },
          { header: 'Cumulative units', numFmt: '#,##0.0000' },
          { header: 'Invested (₹)', numFmt: INR },
          { header: 'Value (₹)', numFmt: INR },
        ],
        rows: b.rows.map((r) => [r.instalment, r.scheduledDate, r.effectiveDate, r.lagDays, r.nav, r.amount, r.units, r.cumulativeUnits, r.cumulativeInvested, r.value]),
      },
      {
        name: 'Skipped',
        columns: [{ header: 'Scheduled date' }, { header: 'Reason' }],
        rows: b.skipped.map((s) => [s.scheduledDate, s.reason]),
      },
    ],
  };
}

export { PCT_LABEL };
