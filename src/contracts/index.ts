/**
 * Shared contract between Agent 1 (website) and Agent 2 (finance & data).
 *
 * The UI, API routes, charts, and exports import financial types and engines ONLY through this module.
 * Changing anything exported here requires a documented change in docs/CONTRACTS.md, a notice to the
 * other agent, and updated tests on both sides. Version: 0.5.0 (additive, 2026-10-19; baseline 0.1.0).
 */
export const CONTRACT_VERSION = '0.5.0';

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
// 0.2.0: chunked, cancellable Monte Carlo for a Web Worker (identical results to runMonteCarlo).
export { runMonteCarloChunked, createMonteCarloSession } from '@/lib/finance/monteCarlo';
export type { MonteCarloRunOptions, MonteCarloSession } from '@/lib/finance/monteCarlo';
export { xirr } from '@/lib/finance/xirr';
export type { DatedCashFlow, XirrResult } from '@/lib/finance/xirr';
export { compareIncomeTax, incomeTaxInputSchema } from '@/lib/finance/tax/incomeTax';
export type { IncomeTaxInput, IncomeTaxComparison, RegimeEstimate } from '@/lib/finance/tax/incomeTax';
export { SUPPORTED_TAX_YEARS, TAX_YEARS } from '@/lib/finance/tax/config';
// 0.4.0: capital-gains estimate on mutual-fund redemptions (separate from income tax; show CAPITAL_GAINS_NOTICE).
export {
  estimateCapitalGains,
  capitalGainsInputSchema,
  heldMoreThanMonths,
  CAPITAL_GAINS_NOTICE,
  FUND_TYPES,
  FUND_TYPE_EXPLANATIONS,
  SLAB_RATES_PCT,
  TREATMENT_LABELS,
} from '@/lib/finance/tax/capitalGains';
export type { CapitalGainsInput, CapitalGainsResult, FundType, GainTreatment, LotSlice, TreatmentTotal } from '@/lib/finance/tax/capitalGains';
export { CAPITAL_GAINS_YEARS, SUPPORTED_CAPITAL_GAINS_YEARS } from '@/lib/finance/tax/capitalGainsConfig';
export type { CapitalGainsYearConfig, CapitalGainsRule, RuleSource } from '@/lib/finance/tax/capitalGainsConfig';

// ── 0.2.0 planning engines ───────────────────────────────────────────────────
export { planCashFlow, cashFlowInputSchema } from '@/lib/finance/cashflow';
export type { CashFlowInput, CashFlowResult } from '@/lib/finance/cashflow';
export { compareScenarios, MAX_SCENARIOS } from '@/lib/finance/scenarios';
export type { ScenarioComparisonInput, ScenarioComparisonResult, ScenarioOutcome } from '@/lib/finance/scenarios';
export { planRetirement, retirementInputSchema } from '@/lib/finance/retirement';
export type { RetirementInput, RetirementResult } from '@/lib/finance/retirement';
export { exploreAllocation, allocationInputSchema, DEFAULT_ALLOCATION_ASSUMPTIONS, ALLOCATION_NOTICE } from '@/lib/finance/allocation';
export type { AllocationInput, AllocationResult, AllocationStep } from '@/lib/finance/allocation';

// ── 0.3.0 Life-stage & Risk Planner (educational; show LIFE_STAGE_NOTICE with every result) ──
export { planLifeStageRisk, lifeStageInputSchema, deriveRange, LIFE_STAGE_NOTICE } from '@/lib/finance/lifeStage';
export type {
  LifeStageInput,
  LifeStageResult,
  FactorScore,
  ScoreBreakdown,
  AssetRange,
  PctRange,
  PrerequisiteFlag,
  PrerequisiteId,
  GlidePathRow,
} from '@/lib/finance/lifeStage';
export {
  LIFE_STAGE_CONFIG,
  lifeStageConfigSchema,
  PROFILE_IDS,
  PROFILE_LABELS,
  INCOME_STABILITY,
  EXPERIENCE,
  LOSS_REACTION,
  PFRDA_AUTO_CHOICE_REFERENCE,
} from '@/lib/finance/lifeStageConfig';
export type { LifeStageConfig, ProfileId } from '@/lib/finance/lifeStageConfig';
export { stressTestRange } from '@/lib/finance/lifeStageStress';
export type { StressSeriesInput, StressTestResult, StressMix } from '@/lib/finance/lifeStageStress';

// ── Historical analysis on observed NAVs ─────────────────────────────────────
export type { NavPoint } from '@/lib/finance/navSeries';
export { backtestSipOnNav, navBacktestInputSchema } from '@/lib/finance/navBacktest';
export type { NavBacktestInput, NavBacktestResult, BacktestRow, SkippedInstalment } from '@/lib/finance/navBacktest';
export { rollingReturns } from '@/lib/finance/rolling';
export type { RollingResult, RollingWindow } from '@/lib/finance/rolling';
export { compareBooster, boosterInputSchema } from '@/lib/finance/booster';
export type { BoosterInput, BoosterResult, StrategyOutcome } from '@/lib/finance/booster';
// 0.2.1: plan/option eligibility re-exported client-side (pure; type-only import of the adapter), so browser
// screens that already hold a scheme's history refuse IDCW/unknown options exactly as the server does.
export { checkBacktestEligibility, backtestScheme, rollingReturnsForScheme } from '@/lib/data/eligibility';
export type { SchemeMeta, SchemeNavHistory } from '@/lib/data/mfapi';

// ── Data provenance & freshness ──────────────────────────────────────────────
export type { Provenance, DataClassification, FreshnessState, DatasetState, FetchAttempt } from '@/lib/data/provenance';
export { applyFetchAttempt, navFreshness } from '@/lib/data/provenance';

// ── Canonical report payload (Agent 2 fills; Agent 1 renders/delivers) ───────
export type { Report, ReportTable } from '@/lib/export/report';
export { BRAND, ATTRIBUTION, DISCLAIMER } from '@/lib/export/report';
// 0.2.1: file renderers re-exported so exports import only from '@/contracts' (no logic change).
export { reportToCsv, reportToXlsx } from '@/lib/export/report';
// 0.2.0: one builder per calculator; exports never recalculate in the UI.
export {
  buildAccumulationReport,
  buildGoalReport,
  buildSwpReport,
  buildMonteCarloReport,
  buildNavBacktestReport,
  buildRollingReport,
  buildBoosterReport,
  buildIncomeTaxReport,
  buildCashFlowReport,
  buildScenarioReport,
  buildRetirementReport,
  buildAllocationReport,
  buildLifeStageReport,
  buildCapitalGainsReport,
} from '@/lib/export/reportBuilders';
export type { ReportContext } from '@/lib/export/reportBuilders';

// ── Automation run report (Agent 2 produces; Agent 1's admin UI displays) ────
export type AutomationRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'skipped-duplicate'
  /** 0.2.0: the kill switch was on; nothing was fetched or written. */
  | 'skipped-disabled';

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

// Server-only data services and the automation task are exported from '@/contracts/server' (0.2.0).

// ── 0.5.0: field-level provenance (research-platform upgrade, 2026-10-19) ───
export { availableField, unavailableField, assertSamePlan } from '@/lib/data/fields';
export type { ProvenancedField, FieldStatus, FieldScope, FieldUnit, UsageStatus, ValidationStatus, FieldContext } from '@/lib/data/fields';
export type { SchemeIdentity } from '@/lib/data/identity';
export { datasetTimestamps } from '@/lib/data/provenance';
export type { DatasetTimestamps } from '@/lib/data/provenance';
