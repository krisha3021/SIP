'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { buildAccumulationReport, projectAccumulation, type AccumulationInput, type AccumulationRow, type ContributionTiming, type RateConvention, type StepUp } from '@/contracts';
import { NumberField, parseNumberInput } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { Button } from '@/components/ui/primitives';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { MoneyLineChart } from '@/components/charts/Charts';
import { CalculatorLayout, CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { CONVENTION_LABEL, RateConventionField, TIMING_LABEL, TimingField } from '@/components/calculator/ConventionFields';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { formatINR, formatPct } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { monthLabel, shortMonthLabel } from './format';

export type AccumulationVariant = 'sip' | 'step-up-sip' | 'lumpsum' | 'corpus-sip';

const DEFAULTS: Record<AccumulationVariant, Record<string, number | ''>> = {
  sip: { m: 10000, y: 15, r: 12, i: 6 },
  'step-up-sip': { m: 10000, y: 20, r: 12, i: 6, s: 10, sa: 1000, cap: '' },
  lumpsum: { c: 500000, y: 10, r: 10, i: 6 },
  'corpus-sip': { c: 500000, m: 15000, y: 15, r: 11, i: 6 },
};

const TITLES: Record<AccumulationVariant, string> = {
  sip: 'SIP projection',
  'step-up-sip': 'Step-up SIP projection',
  lumpsum: 'Lumpsum projection',
  'corpus-sip': 'Existing corpus + SIP projection',
};

interface PauseRow {
  from: string;
  to: string;
}
interface TopUpRow {
  month: string;
  amount: string;
}

function parsePauses(v: string | string[] | undefined): PauseRow[] {
  if (typeof v !== 'string' || v.length > 200) return [];
  return v
    .split(',')
    .slice(0, 20)
    .map((p) => p.split('-'))
    .filter((p) => p.length === 2 && p.every((x) => /^\d{1,4}$/.test(x)))
    .map(([from, to]) => ({ from: from!, to: to! }));
}
function parseTopUps(v: string | string[] | undefined): TopUpRow[] {
  if (typeof v !== 'string' || v.length > 400) return [];
  return v
    .split(',')
    .slice(0, 50)
    .map((p) => p.split(':'))
    .filter((p) => p.length === 2 && /^\d{1,4}$/.test(p[0]!) && /^\d{1,11}(\.\d+)?$/.test(p[1]!))
    .map(([month, amount]) => ({ month: month!, amount: amount! }));
}

/** Maps engine field paths to the input that should show the error. */
function fieldFor(enginePath: string | undefined, variant: AccumulationVariant): string | undefined {
  if (!enginePath) return undefined;
  if (enginePath === 'monthlyContribution') return variant === 'lumpsum' ? 'c' : 'm';
  if (enginePath === 'initialCorpus') return 'c';
  if (enginePath === 'annualReturnPct') return 'r';
  if (enginePath === 'months') return 'y';
  if (enginePath === 'inflationPct') return 'i';
  if (enginePath === 'stepUp.value') return 'step';
  if (enginePath === 'stepUp.maxMonthlyContribution') return 'cap';
  return enginePath; // pauses.N / topUps.N...
}

export function AccumulationCalculator({ variant, params }: { variant: AccumulationVariant; params?: SearchParamsRecord }) {
  const defaults = DEFAULTS[variant];
  const f = useFields(defaults, params);
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));
  const [stepMode, setStepMode] = useState<'percent' | 'amount'>(optionFromParams(params, 'sm', ['percent', 'amount'] as const, 'percent'));
  const [pauses, setPauses] = useState<PauseRow[]>(() => (variant === 'corpus-sip' ? parsePauses(params?.p) : []));
  const [topUps, setTopUps] = useState<TopUpRow[]>(() => (variant === 'corpus-sip' ? parseTopUps(params?.tu) : []));

  const hasMonthly = variant !== 'lumpsum';
  const hasCorpus = variant === 'lumpsum' || variant === 'corpus-sip';
  const v = f.values;

  // Pause/top-up text must parse too; otherwise no engine call.
  const listParse = useMemo(() => {
    const pauseVals = pauses.map((p) => ({ fromMonth: parseNumberInput(p.from), toMonth: parseNumberInput(p.to) }));
    const topVals = topUps.map((t) => ({ month: parseNumberInput(t.month), amount: parseNumberInput(t.amount) }));
    const bad = pauseVals.some((p) => p.fromMonth === null || p.toMonth === null) || topVals.some((t) => t.month === null || t.amount === null);
    return { pauseVals, topVals, bad };
  }, [pauses, topUps]);

  // Parse errors in the hidden step-up field (percent vs amount) must not block the result.
  const relevantParsed = Object.keys(f.parseErrors).every((k) => (k === 's' && stepMode !== 'percent') || (k === 'sa' && stepMode !== 'amount'));

  const input: AccumulationInput | null = useMemo(() => {
    if (!relevantParsed || listParse.bad) return null;
    let stepUp: StepUp = { mode: 'none' };
    if (variant === 'step-up-sip') {
      const cap = v.cap ?? undefined;
      stepUp =
        stepMode === 'percent'
          ? { mode: 'percent', value: v.s!, ...(cap !== undefined ? { maxMonthlyContribution: cap } : {}) }
          : { mode: 'amount', value: v.sa!, ...(cap !== undefined ? { maxMonthlyContribution: cap } : {}) };
    }
    return {
      monthlyContribution: hasMonthly ? v.m! : 0,
      initialCorpus: hasCorpus ? v.c! : 0,
      annualReturnPct: v.r!,
      months: v.y! * 12,
      timing: variant === 'lumpsum' ? 'end' : timing,
      rateConvention: rc,
      stepUp,
      inflationPct: v.i!,
      pauses: listParse.pauseVals as Array<{ fromMonth: number; toMonth: number }>,
      topUps: listParse.topVals as Array<{ month: number; amount: number }>,
    };
  }, [relevantParsed, listParse, variant, v, stepMode, hasMonthly, hasCorpus, timing, rc]);

  const result = useMemo(() => (input ? projectAccumulation(input) : null), [input]);
  const engineErrorField = result && !result.ok ? fieldFor(result.error.field, variant) : undefined;
  const err = (k: string) => f.parseErrors[k as keyof typeof f.parseErrors] ?? (engineErrorField === k && result && !result.ok ? result.error.message : null);

  const query = buildQuery({
    ...Object.fromEntries(Object.keys(defaults).map((k) => [k, f.raw[k as keyof typeof f.raw]])),
    ...(variant !== 'lumpsum' ? { t: timing } : {}),
    rc,
    ...(variant === 'step-up-sip' ? { sm: stepMode } : {}),
    ...(variant === 'corpus-sip' && pauses.length ? { p: pauses.map((p) => `${p.from}-${p.to}`).join(',') } : {}),
    ...(variant === 'corpus-sip' && topUps.length ? { tu: topUps.map((t) => `${t.month}:${t.amount}`).join(',') } : {}),
  });
  const path = `/calculators/${variant}`;

  const conventions: string[] = [
    ...(variant === 'lumpsum' ? [] : [TIMING_LABEL[timing]]),
    CONVENTION_LABEL[rc],
    ...(result?.ok ? [`Monthly rate used: ${formatPct(result.value.summary.monthlyRate * 100, 4)} (≈ ${formatPct(result.value.summary.effectiveAnnualRatePct, 2)} a year effective)`] : []),
    `Inflation for today's rupees: ${f.raw.i}% a year`,
  ];

  const reset = () => {
    f.reset();
    setTiming('end');
    setRc('effective');
    setStepMode('percent');
    setPauses([]);
    setTopUps([]);
  };

  const form = (
    <>
      {hasCorpus && (
        <NumberField
          name="c"
          label={variant === 'lumpsum' ? 'One-time investment' : 'Existing corpus today'}
          value={f.raw.c!}
          onChange={(x) => f.set('c', x)}
          sliderMin={0}
          sliderMax={10_000_000}
          step={10_000}
          prefix="₹"
          error={err('c')}
          formatValue={(n) => formatINR(n, 0)}
          hint={v.c !== null && v.c !== undefined ? <Money value={v.c} /> : undefined}
        />
      )}
      {hasMonthly && (
        <NumberField
          name="m"
          label={variant === 'step-up-sip' ? 'Starting monthly SIP' : 'Monthly SIP'}
          value={f.raw.m!}
          onChange={(x) => f.set('m', x)}
          sliderMin={0}
          sliderMax={200_000}
          step={500}
          prefix="₹"
          error={err('m')}
          formatValue={(n) => formatINR(n, 0)}
          hint={v.m !== null && v.m !== undefined ? <Money value={v.m} /> : undefined}
        />
      )}
      {variant === 'step-up-sip' && (
        <>
          <Choice
            legend="Annual step-up"
            value={stepMode}
            onChange={setStepMode}
            options={[
              { value: 'percent', label: 'By percent', description: 'e.g. 10% a year' },
              { value: 'amount', label: 'By amount', description: 'e.g. ₹1,000 a year' },
            ]}
            hint="Applied at the start of each new year: months 13, 25, 37 and so on."
          />
          {stepMode === 'percent' ? (
            <NumberField name="s" label="Step-up per year" value={f.raw.s!} onChange={(x) => f.set('s', x)} sliderMin={0} sliderMax={50} step={1} suffix="%" error={err('s') ?? err('step')} />
          ) : (
            <NumberField
              name="sa"
              label="Step-up per year"
              value={f.raw.sa!}
              onChange={(x) => f.set('sa', x)}
              sliderMin={0}
              sliderMax={50_000}
              step={500}
              prefix="₹"
              error={err('sa') ?? err('step')}
              formatValue={(n) => formatINR(n, 0)}
            />
          )}
          <NumberField
            name="cap"
            label="Cap on monthly SIP (optional)"
            value={f.raw.cap!}
            onChange={(x) => f.set('cap', x)}
            sliderMin={0}
            sliderMax={500_000}
            noSlider
            prefix="₹"
            error={err('cap')}
            hint="Leave empty for no cap. The SIP stops rising once it reaches this amount."
          />
        </>
      )}
      <NumberField name="y" label="Investment period" value={f.raw.y!} onChange={(x) => f.set('y', x)} sliderMin={1} sliderMax={40} step={1} suffix="years" error={err('y')} hint="Whole years, 1 to 100." />
      <NumberField
        name="r"
        label="Expected annual return"
        value={f.raw.r!}
        onChange={(x) => f.set('r', x)}
        sliderMin={0}
        sliderMax={20}
        step={0.5}
        suffix="%"
        error={err('r')}
        hint="An assumption, not a promise. Equity returns vary widely year to year."
      />
      <NumberField name="i" label="Inflation (for today's rupees)" value={f.raw.i!} onChange={(x) => f.set('i', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('i')} />
      {variant !== 'lumpsum' && <TimingField value={timing} onChange={setTiming} />}
      <RateConventionField value={rc} onChange={setRc} />
      {variant === 'corpus-sip' && (
        <>
          <ListEditor
            legend="SIP pauses"
            empty="No pauses. Add one to skip contributions for a range of months."
            rows={pauses}
            onChange={setPauses}
            newRow={{ from: '13', to: '18' }}
            errorFor={(i) => (engineErrorField === `pauses.${i}` && result && !result.ok ? result.error.message : null)}
            fields={[
              { key: 'from', label: 'From month' },
              { key: 'to', label: 'To month' },
            ]}
          />
          <ListEditor
            legend="One-time top-ups"
            empty="No top-ups. Add one for a bonus or windfall."
            rows={topUps}
            onChange={setTopUps}
            newRow={{ month: '12', amount: '50000' }}
            errorFor={(i) => (engineErrorField?.startsWith(`topUps.${i}`) && result && !result.ok ? result.error.message : null)}
            fields={[
              { key: 'month', label: 'Month' },
              { key: 'amount', label: 'Amount (₹)' },
            ]}
          />
        </>
      )}
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const s = result.value.summary;
    const yearly = result.value.yearly;
    results = (
      <>
        <KpiGrid>
          <KpiCard label="Total invested" value={s.totalInvested} testId="kpi-invested" />
          <KpiCard label="Projected value" value={s.finalValue} emphasis testId="kpi-value" />
          <KpiCard label={s.gains < 0 ? 'Projected loss' : 'Projected gain'} value={s.gains} testId="kpi-gain" />
          <KpiCard label="In today's rupees" value={s.realFinalValue} sub={`Deflated at ${f.raw.i}% a year`} testId="kpi-real" />
          {variant === 'step-up-sip' && <KpiCard label="Monthly SIP in final year" value={s.lastMonthlyContribution} />}
        </KpiGrid>
        <ConventionsLine items={conventions} />
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          {variant === 'lumpsum' ? (
            <>
              A one-time investment of <Money value={s.totalInvested} />
            </>
          ) : (
            <>
              Investing a total of <Money value={s.totalInvested} />
            </>
          )}{' '}
          over {f.raw.y} years at an assumed {f.raw.r}% a year projects to <Money value={s.finalValue} className="font-semibold" />, a {s.gains < 0 ? 'loss' : 'gain'} of{' '}
          <Money value={s.gains} />. In today&apos;s rupees that is about <Money value={s.realFinalValue} />.
        </p>
        <Tabs
          label="Result views"
          tabs={[
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <MoneyLineChart<AccumulationRow>
                  data={yearly}
                  xKey="month"
                  xLabel={shortMonthLabel}
                  title="Projected value, invested amount and today's-rupee value by year"
                  summary={
                    <>
                      The projected value reaches <Money value={s.finalValue} /> against <Money value={s.totalInvested} /> invested. The table tabs list every year and month.
                    </>
                  }
                  series={[
                    { key: 'value', label: 'Projected value', color: 'var(--chart-1)' },
                    { key: 'invested', label: 'Invested', color: 'var(--chart-2)', dashed: true },
                    { key: 'realValue', label: "Today's rupees", color: 'var(--chart-3)' },
                  ]}
                />
              ),
            },
            { id: 'yearly', label: 'Yearly table', content: <ScheduleTable rows={yearly} caption="Year-by-year projection" /> },
            { id: 'monthly', label: 'Monthly table', content: <ScheduleTable rows={result.value.rows} caption="Month-by-month projection" monthly /> },
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
        onReset={reset}
        actions={
          <>
            <ShareButton path={path} query={query} />
            <SavePlanButton calculator={TITLES[variant]} path={path} query={query} defaultName={TITLES[variant]} />
            <ExportButtons
              fileBase={variant}
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildAccumulationReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <MethodNote>
        <ul>
          <li>Each month the balance grows at the monthly rate. With end-of-month timing the contribution is added after growth; with start-of-month timing it is added before growth.</li>
          <li>The monthly rate comes from your annual return using the rate convention you chose, shown beside the results.</li>
          {variant === 'step-up-sip' && <li>Step-ups apply at the start of each contribution year (months 13, 25, 37, …). A cap stops further increases.</li>}
          {variant === 'corpus-sip' && <li>Paused months contribute nothing. Top-ups use the same timing as regular contributions in their month.</li>}
          <li>Returns are constant every month. Real markets are volatile, so actual outcomes will differ. Try the Monte Carlo simulator to see a range.</li>
          <li>Expense ratios, exit loads, taxes and stamp duty are not deducted.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function ScheduleTable({ rows, caption, monthly }: { rows: AccumulationRow[]; caption: string; monthly?: boolean }) {
  return (
    <DataTable<AccumulationRow>
      caption={caption}
      rows={rows}
      rowKey={(r) => r.month}
      columns={[
        { header: monthly ? 'Month' : 'Period', cell: (r) => (monthly ? r.month : monthLabel(r.month)) },
        ...(monthly
          ? [
              { header: 'Contribution', numeric: true, cell: (r: AccumulationRow) => formatINR(r.contribution, 0) },
              { header: 'Top-up', numeric: true, cell: (r: AccumulationRow) => formatINR(r.topUp, 0) },
            ]
          : []),
        { header: 'Invested', numeric: true, cell: (r) => formatINR(r.invested, 0) },
        { header: 'Value', numeric: true, cell: (r) => formatINR(r.value, 0) },
        { header: 'Gain', numeric: true, cell: (r) => formatINR(r.gains, 0) },
        { header: "Today's ₹", numeric: true, cell: (r) => formatINR(r.realValue, 0) },
      ]}
    />
  );
}

function ListEditor<R extends object>({
  legend,
  empty,
  rows,
  onChange,
  newRow,
  fields,
  errorFor,
}: {
  legend: string;
  empty: string;
  rows: R[];
  onChange: (rows: R[]) => void;
  newRow: R;
  fields: Array<{ key: keyof R & string; label: string }>;
  errorFor: (i: number) => string | null;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {rows.length === 0 && <p className="text-xs text-muted">{empty}</p>}
      {rows.map((row, i) => {
        const e = errorFor(i);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-end gap-2">
              {fields.map((fd) => {
                const raw = String(row[fd.key]);
                const bad = parseNumberInput(raw) === null;
                return (
                  <label key={fd.key} className="flex min-w-0 flex-1 flex-col text-xs">
                    <span>
                      {fd.label} <span className="sr-only">for row {i + 1}</span>
                    </span>
                    <input
                      inputMode="decimal"
                      value={raw}
                      aria-invalid={bad || e ? true : undefined}
                      onChange={(ev) => onChange(rows.map((r, j) => (j === i ? { ...r, [fd.key]: ev.target.value } : r)))}
                      className={`num mt-1 w-full rounded-md border bg-surface px-2 py-1.5 text-sm ${bad || e ? 'border-danger' : 'border-line-strong'}`}
                    />
                  </label>
                );
              })}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong hover:bg-surface-2"
                aria-label={`Remove ${legend.toLowerCase()} row ${i + 1}`}
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </div>
            {e && <p className="text-sm font-medium text-danger">{e}</p>}
          </div>
        );
      })}
      <Button variant="ghost" onClick={() => onChange([...rows, newRow])} className="px-2">
        <Plus aria-hidden="true" size={16} /> Add
      </Button>
    </fieldset>
  );
}
