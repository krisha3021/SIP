/**
 * Shared contract between Agent 1 (website) and Agent 2 (finance & data).
 *
 * The UI, API routes, charts, and exports import financial types and engines ONLY through this module.
 * Changing anything exported here requires a documented change in docs/CONTRACTS.md, a notice to the
 * other agent, and updated tests on both sides. Version: 0.1.0 (baseline, 2026-10-17).
 */
export const CONTRACT_VERSION = '0.1.0';

// ── Result envelope and conventions ──────────────────────────────────────────
export type { CalcResult, CalcError, CalcErrorCode, ContributionTiming, RateConvention } from '@/lib/finance/types';

// ── Calculator engines (inputs validated inside; never throw on bad user input) ──
export { projectAccumulation, accumulationInputSchema } from '@/lib/finance/sip';
export type { AccumulationInput, AccumulationResult, AccumulationRow, AccumulationSummary, StepUp } from '@/lib/finance/sip';
export { planGoal, goalInputSchema } from '@/lib/finance/goal';
export type { GoalInput, GoalResult } from '@/lib/finance/goal';
export { simulateSwp, swpInputSchema } from '@/lib/finance/swp';
export type { SwpInput, SwpResult, SwpRow } from '@/lib/finance/swp';
export { runMonteCarlo, monteCarloInputSchema, MAX_SIMULATIONS } from '@/lib/finance/monteCarlo';
export type { MonteCarloInput, MonteCarloResult, PercentileBand } from '@/lib/finance/monteCarlo';
export { xirr } from '@/lib/finance/xirr';
export type { DatedCashFlow, XirrResult } from '@/lib/finance/xirr';
export { compareIncomeTax, incomeTaxInputSchema } from '@/lib/finance/tax/incomeTax';
export type { IncomeTaxInput, IncomeTaxComparison, RegimeEstimate } from '@/lib/finance/tax/incomeTax';
export { SUPPORTED_TAX_YEARS, TAX_YEARS } from '@/lib/finance/tax/config';

// ── Historical analysis on observed NAVs ─────────────────────────────────────
export type { NavPoint } from '@/lib/finance/navSeries';
export { backtestSipOnNav, navBacktestInputSchema } from '@/lib/finance/navBacktest';
export type { NavBacktestInput, NavBacktestResult, BacktestRow, SkippedInstalment } from '@/lib/finance/navBacktest';
export { rollingReturns } from '@/lib/finance/rolling';
export type { RollingResult, RollingWindow } from '@/lib/finance/rolling';
export { compareBooster, boosterInputSchema } from '@/lib/finance/booster';
export type { BoosterInput, BoosterResult, StrategyOutcome } from '@/lib/finance/booster';

// ── Data provenance & freshness ──────────────────────────────────────────────
export type { Provenance, DataClassification, FreshnessState, DatasetState, FetchAttempt } from '@/lib/data/provenance';
export { applyFetchAttempt, navFreshness } from '@/lib/data/provenance';

// ── Canonical report payload (Agent 2 fills; Agent 1 renders/delivers) ───────
export type { Report, ReportTable } from '@/lib/export/report';
export { BRAND, ATTRIBUTION, DISCLAIMER } from '@/lib/export/report';

// ── Automation run report (Agent 2 produces; Agent 1's admin UI displays) ────
export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'skipped-duplicate';

export interface DataQualityFinding {
  schemeCode: number;
  severity: 'info' | 'warning' | 'error';
  kind: 'stale' | 'missing' | 'duplicate' | 'suspicious-jump' | 'invalid-payload' | 'identity-mismatch' | 'upstream-error';
  /** ISO date of the affected observation, when applicable. */
  observationDate: string | null;
  message: string;
  /** True when the record was quarantined rather than accepted. */
  quarantined: boolean;
}

export interface AutomationRunReport {
  runId: string;
  task: 'validate-mf-data';
  status: AutomationRunStatus;
  trigger: 'schedule' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  schemesConfigured: number;
  schemesChecked: number;
  observationsAccepted: number;
  observationsQuarantined: number;
  findings: DataQualityFinding[];
  /** Per-scheme last observation date after this run. */
  freshness: Array<{ schemeCode: number; observedAt: string | null; state: import('@/lib/data/provenance').FreshnessState }>;
  /** Optional, generated FROM this structured report; never the source of truth. */
  aiSummary: { status: 'disabled' | 'skipped-budget' | 'failed' | 'ok'; text: string | null } | null;
  usage: { upstreamRequests: number; aiTokens: number };
}
