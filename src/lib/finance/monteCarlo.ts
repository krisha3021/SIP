/**
 * Monte Carlo SIP simulation with a monthly lognormal return model.
 *
 * Calibration (see CALCULATION-METHODOLOGY.md §Monte Carlo):
 *   Inputs E = expected (arithmetic) annual return, σ = annual volatility of log returns.
 *   Annual log-return drift μ = ln(1 + E) − σ²/2, so that E[annual growth factor] = 1 + E exactly.
 *   Monthly log return ~ Normal(μ/12, σ²/12), i.i.d. across months.
 *   The median annual growth factor is e^μ < 1 + E, which is why the median path is below the
 *   "expected-return" deterministic path when σ > 0.
 *
 * The model ignores fat tails, volatility clustering, mean reversion, regime changes, fees,
 * and taxes. Its probabilities describe the model, not the real world.
 */
import { z } from 'zod';
import { mulberry32, normalGenerator } from './random';
import { percentileSorted, mean } from './stats';
import { toFutureRupees } from './rates';
import { fail, ok, type CalcResult } from './types';
import { amountSchema, inflationPctSchema, parseInput, timingSchema } from './validation';

export const MAX_SIMULATIONS = 10_000;

export const monteCarloInputSchema = z.object({
  monthlyContribution: amountSchema,
  initialCorpus: amountSchema.default(0),
  years: z.number().int().min(1).max(60),
  expectedReturnPct: z.number().min(-20).max(30),
  volatilityPct: z.number().min(0).max(60),
  annualStepUpPct: z.number().min(0).max(50).default(0),
  timing: timingSchema.default('end'),
  /** Goal amount. Interpreted in today's rupees when `goalInTodaysRupees` is true. */
  goalAmount: amountSchema.refine((v) => v > 0, 'Goal must be greater than zero'),
  goalInTodaysRupees: z.boolean().default(true),
  inflationPct: inflationPctSchema.default(6),
  simulations: z.number().int().min(100).max(MAX_SIMULATIONS).default(2000),
  seed: z.number().int().min(0).max(2 ** 32 - 1).default(20240601),
});
export type MonteCarloInput = z.input<typeof monteCarloInputSchema>;

export interface PercentileBand {
  year: number;
  invested: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  bands: PercentileBand[];
  /** Nominal goal used for the success test. */
  goalNominal: number;
  /** Fraction of simulated paths (0–1) whose terminal value reached the goal. */
  goalSuccessRate: number;
  terminal: { p10: number; p50: number; p90: number; mean: number };
  totalInvested: number;
  simulations: number;
  seed: number;
  model: {
    monthlyLogDrift: number;
    monthlyLogVol: number;
    annualLogDrift: number;
    medianAnnualReturnPct: number;
  };
}

/**
 * A Monte Carlo run that can be advanced in chunks of paths. Paths are always simulated in the same
 * order from one seeded generator, so any chunking produces results identical to a single pass.
 */
export interface MonteCarloSession {
  readonly totalPaths: number;
  readonly completedPaths: number;
  /** Simulates up to `maxPaths` further paths; returns the number of paths completed in total. */
  step(maxPaths: number): number;
  /** Summarises the run. Fails with INVALID_INPUT if called before all paths are simulated. */
  finish(): CalcResult<MonteCarloResult>;
}

