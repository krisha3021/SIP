'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Shuffle, Square } from 'lucide-react';
import { MAX_SIMULATIONS, runMonteCarlo, type CalcResult, type ContributionTiming, type MonteCarloInput, type MonteCarloResult, type PercentileBand } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { Button, Notice } from '@/components/ui/primitives';
import { FanChart } from '@/components/charts/Charts';
import { CalculatorLayout, CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { TIMING_LABEL, TimingField } from '@/components/calculator/ConventionFields';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { formatINR, formatPct } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { monteCarloReport } from './reports';
import { formatCount, formatShare } from './format';

const DEFAULTS = { m: 15000, c: 0, y: 20, r: 12, vol: 16, s: 5, g: 5000000, i: 6, n: 2000, seed: 20240601 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = {
  monthlyContribution: 'm',
  initialCorpus: 'c',
  years: 'y',
  expectedReturnPct: 'r',
  volatilityPct: 'vol',
  annualStepUpPct: 's',
  goalAmount: 'g',
  inflationPct: 'i',
  simulations: 'n',
  seed: 'seed',
};

type RunState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; result: CalcResult<MonteCarloResult>; ms: number; mode: 'worker' | 'main-thread'; input: MonteCarloInput };

export function MonteCarlo({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS, params);
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [basis, setBasis] = useState<'today' | 'future'>(optionFromParams(params, 'gb', ['today', 'future'] as const, 'today'));
  const [run, setRun] = useState<RunState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const v = f.values;

  const input: MonteCarloInput | null = useMemo(
    () =>
      f.allParsed
        ? {
            monthlyContribution: v.m!,
            initialCorpus: v.c!,
            years: v.y!,
            expectedReturnPct: v.r!,
            volatilityPct: v.vol!,
            annualStepUpPct: v.s!,
            timing,
            goalAmount: v.g!,
            goalInTodaysRupees: basis === 'today',
            inflationPct: v.i!,
            simulations: v.n!,
            seed: v.seed!,
          }
        : null,
    [f.allParsed, v, timing, basis],
  );

  const stopWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const start = useCallback(
    (inp: MonteCarloInput) => {
      const id = ++reqId.current;
      stopWorker();
      setRun({ status: 'running', startedAt: performance.now() });
      if (typeof Worker === 'undefined') {
        // Fallback: run on the main thread (no Worker support). Deferred so the "Running" state renders first.
        setTimeout(() => {
          const t0 = performance.now();
          const result = runMonteCarlo(inp);
          if (id === reqId.current) setRun({ status: 'done', result, ms: performance.now() - t0, mode: 'main-thread', input: inp });
        }, 0);
        return;
      }
      const w = new Worker(new URL('./mc.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = w;
      w.onmessage = (e: MessageEvent<{ id: number; result: CalcResult<MonteCarloResult>; ms: number }>) => {
        if (e.data.id !== reqId.current) return;
        setRun({ status: 'done', result: e.data.result, ms: e.data.ms, mode: 'worker', input: inp });
        stopWorker();
      };
      w.onerror = () => {
        if (id !== reqId.current) return;
        setRun({ status: 'done', result: { ok: false, error: { code: 'UNSUPPORTED', message: 'The simulation could not run in this browser.' } }, ms: 0, mode: 'worker', input: inp });
        stopWorker();
      };
      w.postMessage({ id, input: inp });
    },
    [],
  );

  // Run once on mount with the initial assumptions; afterwards the user runs it explicitly.
  // Cleanup terminates the worker, and a remount (e.g. StrictMode) starts a fresh run.
  const initialInput = useRef(input);
  useEffect(() => {
    if (initialInput.current) start(initialInput.current);
    return () => {
      // reqId is a request counter, not a DOM ref: bumping it here invalidates any in-flight reply.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      reqId.current++;
      stopWorker();
    };
  }, [start]);

  const stale = run.status === 'done' && input !== null && JSON.stringify(input) !== JSON.stringify(run.input);
  const result = run.status === 'done' ? run.result : null;
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: keyof typeof DEFAULTS) => f.parseErrors[k] ?? (!stale && errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...f.raw, t: timing, gb: basis });

  const form = (
    <>
      <NumberField name="m" label="Monthly SIP" value={f.raw.m} onChange={(x) => f.set('m', x)} sliderMin={0} sliderMax={200_000} step={500} prefix="₹" error={err('m')} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="c" label="Amount invested today" value={f.raw.c} onChange={(x) => f.set('c', x)} sliderMin={0} sliderMax={10_000_000} step={10000} prefix="₹" error={err('c')} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="s" label="Annual step-up" value={f.raw.s} onChange={(x) => f.set('s', x)} sliderMin={0} sliderMax={25} suffix="%" error={err('s')} />
      <NumberField name="y" label="Years" value={f.raw.y} onChange={(x) => f.set('y', x)} sliderMin={1} sliderMax={60} suffix="years" error={err('y')} />
      <NumberField name="r" label="Expected (average) annual return" value={f.raw.r} onChange={(x) => f.set('r', x)} sliderMin={-5} sliderMax={20} step={0.5} suffix="%" error={err('r')} />
      <NumberField name="vol" label="Volatility (yearly standard deviation)" value={f.raw.vol} onChange={(x) => f.set('vol', x)} sliderMin={0} sliderMax={40} step={1} suffix="%" error={err('vol')} hint="Higher volatility widens the range of outcomes." />
      <NumberField name="g" label="Your goal" value={f.raw.g} onChange={(x) => f.set('g', x)} sliderMin={100000} sliderMax={100_000_000} step={100000} prefix="₹" error={err('g')} hint={v.g !== null ? <Money value={v.g} /> : undefined} formatValue={(n) => formatINR(n, 0)} />
      <Choice
        legend="The goal is in"
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'today', label: "Today's rupees" },
          { value: 'future', label: 'Future rupees' },
        ]}
      />
      <NumberField name="i" label="Inflation" value={f.raw.i} onChange={(x) => f.set('i', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('i')} />
      <TimingField value={timing} onChange={setTiming} />
      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">Simulation settings</summary>
        <div className="mt-3 space-y-4">
          <NumberField name="n" label="Number of simulations" value={f.raw.n} onChange={(x) => f.set('n', x)} sliderMin={100} sliderMax={MAX_SIMULATIONS} step={100} error={err('n')} hint={`100 to ${formatCount(MAX_SIMULATIONS)}.`} />
          <NumberField name="seed" label="Random seed" value={f.raw.seed} onChange={(x) => f.set('seed', x)} sliderMin={0} sliderMax={1_000_000} noSlider error={err('seed')} hint="The same seed and inputs always give the same result." />
          <Button variant="ghost" className="px-2" onClick={() => f.set('seed', String(Math.floor(Math.random() * 1_000_000_000)))}>
            <Shuffle aria-hidden="true" size={16} /> New random seed
          </Button>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => input && start(input)} disabled={!input || run.status === 'running'}>
          <Play aria-hidden="true" size={16} /> Run simulation
        </Button>
        {run.status === 'running' && (
          <Button
            onClick={() => {
              reqId.current++;
              stopWorker();
              setRun({ status: 'idle' });
            }}
          >
            <Square aria-hidden="true" size={16} /> Cancel
          </Button>
        )}
      </div>
    </>
  );

  let results: React.ReactNode;
  if (!input) {
    results = <CalcErrorState parseIssue />;
  } else if (run.status === 'idle') {
    results = <Notice tone="info" title="Ready">Press “Run simulation” to see the range of outcomes.</Notice>;
  } else if (run.status === 'running') {
    results = (
      <div role="status" aria-live="polite" className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="font-semibold">Running {formatCount(input.simulations ?? 0)} simulations…</p>
        <p className="mt-1 text-sm text-muted">This runs in a background thread, so the page stays responsive.</p>
      </div>
    );
  } else if (!run.result.ok) {
    results = <CalcErrorState error={run.result.error} />;
  } else {
    const m = run.result.value;
    results = (
      <>
        {stale && (
          <Notice tone="warning" title="Inputs changed" role="status">
            These results are for the previous inputs. Press “Run simulation” to update.
          </Notice>
        )}
        <div className="rounded-lg border border-line bg-surface-2 p-4" data-testid="mc-headline">
          <p className="text-sm text-muted">Share of simulated paths that reached your goal</p>
          <p className="num mt-1 text-4xl font-semibold text-brand">{formatShare(m.goalSuccessRate)}</p>
          <p className="mt-2 text-sm">
            In <strong>{formatCount(m.simulations)}</strong> simulated paths (seed <strong className="num">{m.seed}</strong>), {formatShare(m.goalSuccessRate)} ended at or above{' '}
            <Money value={m.goalNominal} />. This is a property of the model, <strong>not a guarantee or a probability of real-world success</strong>.
          </p>
        </div>
        <KpiGrid>
          <KpiCard label="Median outcome" value={m.terminal.p50} emphasis testId="kpi-median" />
          <KpiCard label="Weak case (10th percentile)" value={m.terminal.p10} sub="9 in 10 paths ended above this" />
          <KpiCard label="Strong case (90th percentile)" value={m.terminal.p90} sub="1 in 10 paths ended above this" />
          <KpiCard label="Total invested" value={m.totalInvested} />
          <KpiCard label="Goal at the horizon" value={m.goalNominal} sub={basis === 'today' ? 'Nominal, after inflation' : 'As entered'} />
          <KpiCard label="Average outcome (mean)" value={m.terminal.mean} sub="Pulled up by a few very good paths" />
        </KpiGrid>
        <ConventionsLine
          items={[
            TIMING_LABEL[timing],
            `Monthly lognormal returns; model median return ${formatPct(m.model.medianAnnualReturnPct, 2)} a year`,
            `${formatCount(m.simulations)} simulations · seed ${m.seed}`,
            `Ran in ${run.mode === 'worker' ? 'a Web Worker' : 'the main thread (no Worker support)'} in ${Math.round(run.ms)} ms`,
          ]}
        />
        <Warnings warnings={run.result.warnings} />
        <Tabs
          label="Simulation views"
          tabs={[
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <FanChart
                  data={m.bands}
                  title="Range of simulated portfolio values by year"
                  summary={
                    <>
                      By year {m.bands.length - 1}, the middle half of paths lies between <Money value={m.bands[m.bands.length - 1]!.p25} /> and <Money value={m.bands[m.bands.length - 1]!.p75} />, and the median is{' '}
                      <Money value={m.terminal.p50} />.
                    </>
                  }
                />
              ),
            },
            {
              id: 'table',
              label: 'Percentile table',
              content: (
                <DataTable<PercentileBand>
                  caption="Simulated percentiles by year"
                  rows={m.bands}
                  rowKey={(b) => b.year}
                  columns={[
                    { header: 'Year', cell: (b) => b.year },
                    { header: 'Invested', numeric: true, cell: (b) => formatINR(b.invested, 0) },
                    { header: '10th', numeric: true, cell: (b) => formatINR(b.p10, 0) },
                    { header: '25th', numeric: true, cell: (b) => formatINR(b.p25, 0) },
                    { header: 'Median', numeric: true, cell: (b) => formatINR(b.p50, 0) },
                    { header: '75th', numeric: true, cell: (b) => formatINR(b.p75, 0) },
                    { header: '90th', numeric: true, cell: (b) => formatINR(b.p90, 0) },
                  ]}
                />
              ),
            },
          ]}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <CalculatorLayout
        form={form}
        results={results}
        onReset={() => {
          f.reset();
          setTiming('end');
          setBasis('today');
        }}
        actions={
          <>
            <ShareButton path="/calculators/monte-carlo" query={query} />
            <SavePlanButton calculator="Monte Carlo" path="/calculators/monte-carlo" query={query} defaultName="Monte Carlo scenario" />
            <ExportButtons
              fileBase="monte-carlo"
              disabled={!(run.status === 'done' && run.result.ok)}
              buildReport={() => {
                if (run.status !== 'done' || !run.result.ok) throw new Error('No result');
                const i = run.input;
                return monteCarloReport(
                  [
                    ['Monthly SIP (₹)', i.monthlyContribution],
                    ['Initial amount (₹)', i.initialCorpus ?? 0],
                    ['Annual step-up (%)', i.annualStepUpPct ?? 0],
                    ['Years', i.years],
                    ['Expected annual return (%)', i.expectedReturnPct],
                    ['Volatility (%)', i.volatilityPct],
                    ['Goal (₹)', i.goalAmount],
                    ['Goal basis', i.goalInTodaysRupees ? "Today's rupees" : 'Future rupees'],
                    ['Inflation (%)', i.inflationPct ?? null],
                  ],
                  [
                    ['Contribution timing', TIMING_LABEL[i.timing ?? 'end']],
                    ['Return model', 'Monthly lognormal, i.i.d., mean-calibrated'],
                  ],
                  run.result.value,
                );
              }}
            />
          </>
        }
      />
      <MethodNote>
        <ul>
          <li>Each month&apos;s return is drawn at random from a lognormal distribution calibrated so that the average yearly growth equals your expected return.</li>
          <li>The median path grows more slowly than the expected return when volatility is high. That is a feature of compounding, not an error.</li>
          <li>The model ignores fat tails, volatility clustering, mean reversion, regime changes, fees and taxes. Its percentages describe the model, not the real world.</li>
          <li>A seeded random generator makes every run reproducible: the same inputs and seed give the same numbers.</li>
        </ul>
      </MethodNote>
    </div>
  );
}
