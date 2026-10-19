'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import {
  DEFAULT_ASSETS,
  DEFAULT_CORRELATIONS,
  DEFAULT_MIXES,
  STRATEGY_NOTICE,
  buildStrategyReport,
  compareStrategies,
  explainStrategies,
  type StrategyInput,
  type StrategyResult,
} from '@/contracts';
import { NumberField, parseNumberInput } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { Badge, Button, Notice } from '@/components/ui/primitives';
import { MandatoryNotice } from '@/components/calculator/MandatoryNotice';
import { ExportButtons } from '@/components/calculator/ActionButtons';
import { formatINRCompact, formatPct } from '@/lib/format/inr';

import { StrategyExplanation } from './StrategyExplanation';

const NOT_A_NUMBER = 'Enter a number (digits only, e.g. 25000)';

type Fields = Record<string, string>;
const DEFAULTS: Fields = {
  target: '5000000',
  years: '15',
  capacity: '15000',
  corpus: '200000',
  stepUp: '10',
  inflation: '6',
  liquidity: '6',
  eqR: String(DEFAULT_ASSETS.equity.expectedReturnPct),
  eqV: String(DEFAULT_ASSETS.equity.volatilityPct),
  dbR: String(DEFAULT_ASSETS.debt.expectedReturnPct),
  dbV: String(DEFAULT_ASSETS.debt.volatilityPct),
  gdR: String(DEFAULT_ASSETS.gold.expectedReturnPct),
  gdV: String(DEFAULT_ASSETS.gold.volatilityPct),
  rED: String(DEFAULT_CORRELATIONS.equityDebt),
  rEG: String(DEFAULT_CORRELATIONS.equityGold),
  rDG: String(DEFAULT_CORRELATIONS.debtGold),
  ...Object.fromEntries(DEFAULT_MIXES.flatMap((m, i) => [[`m${i}e`, String(m.equityPct)], [`m${i}d`, String(m.debtPct)], [`m${i}g`, String(m.goldPct)]])),
};

function buildInput(f: Fields, hasGoal: boolean, risk: 'lower' | 'balanced' | 'higher'): { input: StrategyInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const n = (k: string) => {
    const v = parseNumberInput(f[k] ?? '');
    if (v === null) errors[k] = NOT_A_NUMBER;
    return v ?? NaN;
  };
  const input: StrategyInput = {
    targetAmount: hasGoal ? n('target') : undefined,
    years: n('years'),
    monthlyCapacity: n('capacity'),
    existingCorpus: n('corpus'),
    stepUpPct: n('stepUp'),
    inflationPct: n('inflation'),
    liquidityReserveMonths: n('liquidity'),
    riskPreference: risk,
    assets: { equity: { expectedReturnPct: n('eqR'), volatilityPct: n('eqV') }, debt: { expectedReturnPct: n('dbR'), volatilityPct: n('dbV') }, gold: { expectedReturnPct: n('gdR'), volatilityPct: n('gdV') } },
    correlations: { equityDebt: n('rED'), equityGold: n('rEG'), debtGold: n('rDG') },
    mixes: DEFAULT_MIXES.map((m, i) => ({ label: m.label, equityPct: n(`m${i}e`), debtPct: n(`m${i}d`), goldPct: n(`m${i}g`) })),
    simulations: 1000,
  };
  return { input: Object.keys(errors).length ? null : input, errors };
}

