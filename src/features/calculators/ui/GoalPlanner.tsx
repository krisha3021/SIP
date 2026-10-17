'use client';

import { useMemo, useState } from 'react';
import { buildGoalReport, planGoal, projectAccumulation, type AccumulationRow, type ContributionTiming, type GoalInput, type RateConvention } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { Notice } from '@/components/ui/primitives';
import { MoneyLineChart } from '@/components/charts/Charts';
import { CalculatorLayout, CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { CONVENTION_LABEL, RateConventionField, TIMING_LABEL, TimingField } from '@/components/calculator/ConventionFields';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { formatINR } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { monthLabel, shortMonthLabel } from './format';

const DEFAULTS = { g: 5000000, y: 15, r: 11, i: 6, c: 200000, cur: 10000, s: 0 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = {
  targetAmount: 'g',
  months: 'y',
  annualReturnPct: 'r',
  inflationPct: 'i',
  initialCorpus: 'c',
  currentMonthlyContribution: 'cur',
  'stepUp.value': 's',
};

export function GoalPlanner({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS, params);
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));
  const [basis, setBasis] = useState<'today' | 'future'>(optionFromParams(params, 'gb', ['today', 'future'] as const, 'today'));
  const v = f.values;

  const input: GoalInput | null = useMemo(() => {
    if (!f.allParsed) return null;
    return {
      targetAmount: v.g!,
      targetIsInTodaysRupees: basis === 'today',
      months: v.y! * 12,
      annualReturnPct: v.r!,
      inflationPct: v.i!,
      timing,
      rateConvention: rc,
      initialCorpus: v.c!,
      stepUp: v.s ? { mode: 'percent', value: v.s } : { mode: 'none' },
      currentMonthlyContribution: v.cur!,
    };
  }, [f.allParsed, v, basis, timing, rc]);

  const result = useMemo(() => (input ? planGoal(input) : null), [input]);
  // The path chart reruns the forward engine at the required contribution (a round trip through the same conventions).
  const path = useMemo(() => {
    if (!input || !result?.ok) return null;
    const p = projectAccumulation({
      monthlyContribution: result.value.requiredMonthlyContribution,
      initialCorpus: input.initialCorpus,
      annualReturnPct: input.annualReturnPct,
      months: input.months,
      timing: input.timing,
      rateConvention: input.rateConvention,
      stepUp: input.stepUp,
      inflationPct: input.inflationPct,
    });
    return p.ok ? p.value : null;
  }, [input, result]);

  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: keyof typeof DEFAULTS) => f.parseErrors[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...f.raw, t: timing, rc, gb: basis });
  const conventions = [TIMING_LABEL[timing], CONVENTION_LABEL[rc], basis === 'today' ? `Target in today's rupees, inflated at ${f.raw.i}% a year` : 'Target in future (nominal) rupees'];

  const form = (
    <>
      <NumberField name="g" label="Goal amount" value={f.raw.g} onChange={(x) => f.set('g', x)} sliderMin={100000} sliderMax={50_000_000} step={100000} prefix="₹" error={err('g')} hint={v.g !== null ? <Money value={v.g} /> : undefined} formatValue={(n) => formatINR(n, 0)} />
      <Choice
        legend="The goal amount is in"
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'today', label: "Today's rupees", description: 'Grown by inflation' },
          { value: 'future', label: 'Future rupees', description: 'Used as entered' },
        ]}
      />
      <NumberField name="y" label="Years to goal" value={f.raw.y} onChange={(x) => f.set('y', x)} sliderMin={1} sliderMax={40} suffix="years" error={err('y')} />
      <NumberField name="r" label="Expected annual return" value={f.raw.r} onChange={(x) => f.set('r', x)} sliderMin={0} sliderMax={20} step={0.5} suffix="%" error={err('r')} />
      <NumberField name="i" label="Inflation" value={f.raw.i} onChange={(x) => f.set('i', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('i')} />
      <NumberField name="c" label="Amount already saved for this goal" value={f.raw.c} onChange={(x) => f.set('c', x)} sliderMin={0} sliderMax={10_000_000} step={10000} prefix="₹" error={err('c')} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="cur" label="Your current monthly SIP for this goal" value={f.raw.cur} onChange={(x) => f.set('cur', x)} sliderMin={0} sliderMax={200_000} step={500} prefix="₹" error={err('cur')} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="s" label="Annual step-up of the SIP" value={f.raw.s} onChange={(x) => f.set('s', x)} sliderMin={0} sliderMax={25} suffix="%" error={err('s')} hint="0 for a level SIP." />
      <TimingField value={timing} onChange={setTiming} />
      <RateConventionField value={rc} onChange={setRc} />
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const g = result.value;
    results = (
      <>
        {g.alreadyFunded && (
          <Notice tone="info" title="Your existing savings already reach the goal under these assumptions">
            No further contribution is needed if the assumed return holds every year.
          </Notice>
        )}
        <KpiGrid>
          <KpiCard label="Required monthly SIP" value={g.requiredMonthlyContribution} emphasis testId="kpi-required" sub={v.s ? `Starting amount, rising ${f.raw.s}% a year` : 'Level each month'} />
          <KpiCard label="Goal at the horizon" value={g.futureTarget} sub={basis === 'today' ? 'Nominal, after inflation' : 'As entered'} />
          <KpiCard label="Projected with your current SIP" value={g.projectedWithCurrent} />
          <KpiCard label="Shortfall with current SIP" value={g.shortfallWithCurrent} sub={g.additionalMonthlyNeeded > 0 ? <>Add about <Money value={g.additionalMonthlyNeeded} /> a month</> : 'On track under these assumptions'} />
          <KpiCard label="Existing savings at the horizon" value={g.corpusFutureValue} />
          {path && <KpiCard label="Total invested at required SIP" value={path.summary.totalInvested} />}
        </KpiGrid>
        <ConventionsLine items={conventions} />
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          To reach <Money value={g.futureTarget} /> in {f.raw.y} years at an assumed {f.raw.r}% a year, you would need to invest about{' '}
          <Money value={g.requiredMonthlyContribution} className="font-semibold" /> a month{v.s ? `, rising ${f.raw.s}% each year` : ''}. With your current SIP the projected
          shortfall is <Money value={g.shortfallWithCurrent} />.
        </p>
        {path && (
          <Tabs
            label="Goal path views"
            tabs={[
              {
                id: 'chart',
                label: 'Chart',
                content: (
                  <MoneyLineChart<AccumulationRow>
                    data={path.yearly}
                    xKey="month"
                    xLabel={shortMonthLabel}
                    title="Projected path at the required SIP"
                    summary={<>At the required SIP, the projection reaches <Money value={path.summary.finalValue} />, matching the goal.</>}
                    series={[
                      { key: 'value', label: 'Projected value', color: 'var(--chart-1)' },
                      { key: 'invested', label: 'Invested', color: 'var(--chart-2)', dashed: true },
                    ]}
                  />
                ),
              },
              {
                id: 'table',
                label: 'Yearly table',
                content: (
                  <DataTable<AccumulationRow>
                    caption="Year-by-year path at the required SIP"
                    rows={path.yearly}
                    rowKey={(r) => r.month}
                    columns={[
                      { header: 'Period', cell: (r) => monthLabel(r.month) },
                      { header: 'Invested', numeric: true, cell: (r) => formatINR(r.invested, 0) },
                      { header: 'Value', numeric: true, cell: (r) => formatINR(r.value, 0) },
                      { header: "Today's ₹", numeric: true, cell: (r) => formatINR(r.realValue, 0) },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
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
          setRc('effective');
          setBasis('today');
        }}
        actions={
          <>
            <ShareButton path="/calculators/goal-planner" query={query} />
            <SavePlanButton calculator="Goal planner" path="/calculators/goal-planner" query={query} defaultName="Goal plan" />
            <ExportButtons
              fileBase="goal-planner"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildGoalReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <MethodNote>
        <ul>
          <li>The goal is inflated to the horizon when entered in today&apos;s rupees. Existing savings grow at the assumed return.</li>
          <li>The required SIP uses the same timing and rate convention as the SIP calculator, so entering it there reproduces the goal.</li>
          <li>A constant return is assumed. Consider a margin of safety, and see the Monte Carlo simulator for a range of outcomes.</li>
        </ul>
      </MethodNote>
    </div>
  );
}
