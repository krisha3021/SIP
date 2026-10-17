'use client';

import { useMemo, useState } from 'react';
import { simulateSwp, type RateConvention, type SwpInput, type SwpRow } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { Notice } from '@/components/ui/primitives';
import { MoneyLineChart } from '@/components/charts/Charts';
import { CalculatorLayout, CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { CONVENTION_LABEL, RateConventionField } from '@/components/calculator/ConventionFields';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { formatINR, formatPct } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { swpReport } from './reports';
import { monthLabel, shortMonthLabel } from './format';

const DEFAULTS = { c: 10000000, w: 50000, r: 8, inc: 5, i: 6, h: 40 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = { corpus: 'c', monthlyWithdrawal: 'w', annualReturnPct: 'r', annualIncreasePct: 'inc', inflationPct: 'i', horizonMonths: 'h' };
type Order = 'grow-then-withdraw' | 'withdraw-then-grow';
const ORDER_LABEL: Record<Order, string> = {
  'grow-then-withdraw': 'Balance grows for the month, then the withdrawal is paid',
  'withdraw-then-grow': 'Withdrawal is paid at the start of the month, then the balance grows',
};

export function SwpCalculator({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS, params);
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));
  const [order, setOrder] = useState<Order>(optionFromParams(params, 'o', ['grow-then-withdraw', 'withdraw-then-grow'] as const, 'grow-then-withdraw'));
  const v = f.values;

  const input: SwpInput | null = useMemo(
    () =>
      f.allParsed
        ? { corpus: v.c!, monthlyWithdrawal: v.w!, annualReturnPct: v.r!, rateConvention: rc, annualIncreasePct: v.inc!, inflationPct: v.i!, order, horizonMonths: v.h! * 12 }
        : null,
    [f.allParsed, v, rc, order],
  );
  const result = useMemo(() => (input ? simulateSwp(input) : null), [input]);
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: keyof typeof DEFAULTS) => f.parseErrors[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...f.raw, rc, o: order });

  const form = (
    <>
      <NumberField name="c" label="Corpus at the start" value={f.raw.c} onChange={(x) => f.set('c', x)} sliderMin={100000} sliderMax={100_000_000} step={100000} prefix="₹" error={err('c')} hint={v.c !== null ? <Money value={v.c} /> : undefined} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="w" label="Monthly withdrawal (first year)" value={f.raw.w} onChange={(x) => f.set('w', x)} sliderMin={1000} sliderMax={500_000} step={1000} prefix="₹" error={err('w')} formatValue={(n) => formatINR(n, 0)} />
      <NumberField name="inc" label="Yearly increase in withdrawal" value={f.raw.inc} onChange={(x) => f.set('inc', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('inc')} hint="Often set near expected inflation, to keep spending power." />
      <NumberField name="r" label="Expected annual return on the corpus" value={f.raw.r} onChange={(x) => f.set('r', x)} sliderMin={0} sliderMax={15} step={0.5} suffix="%" error={err('r')} />
      <NumberField name="i" label="Inflation (for today's rupees)" value={f.raw.i} onChange={(x) => f.set('i', x)} sliderMin={0} sliderMax={12} step={0.5} suffix="%" error={err('i')} />
      <NumberField name="h" label="Years to simulate" value={f.raw.h} onChange={(x) => f.set('h', x)} sliderMin={1} sliderMax={60} suffix="years" error={err('h')} />
      <Choice
        legend="Order within each month"
        value={order}
        onChange={setOrder}
        options={[
          { value: 'grow-then-withdraw', label: 'Grow, then withdraw' },
          { value: 'withdraw-then-grow', label: 'Withdraw, then grow' },
        ]}
      />
      <RateConventionField value={rc} onChange={setRc} />
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const s = result.value;
    const yearly = s.rows.filter((r) => r.month % 12 === 0 || r.month === s.rows.length);
    results = (
      <>
        {s.depletionMonth !== null ? (
          <Notice tone="warning" title={`The corpus runs out in ${monthLabel(s.depletionMonth)} (month ${s.depletionMonth})`} role="status">
            {s.finalPartialWithdrawal !== null ? (
              <p>
                Full withdrawals are paid for {s.fullyFundedMonths} months. The last payment is a partial <Money value={s.finalPartialWithdrawal} />.
              </p>
            ) : (
              <p>Full withdrawals are paid for {s.fullyFundedMonths} months, after which the balance is zero.</p>
            )}
          </Notice>
        ) : (
          <Notice tone="info" title={`The corpus lasts the full ${f.raw.h} years simulated`}>
            This holds only if the assumed return is earned every month. A poor run of returns early on can shorten it.
          </Notice>
        )}
        <KpiGrid>
          <KpiCard label="Total withdrawn" value={s.totalWithdrawn} emphasis testId="kpi-withdrawn" />
          <KpiCard label="Corpus left at the end" value={s.remainingCorpus} />
          <KpiCard label="Corpus left, today's rupees" value={s.realRemainingCorpus} />
          <KpiCard label="Initial withdrawal rate" value={`${formatPct(s.initialWithdrawalRatePct, 2)} a year`} sub="First-year withdrawals as a share of the starting corpus" />
        </KpiGrid>
        <ConventionsLine items={[ORDER_LABEL[order], CONVENTION_LABEL[rc], `Withdrawals rise ${f.raw.inc}% at the start of each year`]} />
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          Starting with <Money value={v.c!} /> and withdrawing <Money value={v.w!} /> a month (rising {f.raw.inc}% a year) at an assumed {f.raw.r}% return, the plan pays out{' '}
          <Money value={s.totalWithdrawn} className="font-semibold" /> in total and {s.depletionMonth === null ? <>ends with <Money value={s.remainingCorpus} /> left.</> : <>runs out in {monthLabel(s.depletionMonth)}.</>}
        </p>
        <Tabs
          label="Withdrawal views"
          tabs={[
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <MoneyLineChart<SwpRow>
                  data={yearly}
                  xKey="month"
                  xLabel={shortMonthLabel}
                  title="Corpus balance and cumulative withdrawals by year"
                  summary={<>The balance {s.depletionMonth === null ? 'remains positive throughout' : `reaches zero in ${monthLabel(s.depletionMonth)}`}. The tables list every year and month.</>}
                  series={[
                    { key: 'closingBalance', label: 'Corpus balance', color: 'var(--chart-1)' },
                    { key: 'cumulativeWithdrawn', label: 'Cumulative withdrawn', color: 'var(--chart-2)', dashed: true },
                    { key: 'realClosingBalance', label: "Balance in today's ₹", color: 'var(--chart-3)' },
                  ]}
                />
              ),
            },
            { id: 'yearly', label: 'Yearly table', content: <SwpTable rows={yearly} caption="Year-end balances" /> },
            { id: 'monthly', label: 'Monthly ledger', content: <SwpTable rows={s.rows} caption="Monthly withdrawal ledger" monthly /> },
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
          setRc('effective');
          setOrder('grow-then-withdraw');
        }}
        actions={
          <>
            <ShareButton path="/calculators/swp" query={query} />
            <SavePlanButton calculator="SWP" path="/calculators/swp" query={query} defaultName="Withdrawal plan" />
            <ExportButtons
              fileBase="swp"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok) throw new Error('No result');
                return swpReport(
                  [
                    ['Starting corpus (₹)', v.c],
                    ['Monthly withdrawal, first year (₹)', v.w],
                    ['Yearly increase in withdrawal (%)', v.inc],
                    ['Expected annual return (%)', v.r],
                    ['Inflation (%)', v.i],
                    ['Years simulated', v.h],
                  ],
                  [
                    ['Order within month', ORDER_LABEL[order]],
                    ['Rate convention', CONVENTION_LABEL[rc]],
                  ],
                  result.value,
                );
              }}
            />
          </>
        }
      />
      <MethodNote>
        <ul>
          <li>The plan is simulated month by month. When the balance cannot cover a withdrawal, the partial amount actually available is paid and recorded, and the plan ends.</li>
          <li>Withdrawals rise once a year (months 13, 25, …) by the percentage you set.</li>
          <li>No withdrawal rate is &quot;safe&quot; in general. Rules of thumb such as 4% come from specific historical data and assumptions.</li>
          <li>Taxes on redemptions, exit loads and sequence-of-returns risk are not modelled.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function SwpTable({ rows, caption, monthly }: { rows: SwpRow[]; caption: string; monthly?: boolean }) {
  return (
    <DataTable<SwpRow>
      caption={caption}
      rows={rows}
      rowKey={(r) => r.month}
      columns={[
        { header: monthly ? 'Month' : 'Period', cell: (r) => (monthly ? r.month : monthLabel(r.month)) },
        ...(monthly
          ? [
              { header: 'Opening', numeric: true, cell: (r: SwpRow) => formatINR(r.openingBalance, 0) },
              { header: 'Growth', numeric: true, cell: (r: SwpRow) => formatINR(r.growth, 0) },
              { header: 'Paid', numeric: true, cell: (r: SwpRow) => formatINR(r.actualWithdrawal, 0) },
            ]
          : []),
        { header: 'Closing balance', numeric: true, cell: (r) => formatINR(r.closingBalance, 0) },
        { header: 'Cumulative paid', numeric: true, cell: (r) => formatINR(r.cumulativeWithdrawn, 0) },
        { header: "Balance, today's ₹", numeric: true, cell: (r) => formatINR(r.realClosingBalance, 0) },
      ]}
    />
  );
}