export function StrategyLab({ onExplainWithAi }: { onExplainWithAi?: (r: StrategyResult) => React.ReactNode } = {}) {
  const [fields, setFields] = useState<Fields>(DEFAULTS);
  const [hasGoal, setHasGoal] = useState(true);
  const [risk, setRisk] = useState<'lower' | 'balanced' | 'higher'>('balanced');
  const deferred = useDeferredValue(fields);
  const set = (k: string) => (raw: string) => setFields((p) => ({ ...p, [k]: raw }));

  const { input, errors } = useMemo(() => buildInput(fields, hasGoal, risk), [fields, hasGoal, risk]);
  const deferredBuild = useMemo(() => buildInput(deferred, hasGoal, risk), [deferred, hasGoal, risk]);
  const result = useMemo(() => (deferredBuild.input ? compareStrategies(deferredBuild.input) : null), [deferredBuild]);
  const explanation = useMemo(() => (result?.ok ? explainStrategies(result.value) : null), [result]);

  const field = (k: string, label: string, opts: { min: number; max: number; step?: number; prefix?: string; suffix?: string; hint?: string; noSlider?: boolean; compact?: boolean }) => (
    <NumberField
      name={k}
      label={label}
      value={fields[k] ?? ''}
      onChange={set(k)}
      sliderMin={opts.min}
      sliderMax={opts.max}
      step={opts.step}
      prefix={opts.prefix}
      suffix={opts.suffix}
      hint={opts.hint}
      noSlider={opts.noSlider}
      compact={opts.compact}
      error={errors[k] ?? (result && !result.ok && result.error.field?.startsWith(k) ? result.error.message : null)}
    />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form aria-label="Strategy Lab inputs" className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Notice tone="info" title="Inputs stay on this device">
          Everything here is calculated in your browser. Nothing you enter is sent anywhere unless you separately choose an AI explanation and approve it.
        </Notice>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={hasGoal} onChange={(e) => setHasGoal(e.target.checked)} /> I have a goal amount
        </label>
        {hasGoal && field('target', "Goal amount in today's rupees", { min: 100000, max: 50000000, step: 100000, prefix: '₹' })}
        {field('years', 'Time horizon', { min: 1, max: 50, suffix: 'years' })}
        {field('capacity', 'Monthly amount you can invest', { min: 500, max: 500000, step: 500, prefix: '₹' })}
        {field('corpus', 'Existing amount already set aside for this goal', { min: 0, max: 50000000, step: 10000, prefix: '₹' })}
        {field('stepUp', 'Expected yearly increase in contributions', { min: 0, max: 30, suffix: '%' })}
        {field('inflation', 'Inflation assumption', { min: 0, max: 15, step: 0.5, suffix: '%' })}
        {field('liquidity', 'Months of expenses you want kept liquid', { min: 0, max: 36, suffix: 'months', hint: 'Shown back to you only; not used to score anything.' })}
        <Choice
          name="risk"
          legend="Risk preference (for your own reference)"
          value={risk}
          onChange={setRisk}
          options={[
            { value: 'lower', label: 'Lower' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'higher', label: 'Higher' },
          ]}
          hint="Not used to rank or choose a strategy."
        />
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">Assumptions for returns, volatility and mixes</summary>
          <p className="mt-2 text-xs text-muted">These defaults are placeholders for you to change — not forecasts and not Lakshya’s view of any market.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {field('eqR', 'Equity return', { min: -20, max: 30, step: 0.5, suffix: '%', noSlider: true, compact: true })}
            {field('eqV', 'Equity volatility', { min: 0, max: 60, suffix: '%', noSlider: true, compact: true })}
            {field('dbR', 'Debt return', { min: -20, max: 30, step: 0.5, suffix: '%', noSlider: true, compact: true })}
            {field('dbV', 'Debt volatility', { min: 0, max: 60, suffix: '%', noSlider: true, compact: true })}
            {field('gdR', 'Gold return', { min: -20, max: 30, step: 0.5, suffix: '%', noSlider: true, compact: true })}
            {field('gdV', 'Gold volatility', { min: 0, max: 60, suffix: '%', noSlider: true, compact: true })}
            {field('rED', 'Correlation equity–debt', { min: -1, max: 1, step: 0.05, noSlider: true, compact: true })}
            {field('rEG', 'Correlation equity–gold', { min: -1, max: 1, step: 0.05, noSlider: true, compact: true })}
            {field('rDG', 'Correlation debt–gold', { min: -1, max: 1, step: 0.05, noSlider: true, compact: true })}
          </div>
          {DEFAULT_MIXES.map((m, i) => (
            <fieldset key={m.label} className="mt-3">
              <legend className="text-sm font-medium">Mix {i + 1}: {m.label}</legend>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {field(`m${i}e`, `Mix ${i + 1} equity`, { min: 0, max: 100, suffix: '%', noSlider: true, compact: true })}
                {field(`m${i}d`, `Mix ${i + 1} debt`, { min: 0, max: 100, suffix: '%', noSlider: true, compact: true })}
                {field(`m${i}g`, `Mix ${i + 1} gold`, { min: 0, max: 100, suffix: '%', noSlider: true, compact: true })}
              </div>
            </fieldset>
          ))}
        </details>
        <Button variant="ghost" onClick={() => setFields(DEFAULTS)}>
          Reset assumptions
        </Button>
      </form>

      <div className="min-w-0 space-y-6" aria-live="polite">
        {!input && <Notice tone="warning" title="No result for these inputs">Some inputs are not valid numbers. Fix the highlighted fields.</Notice>}
        {input && result && !result.ok && (
          <Notice tone="warning" title="These assumptions can’t be used">
            {result.error.message}
          </Notice>
        )}
        {input && result?.ok && <Results result={result.value} explanation={explanation!} aiSlot={onExplainWithAi?.(result.value)} />}
      </div>
    </div>
  );
}