export function createMonteCarloSession(input: MonteCarloInput): CalcResult<MonteCarloSession> {
  const parsed = parseInput(monteCarloInputSchema, input);
  if (!parsed.ok) return parsed.result;
  const v = parsed.data;
  if (v.monthlyContribution === 0 && v.initialCorpus === 0) {
    return fail('INVALID_INPUT', 'Enter a contribution or an initial amount', 'monthlyContribution');
  }

  const sigma = v.volatilityPct / 100;
  const muAnnual = Math.log(1 + v.expectedReturnPct / 100) - (sigma * sigma) / 2;
  const muM = muAnnual / 12;
  const sigmaM = sigma / Math.sqrt(12);
  const months = v.years * 12;

  const normal = normalGenerator(mulberry32(v.seed));
  // byYear[y][s] = value of path s at end of year y (y = 0..years)
  const byYear: Float64Array[] = Array.from({ length: v.years + 1 }, () => new Float64Array(v.simulations));
  const investedByYear: number[] = new Array(v.years + 1).fill(0);
  const contributionByMonth = new Float64Array(months + 1);

  let investedTotal = v.initialCorpus;
  investedByYear[0] = investedTotal;
  for (let m = 1; m <= months; m++) {
    const c = v.monthlyContribution * Math.pow(1 + v.annualStepUpPct / 100, Math.floor((m - 1) / 12));
    contributionByMonth[m] = c;
    investedTotal += c;
    if (m % 12 === 0) investedByYear[m / 12] = investedTotal;
  }

  let done = 0;
  const simulatePath = (s: number) => {
    let value = v.initialCorpus;
    byYear[0]![s] = value;
    for (let m = 1; m <= months; m++) {
      const c = contributionByMonth[m]!;
      const growth = Math.exp(muM + sigmaM * normal());
      value = v.timing === 'begin' ? (value + c) * growth : value * growth + c;
      if (m % 12 === 0) byYear[m / 12]![s] = value;
    }
  };

  const session: MonteCarloSession = {
    totalPaths: v.simulations,
    get completedPaths() {
      return done;
    },
    step(maxPaths: number) {
      const end = Math.min(v.simulations, done + Math.max(0, Math.floor(maxPaths)));
      for (; done < end; done++) simulatePath(done);
      return done;
    },
    finish() {
      if (done < v.simulations) return fail('INVALID_INPUT', 'The simulation has not finished all paths yet.');
      const bands: PercentileBand[] = byYear.map((vals, year) => {
        const sorted = Float64Array.from(vals).sort();
        return {
          year,
          invested: investedByYear[year]!,
          p10: percentileSorted(sorted, 0.1),
          p25: percentileSorted(sorted, 0.25),
          p50: percentileSorted(sorted, 0.5),
          p75: percentileSorted(sorted, 0.75),
          p90: percentileSorted(sorted, 0.9),
        };
      });

      const terminal = byYear[v.years]!;
      const sortedTerminal = Float64Array.from(terminal).sort();
      if (!Number.isFinite(sortedTerminal[sortedTerminal.length - 1]!)) {
        return fail('NON_FINITE_RESULT', 'Simulated values overflowed; reduce the horizon or volatility.');
      }
      const goalNominal = v.goalInTodaysRupees ? toFutureRupees(v.goalAmount, v.inflationPct, months) : v.goalAmount;
      let hits = 0;
      for (let i = 0; i < terminal.length; i++) if (terminal[i]! >= goalNominal) hits++;

      return ok(
        {
          bands,
          goalNominal,
          goalSuccessRate: hits / v.simulations,
          terminal: {
            p10: percentileSorted(sortedTerminal, 0.1),
            p50: percentileSorted(sortedTerminal, 0.5),
            p90: percentileSorted(sortedTerminal, 0.9),
            mean: mean(terminal),
          },
          totalInvested: investedTotal,
          simulations: v.simulations,
          seed: v.seed,
          model: {
            monthlyLogDrift: muM,
            monthlyLogVol: sigmaM,
            annualLogDrift: muAnnual,
            medianAnnualReturnPct: (Math.exp(muAnnual) - 1) * 100,
          },
        },
        ['Probabilities describe this simplified model, not guaranteed real-world outcomes.'],
      );
    },
  };
  return ok(session);
}

export function runMonteCarlo(input: MonteCarloInput): CalcResult<MonteCarloResult> {
  const session = createMonteCarloSession(input);
  if (!session.ok) return session;
  session.value.step(session.value.totalPaths);
  return session.value.finish();
}

export interface MonteCarloRunOptions {
  /** Paths per chunk between progress callbacks and cancellation checks (default 250). */
  chunkSize?: number;
  /** Called after each chunk with paths completed so far. */
  onProgress?: (completedPaths: number, totalPaths: number) => void;
  /** Aborting stops the run at the next chunk boundary and resolves with a CANCELLED error. */
  signal?: AbortSignal;
  /**
   * Yields between chunks so a Web Worker can receive messages (such as a cancel request).
   * Defaults to a macrotask (`setTimeout(0)`).
   */
  yieldControl?: () => Promise<void>;
}

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Chunked, cancellable Monte Carlo for use inside a Web Worker. Results are identical to
 * `runMonteCarlo` for the same input and seed, whatever the chunk size.
 */
export async function runMonteCarloChunked(
  input: MonteCarloInput,
  options: MonteCarloRunOptions = {},
): Promise<CalcResult<MonteCarloResult>> {
  const session = createMonteCarloSession(input);
  if (!session.ok) return session;
  const run = session.value;
  const chunk = Math.max(1, Math.floor(options.chunkSize ?? 250));
  const yieldControl = options.yieldControl ?? defaultYield;
  while (run.completedPaths < run.totalPaths) {
    if (options.signal?.aborted) return fail('CANCELLED', 'The simulation was cancelled.');
    run.step(chunk);
    options.onProgress?.(run.completedPaths, run.totalPaths);
    if (run.completedPaths < run.totalPaths) await yieldControl();
  }
  if (options.signal?.aborted) return fail('CANCELLED', 'The simulation was cancelled.');
  return run.finish();
}
