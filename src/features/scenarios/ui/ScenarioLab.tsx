'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { projectAccumulation, type CalcResult, type AccumulationResult, type ContributionTiming, type RateConvention } from '@/contracts';
import { parseNumberInput } from '@/components/ui/NumberField';
import { Button, Notice, ProjectionBadge } from '@/components/ui/primitives';
import { MoneyLineChart } from '@/components/charts/Charts';
import { ConventionsLine } from '@/components/calculator/CalculatorLayout';
import { CONVENTION_LABEL, RateConventionField, TIMING_LABEL, TimingField } from '@/components/calculator/ConventionFields';
import { Money } from '@/components/ui/Kpi';
import { shortMonthLabel } from '@/features/calculators/ui/format';

interface Scenario {
  name: string;
  monthly: string;
  initial: string;
  years: string;
  ret: string;
  step: string;
}

const FIELDS: Array<{ key: Exclude<keyof Scenario, 'name'>; label: string; suffix?: string; prefix?: string }> = [
  { key: 'monthly', label: 'Monthly SIP', prefix: '₹' },
  { key: 'initial', label: 'Initial amount', prefix: '₹' },
  { key: 'years', label: 'Years', suffix: 'yrs' },
  { key: 'ret', label: 'Annual return', suffix: '%' },
  { key: 'step', label: 'Annual step-up', suffix: '%' },
];

const START: Scenario[] = [
  { name: 'Steady', monthly: '10000', initial: '0', years: '20', ret: '10', step: '0' },
  { name: 'Step-up', monthly: '10000', initial: '0', years: '20', ret: '10', step: '10' },
];
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

function run(s: Scenario, timing: ContributionTiming, rc: RateConvention, inflation: number): CalcResult<AccumulationResult> | { ok: false; error: { message: string } } {
  const n = Object.fromEntries(FIELDS.map((f) => [f.key, parseNumberInput(s[f.key])])) as Record<string, number | null>;
  const bad = FIELDS.find((f) => n[f.key] === null);
  if (bad) return { ok: false, error: { message: `${bad.label}: enter a number.` } };
  return projectAccumulation({
    monthlyContribution: n.monthly!,
    initialCorpus: n.initial!,
    months: n.years! * 12,
    annualReturnPct: n.ret!,
    stepUp: n.step ? { mode: 'percent', value: n.step } : { mode: 'none' },
    timing,
    rateConvention: rc,
    inflationPct: inflation,
  });
}

export function ScenarioLab() {
  const [scenarios, setScenarios] = useState<Scenario[]>(START);
  const [timing, setTiming] = useState<ContributionTiming>('end');
  const [rc, setRc] = useState<RateConvention>('effective');
  const inflation = 6;
  const results = useMemo(() => scenarios.map((s) => run(s, timing, rc, inflation)), [scenarios, timing, rc]);

  // Join each scenario's yearly engine rows by month for an overlay chart (no arithmetic, only re-keying).
  const chartData = useMemo(() => {
    const byMonth = new Map<number, Record<string, number>>();
    results.forEach((r, i) => {
      if (!r.ok) return;
      for (const row of (r as { value: AccumulationResult }).value.yearly) {
        const rec = byMonth.get(row.month) ?? { month: row.month };
        rec[`s${i}`] = row.value;
        byMonth.set(row.month, rec);
      }
    });
    return [...byMonth.values()].sort((a, b) => a.month! - b.month!);
  }, [results]);

  const update = (i: number, k: keyof Scenario, v: string) => setScenarios((prev) => prev.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s, i) => {
          const r = results[i]!;
          return (
            <fieldset key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4" style={{ borderTop: `4px solid ${COLORS[i]}` }}>
              <legend className="sr-only">Scenario {i + 1}</legend>
              <div className="flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col text-sm font-medium">
                  Scenario name
                  <input value={s.name} maxLength={30} onChange={(e) => update(i, 'name', e.target.value)} className="mt-1 rounded-md border border-line-strong bg-surface px-2 py-1.5 font-normal" />
                </label>
                {scenarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setScenarios((prev) => prev.filter((_, j) => j !== i))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-strong hover:bg-surface-2"
                    aria-label={`Remove scenario ${s.name || i + 1}`}
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex flex-col text-sm">
                    <span>
                      {f.label}
                      {f.suffix ? ` (${f.suffix})` : ''}
                      {f.prefix ? ` (${f.prefix})` : ''}
                    </span>
                    <input
                      inputMode="decimal"
                      value={s[f.key]}
                      onChange={(e) => update(i, f.key, e.target.value)}
                      aria-invalid={parseNumberInput(s[f.key]) === null ? true : undefined}
                      className="num mt-1 rounded-md border border-line-strong bg-surface px-2 py-1.5"
                    />
                  </label>
                ))}
              </div>
              {!r.ok && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {r.error.message}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4">
        {scenarios.length < 3 && (
          <Button onClick={() => setScenarios((p) => [...p, { ...p[p.length - 1]!, name: `Scenario ${p.length + 1}` }])}>
            <Plus aria-hidden="true" size={16} /> Add scenario
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TimingField value={timing} onChange={setTiming} />
        <RateConventionField value={rc} onChange={setRc} />
      </div>

      <section aria-labelledby="cmp-heading" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="cmp-heading" className="text-xl font-semibold">
            Comparison
          </h2>
          <ProjectionBadge />
        </div>
        <ConventionsLine items={[TIMING_LABEL[timing], CONVENTION_LABEL[rc], `Today's rupees use ${inflation}% inflation`]} />
        <div role="region" aria-label="Scenario comparison table" tabIndex={0} className="overflow-x-auto rounded-lg border border-line">
          <table className="num w-full text-sm">
            <caption className="sr-only">Scenario comparison</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Measure</th>
                {scenarios.map((s, i) => (
                  <th key={i} scope="col" className="px-3 py-2 text-right">
                    {s.name || `Scenario ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Total invested', 'totalInvested'],
                  ['Projected value', 'finalValue'],
                  ['Gain / loss', 'gains'],
                  ["In today's rupees", 'realFinalValue'],
                  ['Monthly SIP in final year', 'lastMonthlyContribution'],
                ] as const
              ).map(([label, key]) => (
                <tr key={key} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">{label}</th>
                  {results.map((r, i) => (
                    <td key={i} className="px-3 py-1.5 text-right">
                      {r.ok ? <Money value={(r as { value: AccumulationResult }).value.summary[key]} /> : 'No result'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {results.some((r) => r.ok && (r as { warnings: string[] }).warnings.length) && (
          <Notice tone="warning" title="Check these assumptions">
            <ul className="list-disc pl-4">
              {results.flatMap((r, i) => (r.ok ? (r as { warnings: string[] }).warnings.map((w) => <li key={`${i}-${w}`}>{`${scenarios[i]!.name}: ${w}`}</li>) : []))}
            </ul>
          </Notice>
        )}
        {chartData.length > 0 && (
          <MoneyLineChart
            data={chartData}
            xKey="month"
            xLabel={shortMonthLabel}
            title="Projected value of each scenario by year"
            summary="The comparison table above lists the same results."
            series={scenarios.map((s, i) => ({ key: `s${i}`, label: s.name || `Scenario ${i + 1}`, color: COLORS[i]! }))}
          />
        )}
      </section>
    </div>
  );
}