function RangeBar({ p10, p50, p90, max }: { p10: number; p50: number; p90: number; max: number }) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return (
    <div className="relative h-3 w-full min-w-[8rem] rounded bg-surface-2" aria-hidden="true">
      <div className="absolute top-0 h-3 rounded bg-brand/30" style={{ left: pct(p10), width: `calc(${pct(p90)} - ${pct(p10)})` }} />
      <div className="absolute top-[-2px] h-4 w-0.5 bg-brand" style={{ left: pct(p50) }} />
    </div>
  );
}

function Results({ result, explanation, aiSlot }: { result: StrategyResult; explanation: ReturnType<typeof explainStrategies>; aiSlot?: React.ReactNode }) {
  const max = Math.max(...result.strategies.map((s) => s.monteCarlo.p90));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Simulation — not an actual investment</Badge>
        <Badge>Projection (assumption-based)</Badge>
      </div>
      <MandatoryNotice text={STRATEGY_NOTICE} title="Educational simulation" />
      {result.goal && (
        <p className="text-sm">
          Goal in future rupees: <span className="num font-semibold">{formatINRCompact(result.goal.futureTarget)}</span>
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-line" role="region" aria-label="Strategy comparison table (scrolls sideways)" tabIndex={0}>
        <table aria-label="Strategy comparison" className="min-w-full text-sm">
          <caption className="sr-only">Strategy comparison: contributions, projected corpus, simulated range and goal figures for each strategy</caption>
          <thead className="bg-surface-2 text-left">
            <tr>
              <th scope="col" className="px-3 py-2">Strategy</th>
              <th scope="col" className="px-3 py-2 text-right">Contributions</th>
              <th scope="col" className="px-3 py-2 text-right">Projected corpus</th>
              <th scope="col" className="px-3 py-2 text-right">In today’s ₹</th>
              <th scope="col" className="px-3 py-2">Simulated range (P10 – P90, median marked)</th>
              {result.goal && <th scope="col" className="px-3 py-2 text-right">Paths reaching goal</th>}
              {result.goal && <th scope="col" className="px-3 py-2 text-right">Monthly needed</th>}
            </tr>
          </thead>
          <tbody>
            {result.strategies.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {s.label}
                  {s.exceedsCapacity && <span className="block text-xs font-normal text-warning">Above your stated capacity</span>}
                  <span className="block text-xs font-normal text-muted">{s.description}</span>
                </th>
                <td className="num px-3 py-2 text-right">{formatINRCompact(s.totalContributions)}</td>
                <td className="num px-3 py-2 text-right">{formatINRCompact(s.corpusNominal)}</td>
                <td className="num px-3 py-2 text-right">{formatINRCompact(s.corpusToday)}</td>
                <td className="px-3 py-2">
                  <RangeBar p10={s.monteCarlo.p10} p50={s.monteCarlo.p50} p90={s.monteCarlo.p90} max={max} />
                  <span className="num mt-1 block text-xs text-muted">
                    {formatINRCompact(s.monteCarlo.p10)} – {formatINRCompact(s.monteCarlo.p90)}; median {formatINRCompact(s.monteCarlo.p50)}
                  </span>
                </td>
                {result.goal && <td className="num px-3 py-2 text-right">{s.monteCarlo.goalSuccessRate === null ? '—' : formatPct(s.monteCarlo.goalSuccessRate * 100, 0)}</td>}
                {result.goal && <td className="num px-3 py-2 text-right">{s.goal ? formatINRCompact(s.goal.requiredMonthly) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Assumed return and volatility per strategy come from your mix assumptions. Contribution strategies use Mix 1. Simulations: {result.assumptions.simulations} seeded paths per strategy (seed {result.assumptions.seed}).
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {result.notModelled.map((n) => (
          <li key={n.id}>
            Not modelled: {n.label}. {n.reason}
          </li>
        ))}
      </ul>
      <ExportButtons buildReport={() => buildStrategyReport(result, { generatedAt: new Date().toISOString(), warnings: [] })} fileBase="lakshya-strategy-lab" />
      <StrategyExplanation explanation={explanation} />
      {aiSlot}
    </>
  );
}
