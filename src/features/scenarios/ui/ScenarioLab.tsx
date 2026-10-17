'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  MAX_SCENARIOS,
  buildScenarioReport,
  compareScenarios,
  type ContributionTiming,
  type RateConvention,
  type ScenarioComparisonInput,
  type ScenarioComparisonResult,
} from '@/contracts';
import { parseNumberInput } from '@/components/ui/NumberField';
import { Button, Notice, ProjectionBadge } from '@/components/ui/primitives';
import { MoneyLineChart } from '@/components/charts/Charts';
import { CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { CONVENTION_LABEL, RateConventionField, TIMING_LABEL, TimingField } from '@/components/calculator/ConventionFields';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { DataTable } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Kpi';
import { formatINR } from '@/lib/format/inr';
import { buildQuery, optionFromParams, type SearchParamsRecord } from '@/features/calculators/ui/useFields';

interface Scenario {
  name: string;
  monthly: string;
  initial: string;
  years: string;
  ret: string;
  step: string;
}
type NumKey = Exclude<keyof Scenario, 'name'>;

const FIELDS: Array<{ key: NumKey; label: string; engine: string }> = [
  { key: 'monthly', label: 'Monthly SIP (₹)', engine: 'monthlyContribution' },
  { key: 'initial', label: 'Initial amount (₹)', engine: 'initialCorpus' },
  { key: 'years', label: 'Years', engine: 'months' },
  { key: 'ret', label: 'Annual return (%)', engine: 'annualReturnPct' },
  { key: 'step', label: 'Annual step-up (%)', engine: 'stepUp.value' },
];

const START: Scenario[] = [
  { name: 'Steady', monthly: '10000', initial: '0', years: '20', ret: '10', step: '0' },
  { name: 'Step-up', monthly: '10000', initial: '0', years: '20', ret: '10', step: '10' },
];
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
const INFLATION = 6;

/** Share/save encoding: s0=name~monthly~initial~years~return~stepup (assumptions only). */
function decode(params?: SearchParamsRecord): Scenario[] | null {
  const out: Scenario[] = [];
  for (let i = 0; i < MAX_SCENARIOS; i++) {
    const raw = params?.[`s${i}`];
    if (typeof raw !== 'string' || raw.length > 200) continue;
    const [name, monthly, initial, years, ret, step] = raw.split('~');
    if ([monthly, initial, years, ret, step].some((x) => x === undefined || parseNumberInput(x) === null)) continue;
    out.push({ name: (name ?? '').slice(0, 30), monthly: monthly!, initial: initial!, years: years!, ret: ret!, step: step! });
  }
  return out.length ? out : null;
}

export function ScenarioLab({ params }: { params?: SearchParamsRecord }) {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => decode(params) ?? START);
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));

  const parsed = useMemo(
    () =>
      scenarios.map((s) => {
        const n = Object.fromEntries(FIELDS.map((f) => [f.key, parseNumberInput(s[f.key])])) as Record<NumKey, number | null>;
        return { n, bad: FIELDS.filter((f) => n[f.key] === null).map((f) => f.key) };
      }),
    [scenarios],
  );
  const anyBad = parsed.some((p) => p.bad.length > 0);

  const input: ScenarioComparisonInput | null = useMemo(() => {
    if (anyBad) return null;
    return {
      scenarios: scenarios.map((s, i) => {
        const n = parsed[i]!.n;
        return {
          label: s.name.trim(),
          input: {
            monthlyContribution: n.monthly!,
            initialCorpus: n.initial!,
            months: n.years! * 12,
            annualReturnPct: n.ret!,
            stepUp: n.step ? { mode: 'percent', value: n.step } : { mode: 'none' },
            timing,
            rateConvention: rc,
            inflationPct: INFLATION,
          },
        };
      }),
    };
  }, [anyBad, scenarios, parsed, timing, rc]);

  const result = useMemo(() => (input ? compareScenarios(input) : null), [input]);
  // Engine field paths look like "scenarios.1.input.months".
  const errAt = (i: number, key: NumKey | 'name') => {
    if (!result || result.ok || !result.error.field) return null;
    const f = result.error.field;
    if (key === 'name') return f === 'scenarios' || f === `scenarios.${i}.label` ? result.error.message : null;
    const eng = FIELDS.find((x) => x.key === key)!.engine;
    return f === `scenarios.${i}.input.${eng}` ? result.error.message : null;
  };

  const update = (i: number, k: keyof Scenario, v: string) => setScenarios((prev) => prev.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const query = buildQuery({
    ...Object.fromEntries(scenarios.map((s, i) => [`s${i}`, [s.name.replace(/~/g, ''), s.monthly, s.initial, s.years, s.ret, s.step].join('~')])),
    t: timing,
    rc,
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s, i) => (
          <fieldset key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4" style={{ borderTop: `4px solid ${COLORS[i]}` }}>
            <legend className="sr-only">Scenario {i + 1}</legend>
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col text-sm font-medium">
                Scenario name
                <input
                  value={s.name}
                  maxLength={30}
                  onChange={(e) => update(i, 'name', e.target.value)}
                  aria-invalid={errAt(i, 'name') ? true : undefined}
                  className="mt-1 rounded-md border border-line-strong bg-surface px-2 py-1.5 font-normal"
                />
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
              {FIELDS.map((f) => {
                const bad = parsed[i]!.bad.includes(f.key);
                const engineErr = errAt(i, f.key);
                return (
                  <label key={f.key} className="flex flex-col text-sm">
                    <span>{f.label}</span>
                    <input
                      inputMode="decimal"
                      value={s[f.key]}
                      onChange={(e) => update(i, f.key, e.target.value)}
                      aria-invalid={bad || engineErr ? true : undefined}
                      className={`num mt-1 rounded-md border bg-surface px-2 py-1.5 ${bad || engineErr ? 'border-danger' : 'border-line-strong'}`}
                    />
                    {bad && <span className="text-xs font-medium text-danger">Enter a number</span>}
                    {engineErr && <span className="text-xs font-medium text-danger">{engineErr}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {scenarios.length < MAX_SCENARIOS && (
        <Button onClick={() => setScenarios((p) => [...p, { ...p[p.length - 1]!, name: `Scenario ${p.length + 1}` }])}>
          <Plus aria-hidden="true" size={16} /> Add scenario
        </Button>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <TimingField value={timing} onChange={setTiming} />
        <RateConventionField value={rc} onChange={setRc} />
      </div>

      <section aria-labelledby="cmp-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="cmp-heading" className="text-xl font-semibold">
              Comparison
            </h2>
            <ProjectionBadge />
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <ShareButton path="/scenario-lab" query={query} />
            <SavePlanButton calculator="Scenario Lab" path="/scenario-lab" query={query} defaultName="Scenario comparison" />
            <ExportButtons
              fileBase="scenario-lab"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok) throw new Error('No result');
                return buildScenarioReport(result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {!result || !result.ok ? (
          <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />
        ) : (
          <ComparisonResults r={result.value} warnings={result.warnings} timing={timing} rc={rc} />
        )}
      </section>
      <MethodNote>
        <ul>
          <li>Each scenario runs through the same projection engine as the SIP calculator. Differences are shown against the first scenario.</li>
          <li>When horizons or conventions differ, part of the difference comes from that, and a warning says so.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function ComparisonResults({ r, warnings, timing, rc }: { r: ScenarioComparisonResult; warnings: string[]; timing: ContributionTiming; rc: RateConvention }) {
  // Re-key the engine's aligned yearly values for the chart (no arithmetic).
  const chartData = r.yearly.map((y) => {
    const rec: Record<string, number | null> = { month: y.year * 12 };
    y.values.forEach((v, i) => (rec[`s${i}`] = v));
    return rec;
  });
  const base = r.scenarios[0]!.label;
  return (
    <>
      <ConventionsLine items={[TIMING_LABEL[timing], CONVENTION_LABEL[rc], `Today's rupees use ${INFLATION}% inflation`]} />
      <div role="region" aria-label="Scenario comparison table" tabIndex={0} className="overflow-x-auto rounded-lg border border-line" data-testid="scenario-table">
        <table className="num w-full text-sm">
          <caption className="sr-only">Scenario comparison; differences are against {base}</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Measure</th>
              {r.scenarios.map((s) => (
                <th key={s.label} scope="col" className="px-3 py-2 text-right">
                  {s.label}
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
                {r.scenarios.map((s) => (
                  <td key={s.label} className="px-3 py-1.5 text-right">
                    <Money value={s.summary[key]} />
                  </td>
                ))}
              </tr>
            ))}
            {(
              [
                ['Projected value vs ' + base, 'finalValue'],
                ['Invested vs ' + base, 'totalInvested'],
              ] as const
            ).map(([label, key]) => (
              <tr key={label} className="border-t border-line bg-bg">
                <th scope="row" className="px-3 py-1.5 text-left font-medium">{label}</th>
                {r.scenarios.map((s) => (
                  <td key={s.label} className="px-3 py-1.5 text-right">
                    {formatINR(s.vsBaseline[key], 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm" data-testid="result-summary">
        Highest projected value: <strong>{r.highestFinalValue}</strong>. A higher projection comes from the assumptions entered and is not a judgement of which plan suits you.
      </p>
      {r.scenarios.some((s) => s.warnings.length) && (
        <Notice tone="warning" title="Check these assumptions">
          <ul className="list-disc pl-4">
            {r.scenarios.flatMap((s) => s.warnings.map((w) => <li key={`${s.label}-${w}`}>{`${s.label}: ${w}`}</li>))}
          </ul>
        </Notice>
      )}
      <Warnings warnings={warnings} />
      <MoneyLineChart
        data={chartData}
        xKey="month"
        xLabel={(m) => `Yr ${Number(m) / 12}`}
        title="Projected value of each scenario by year"
        summary="The table below lists each year's values."
        series={r.scenarios.map((s, i) => ({ key: `s${i}`, label: s.label, color: COLORS[i]! }))}
      />
      <DataTable
        caption="Year-end projected values by scenario"
        rows={r.yearly}
        rowKey={(y) => y.year}
        columns={[
          { header: 'Year', cell: (y) => y.year },
          ...r.scenarios.map((s, i) => ({ header: s.label, numeric: true, cell: (y: ScenarioComparisonResult['yearly'][number]) => (y.values[i] === null ? '—' : formatINR(y.values[i]!, 0)) })),
        ]}
      />
    </>
  );
}
