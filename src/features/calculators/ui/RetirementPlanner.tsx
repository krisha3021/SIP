'use client';

import { useMemo, useState } from 'react';
import { buildRetirementReport, planRetirement, type AccumulationRow, type ContributionTiming, type RateConvention, type RetirementInput, type SwpRow } from '@/contracts';
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
import { formatINR, formatPct } from '@/lib/format/inr';
import { buildQuery, dropParams, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { monthLabel, shortMonthLabel } from './format';

const DEFAULTS = { cur: 32, ret: 60, until: 85, m: 25000, c: 500000, s: 5, pre: 11, post: 7, i: 6, wi: '' } as const satisfies Record<string, number | ''>;
/** Desired income is kept out of share links and saved plans. */
const PRIVATE_DEFAULTS = { inc: 60000 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = {
  currentAge: 'cur',
  retirementAge: 'ret',
  planUntilAge: 'until',
  monthlyContribution: 'm',
  initialCorpus: 'c',
  'stepUp.value': 's',
  preRetirementReturnPct: 'pre',
  postRetirementReturnPct: 'post',
  inflationPct: 'i',
  desiredMonthlyIncomeToday: 'inc',
  withdrawalIncreasePct: 'wi',
};
type Order = 'withdraw-then-grow' | 'grow-then-withdraw';

export function RetirementPlanner({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS, params);
  const p = useFields(PRIVATE_DEFAULTS);
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));
  const [order, setOrder] = useState<Order>(optionFromParams(params, 'o', ['withdraw-then-grow', 'grow-then-withdraw'] as const, 'withdraw-then-grow'));
  const v = f.values;

  const input: RetirementInput | null = useMemo(() => {
    if (!f.allParsed || !p.allParsed) return null;
    return {
      currentAge: v.cur!,
      retirementAge: v.ret!,
      planUntilAge: v.until!,
      monthlyContribution: v.m!,
      initialCorpus: v.c!,
      stepUp: v.s ? { mode: 'percent', value: v.s } : { mode: 'none' },
      preRetirementReturnPct: v.pre!,
      postRetirementReturnPct: v.post!,
      inflationPct: v.i!,
      desiredMonthlyIncomeToday: p.values.inc!,
      ...(v.wi !== null ? { withdrawalIncreasePct: v.wi } : {}),
      timing,
      rateConvention: rc,
      withdrawalOrder: order,
    };
  }, [f.allParsed, p.allParsed, v, p.values, timing, rc, order]);

  const result = useMemo(() => (input ? planRetirement(input) : null), [input]);
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: string) =>
    (f.parseErrors as Record<string, string | undefined>)[k] ?? (p.parseErrors as Record<string, string | undefined>)[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...f.raw, t: timing, rc, o: order });
  // Retirement savings already held stay out of public share links; local saves keep them.
  const shareQuery = dropParams(query, ['c']);
  const path = '/calculators/retirement-planner';

  const form = (
    <>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Ages</legend>
        <NumberField name="cur" label="Current age" value={f.raw.cur} onChange={(x) => f.set('cur', x)} sliderMin={18} sliderMax={75} suffix="years" error={err('cur')} />
        <NumberField name="ret" label="Retirement age" value={f.raw.ret} onChange={(x) => f.set('ret', x)} sliderMin={30} sliderMax={80} suffix="years" error={err('ret')} />
        <NumberField
          name="until"
          label="Plan withdrawals until age"
          value={f.raw.until}
          onChange={(x) => f.set('until', x)}
          sliderMin={60}
          sliderMax={105}
          suffix="years"
          error={err('until')}
          hint="A planning assumption, not a prediction of life expectancy."
        />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Building the corpus</legend>
        <NumberField name="c" label="Retirement savings today" value={f.raw.c} onChange={(x) => f.set('c', x)} sliderMin={0} sliderMax={20_000_000} step={50000} prefix="₹" error={err('c')} formatValue={(n) => formatINR(n, 0)} />
        <NumberField name="m" label="Monthly SIP" value={f.raw.m} onChange={(x) => f.set('m', x)} sliderMin={0} sliderMax={300_000} step={1000} prefix="₹" error={err('m')} formatValue={(n) => formatINR(n, 0)} />
        <NumberField name="s" label="Annual step-up of the SIP" value={f.raw.s} onChange={(x) => f.set('s', x)} sliderMin={0} sliderMax={20} suffix="%" error={err('s')} />
        <NumberField name="pre" label="Return before retirement" value={f.raw.pre} onChange={(x) => f.set('pre', x)} sliderMin={0} sliderMax={18} step={0.5} suffix="%" error={err('pre')} />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Living on it</legend>
        <NumberField
          name="inc"
          label="Monthly income you want, in today's rupees"
          value={p.raw.inc}
          onChange={(x) => p.set('inc', x)}
          sliderMin={5000}
          sliderMax={500_000}
          step={5000}
          prefix="₹"
          error={err('inc')}
          formatValue={(n) => formatINR(n, 0)}
          hint="Not included in share links or saved plans."
        />
        <NumberField name="post" label="Return after retirement" value={f.raw.post} onChange={(x) => f.set('post', x)} sliderMin={0} sliderMax={15} step={0.5} suffix="%" error={err('post')} />
        <NumberField name="i" label="Inflation" value={f.raw.i} onChange={(x) => f.set('i', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('i')} />
        <NumberField name="wi" label="Yearly rise in withdrawals (optional)" value={f.raw.wi} onChange={(x) => f.set('wi', x)} sliderMin={0} sliderMax={12} noSlider suffix="%" error={err('wi')} hint="Leave empty to use inflation." />
        <Choice<Order>
          legend="Order within each month after retirement"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'withdraw-then-grow', label: 'Withdraw, then grow' },
            { value: 'grow-then-withdraw', label: 'Grow, then withdraw' },
          ]}
        />
      </fieldset>
      <TimingField value={timing} onChange={setTiming} />
      <RateConventionField value={rc} onChange={setRc} />
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const r = result.value;
    const short = r.surplusOrShortfall < 0;
    results = (
      <>
        {r.depletionAge !== null ? (
          <Notice tone="warning" title={`The corpus runs out at about age ${r.depletionAge.toFixed(1)}`} role="status">
            That is before age {f.raw.until}. To close the gap, add about <Money value={r.additionalMonthlyContributionNeeded} /> a month to your SIP now, with the same step-up.
          </Notice>
        ) : (
          <Notice tone="info" title={`Withdrawals last until age ${f.raw.until} under these assumptions`}>
            This holds only if the assumed returns are earned every month.
          </Notice>
        )}
        <KpiGrid>
          <KpiCard label="Corpus at retirement" value={r.corpusAtRetirement} emphasis testId="kpi-corpus" />
          <KpiCard label="Corpus needed at retirement" value={r.requiredCorpus} testId="kpi-required" />
          <KpiCard label={short ? 'Shortfall at retirement' : 'Surplus at retirement'} value={r.surplusOrShortfall} />
          <KpiCard label="First monthly withdrawal" value={r.firstMonthlyWithdrawal} sub={`Your target in today's rupees, inflated to age ${f.raw.ret}; rises ${formatPct(r.withdrawalIncreasePct, 1)} a year`} />
          <KpiCard label="Extra monthly SIP needed" value={r.additionalMonthlyContributionNeeded} />
          <KpiCard label="Total withdrawn" value={r.swp.totalWithdrawn} />
        </KpiGrid>
        <ConventionsLine items={[TIMING_LABEL[timing], CONVENTION_LABEL[rc], order === 'withdraw-then-grow' ? 'After retirement: withdraw, then grow' : 'After retirement: grow, then withdraw']} />
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          Saving until age {f.raw.ret} projects a corpus of <Money value={r.corpusAtRetirement} className="font-semibold" /> against <Money value={r.requiredCorpus} /> needed to pay your
          income until age {f.raw.until}. {short ? <>The shortfall is <Money value={-r.surplusOrShortfall} />.</> : <>That leaves a surplus of <Money value={r.surplusOrShortfall} />.</>}
        </p>
        <Tabs
          label="Retirement views"
          tabs={[
            {
              id: 'acc',
              label: 'Building (chart)',
              content: (
                <MoneyLineChart<AccumulationRow>
                  data={r.accumulation.yearly}
                  xKey="month"
                  xLabel={shortMonthLabel}
                  title={`Corpus from age ${f.raw.cur} to ${f.raw.ret}`}
                  summary={<>The corpus reaches <Money value={r.corpusAtRetirement} /> at retirement.</>}
                  series={[
                    { key: 'value', label: 'Projected corpus', color: 'var(--chart-1)' },
                    { key: 'invested', label: 'Invested', color: 'var(--chart-2)', dashed: true },
                  ]}
                />
              ),
            },
            {
              id: 'wd',
              label: 'Withdrawing (chart)',
              content: (
                <MoneyLineChart<SwpRow>
                  data={r.swp.yearly}
                  xKey="month"
                  xLabel={shortMonthLabel}
                  title={`Balance after retirement (years since age ${f.raw.ret})`}
                  summary={<>{r.depletionAge === null ? <>The balance lasts the full period, ending at <Money value={r.swp.remainingCorpus} />.</> : <>The balance reaches zero at about age {r.depletionAge.toFixed(1)}.</>}</>}
                  series={[
                    { key: 'closingBalance', label: 'Balance', color: 'var(--chart-1)' },
                    { key: 'cumulativeWithdrawn', label: 'Cumulative withdrawn', color: 'var(--chart-2)', dashed: true },
                  ]}
                />
              ),
            },
            {
              id: 'tables',
              label: 'Tables',
              content: (
                <div className="space-y-4">
                  <DataTable<AccumulationRow>
                    caption="Building phase, by year"
                    rows={r.accumulation.yearly}
                    rowKey={(x) => x.month}
                    columns={[
                      { header: 'Period', cell: (x) => monthLabel(x.month) },
                      { header: 'Invested', numeric: true, cell: (x) => formatINR(x.invested, 0) },
                      { header: 'Corpus', numeric: true, cell: (x) => formatINR(x.value, 0) },
                      { header: "Today's ₹", numeric: true, cell: (x) => formatINR(x.realValue, 0) },
                    ]}
                  />
                  <DataTable<SwpRow>
                    caption="Withdrawal phase, by year after retirement"
                    rows={r.swp.yearly}
                    rowKey={(x) => x.month}
                    columns={[
                      { header: 'Period after retirement', cell: (x) => monthLabel(x.month) },
                      { header: 'Monthly withdrawal', numeric: true, cell: (x) => formatINR(x.actualWithdrawal, 0) },
                      { header: 'Balance', numeric: true, cell: (x) => formatINR(x.closingBalance, 0) },
                      { header: "Balance, today's ₹", numeric: true, cell: (x) => formatINR(x.realClosingBalance, 0) },
                    ]}
                  />
                </div>
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
          p.reset();
          setTiming('end');
          setRc('effective');
          setOrder('withdraw-then-grow');
        }}
        actions={
          <>
            <ShareButton path={path} query={shareQuery} />
            <SavePlanButton calculator="Retirement planner" path={path} query={query} defaultName="Retirement plan" />
            <ExportButtons
              fileBase="retirement-planner"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildRetirementReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <p className="text-sm text-muted">
        Share links leave out your current retirement savings and the income you want; saved plans (kept only in this browser) include your savings but not the
        income.
      </p>
      <MethodNote>
        <ul>
          <li>The corpus is projected month by month until retirement, with the same conventions as the SIP calculator.</li>
          <li>Your desired income is inflated to the retirement date and becomes the first withdrawal; withdrawals then rise once a year.</li>
          <li>The corpus needed is the present value of every withdrawal until the plan-until age, at the post-retirement return.</li>
          <li>Returns are constant. Sequence-of-returns risk, taxes and fees are not modelled.</li>
        </ul>
      </MethodNote>
    </div>
  );
}
