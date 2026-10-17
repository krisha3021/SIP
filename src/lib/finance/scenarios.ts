/**
 * Side-by-side comparison of up to three accumulation scenarios, returned as one payload.
 *
 * Every scenario runs through `projectAccumulation` unchanged. Differences are reported against the
 * first scenario (the baseline). When scenarios use different timing or rate conventions, the payload
 * carries a comparability warning, because part of the difference then comes from the convention.
 */
import { z } from 'zod';
import { accumulationInputSchema, projectAccumulation, type AccumulationInput, type AccumulationSummary } from './sip';
import { fail, ok, type CalcResult, type ContributionTiming, type RateConvention } from './types';

export const MAX_SCENARIOS = 3;

export const scenarioComparisonInputSchema = z.object({
  scenarios: z
    .array(z.object({ label: z.string().trim().min(1).max(60), input: z.unknown() }))
    .min(1, 'Add at least one scenario')
    .max(MAX_SCENARIOS, `Compare at most ${MAX_SCENARIOS} scenarios`),
});
export type ScenarioComparisonInput = { scenarios: Array<{ label: string; input: AccumulationInput }> };

export interface ScenarioOutcome {
  label: string;
  months: number;
  timing: ContributionTiming;
  rateConvention: RateConvention;
  summary: AccumulationSummary;
  warnings: string[];
  /** Differences from the baseline (scenario 1). All zero for the baseline itself. */
  vsBaseline: { finalValue: number; totalInvested: number; gains: number; realFinalValue: number };
}

export interface ScenarioComparisonResult {
  scenarios: ScenarioOutcome[];
  /** Year-end values aligned by year. A scenario's cell is null after its horizon ends. */
  yearly: Array<{ year: number; values: Array<number | null>; invested: Array<number | null> }>;
  /** Label of the scenario with the highest nominal final value (first one on ties). */
  highestFinalValue: string;
  conventionsDiffer: boolean;
  horizonsDiffer: boolean;
}

export function compareScenarios(input: ScenarioComparisonInput): CalcResult<ScenarioComparisonResult> {
  const shape = scenarioComparisonInputSchema.safeParse(input);
  if (!shape.success) {
    const issue = shape.error.issues[0];
    return fail('INVALID_INPUT', issue?.message ?? 'Invalid input', issue?.path.join('.') || undefined);
  }
  const labels = shape.data.scenarios.map((s) => s.label);
  if (new Set(labels).size !== labels.length) return fail('INVALID_INPUT', 'Scenario labels must be unique', 'scenarios');

  const runs: Array<Omit<ScenarioOutcome, 'vsBaseline'> & { yearly: Map<number, { value: number; invested: number }> }> = [];
  for (let i = 0; i < shape.data.scenarios.length; i++) {
    const s = shape.data.scenarios[i]!;
    const res = projectAccumulation(s.input as AccumulationInput);
    if (!res.ok) {
      return fail(res.error.code, `${s.label}: ${res.error.message}`, `scenarios.${i}.input${res.error.field ? `.${res.error.field}` : ''}`);
    }
    const resolved = accumulationInputSchema.parse(s.input);
    const yearly = new Map<number, { value: number; invested: number }>();
    for (const row of res.value.rows) {
      if (row.month % 12 === 0) yearly.set(row.month / 12, { value: row.value, invested: row.invested });
    }
    runs.push({
      label: s.label,
      months: resolved.months,
      timing: resolved.timing,
      rateConvention: resolved.rateConvention,
      summary: res.value.summary,
      warnings: res.warnings,
      yearly,
    });
  }

  const base = runs[0]!.summary;
  const scenarios: ScenarioOutcome[] = runs.map((r) => ({
    label: r.label,
    months: r.months,
    timing: r.timing,
    rateConvention: r.rateConvention,
    summary: r.summary,
    warnings: r.warnings,
    vsBaseline: {
      finalValue: r.summary.finalValue - base.finalValue,
      totalInvested: r.summary.totalInvested - base.totalInvested,
      gains: r.summary.gains - base.gains,
      realFinalValue: r.summary.realFinalValue - base.realFinalValue,
    },
  }));

  const maxYears = Math.floor(Math.max(...runs.map((r) => r.months)) / 12);
  const yearly: ScenarioComparisonResult['yearly'] = [];
  for (let y = 1; y <= maxYears; y++) {
    yearly.push({
      year: y,
      values: runs.map((r) => r.yearly.get(y)?.value ?? null),
      invested: runs.map((r) => r.yearly.get(y)?.invested ?? null),
    });
  }

  let best = scenarios[0]!;
  for (const s of scenarios) if (s.summary.finalValue > best.summary.finalValue) best = s;

  const conventionsDiffer =
    new Set(scenarios.map((s) => s.timing)).size > 1 || new Set(scenarios.map((s) => s.rateConvention)).size > 1;
  const horizonsDiffer = new Set(scenarios.map((s) => s.months)).size > 1;
  const warnings: string[] = [];
  if (conventionsDiffer) {
    warnings.push('The scenarios use different contribution timing or rate conventions, so part of the difference comes from the convention, not the plan.');
  }
  if (horizonsDiffer) warnings.push('The scenarios have different horizons; final values are compared at different dates.');

  return ok({ scenarios, yearly, highestFinalValue: best.label, conventionsDiffer, horizonsDiffer }, warnings);
}
