'use client';

import { useId, useMemo, useState } from 'react';
import { backtestSipOnNav, type BacktestRow, type NavBacktestInput } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Badge, Button, Notice } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { MoneyLineChart } from '@/components/charts/Charts';
import { CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { ExportButtons } from '@/components/calculator/ActionButtons';
import { formatINR, formatIndianNumber, formatPct } from '@/lib/format/inr';
import { useFields } from '@/features/calculators/ui/useFields';
import { backtestReport } from '@/features/calculators/ui/reports';
import { formatCount, formatShare } from '@/features/calculators/ui/format';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { useNav } from '@/features/funds/ui/FundDetail';
import { ProvenancePanel } from '@/features/funds/ui/ProvenancePanel';
import type { NavResponse } from '@/features/funds/ui/api';

export function HistoricalBacktest({ initialScheme }: { initialScheme: string | null }) {
  const [scheme, setScheme] = useState<string | null>(initialScheme);
  if (!scheme) {
    return (
      <div className="space-y-4">
        <p>Choose a scheme to replay a SIP on its published NAVs.</p>
        <FundSearch onPick={(r) => setScheme(String(r.schemeCode))} label="Find a scheme to backtest" />
      </div>
    );
  }
  return <BacktestForScheme key={scheme} scheme={scheme} onChange={() => setScheme(null)} />;
}

function BacktestForScheme({ scheme, onChange }: { scheme: string; onChange: () => void }) {
  const state = useNav(scheme);
  if (state.status === 'loading')
    return (
      <p role="status" aria-live="polite" className="text-muted">
        Loading NAV history for scheme {scheme}…
      </p>
    );
  if (state.status === 'error')
    return (
      <div role="alert" className="space-y-3">
        <Notice tone="danger" title="NAV data could not be loaded">
          {state.error.message}
        </Notice>
        <Button onClick={onChange}>Choose another scheme</Button>
      </div>
    );
  return <BacktestScreen data={state.data} onChange={onChange} />;
}

const DEFAULTS = { amt: 10000, day: 5, step: 0, init: 0, lag: 7, cost: 0.005 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = { amount: 'amt', sipDay: 'day', annualStepUpPct: 'step', initialInvestment: 'init', maxLagDays: 'lag', transactionCostPct: 'cost' };

function BacktestScreen({ data, onChange }: { data: NavResponse; onChange: () => void }) {
  const f = useFields(DEFAULTS);
  const cov = data.provenance.coverage;
  const defaultStart = cov && cov.from > '2016-01-01' ? cov.from : '2016-01-01';
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(cov?.to ?? '');
  const [freq, setFreq] = useState<'monthly' | 'quarterly'>('monthly');
  const startId = useId();
  const endId = useId();
  const v = f.values;

  const input: NavBacktestInput | null = useMemo(
    () =>
      f.allParsed
        ? { amount: v.amt!, sipDay: v.day!, frequency: freq, startDate: start, endDate: end, annualStepUpPct: v.step!, initialInvestment: v.init!, maxLagDays: v.lag!, transactionCostPct: v.cost! }
        : null,
    [f.allParsed, v, freq, start, end],
  );
  const result = useMemo(() => (input ? backtestSipOnNav(data.navs, input) : null), [input, data.navs]);
  const errField = result && !result.ok ? result.error.field : undefined;
  const err = (k: keyof typeof DEFAULTS) => f.parseErrors[k] ?? (errField && FIELD_MAP[errField] === k && result && !result.ok ? result.error.message : null);
  const dateErr = (k: 'startDate' | 'endDate') => (errField === k && result && !result.ok ? result.error.message : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{data.meta.schemeName}</h2>
          <p className="text-sm text-muted">
            Scheme code {data.meta.schemeCode} · {data.meta.plan === 'Unknown' ? 'Plan not stated' : `${data.meta.plan} plan`} · {data.meta.option === 'Unknown' ? 'Option not stated' : data.meta.option}
          </p>
        </div>
        <Button onClick={onChange}>Choose another scheme</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
        <section aria-labelledby="bt-assumptions" className="space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-5 lg:self-start">
          <h2 id="bt-assumptions" className="text-xl font-semibold">
            Backtest settings
          </h2>
          <NumberField name="amt" label="SIP amount" value={f.raw.amt} onChange={(x) => f.set('amt', x)} sliderMin={500} sliderMax={200_000} step={500} prefix="₹" error={err('amt')} formatValue={(n) => formatINR(n, 0)} />
          <Choice
            legend="Frequency"
            value={freq}
            onChange={setFreq}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
            ]}
          />
          <NumberField name="day" label="SIP day of month" value={f.raw.day} onChange={(x) => f.set('day', x)} sliderMin={1} sliderMax={28} error={err('day')} hint="Days beyond a month's end use its last day." />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={startId} className="block text-sm font-medium">
                Start date
              </label>
              <input
                id={startId}
                type="date"
                value={start}
                min={cov?.from}
                max={cov?.to}
                onChange={(e) => setStart(e.target.value)}
                aria-invalid={dateErr('startDate') ? true : undefined}
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-2 py-2"
              />
            </div>
            <div>
              <label htmlFor={endId} className="block text-sm font-medium">
                End date
              </label>
              <input
                id={endId}
                type="date"
                value={end}
                min={cov?.from}
                max={cov?.to}
                onChange={(e) => setEnd(e.target.value)}
                aria-invalid={dateErr('endDate') ? true : undefined}
                className="mt-1 w-full rounded-md border border-line-strong bg-surface px-2 py-2"
              />
            </div>
            {(dateErr('startDate') || dateErr('endDate')) && <p className="col-span-2 text-sm font-medium text-danger">{dateErr('startDate') ?? dateErr('endDate')}</p>}
            <p className="col-span-2 text-xs text-muted">
              NAV data available: {cov?.from} to {cov?.to}.
            </p>
          </div>
          <NumberField name="step" label="Annual step-up" value={f.raw.step} onChange={(x) => f.set('step', x)} sliderMin={0} sliderMax={25} suffix="%" error={err('step')} />
          <NumberField name="init" label="Lumpsum on the start date" value={f.raw.init} onChange={(x) => f.set('init', x)} sliderMin={0} sliderMax={1_000_000} step={5000} prefix="₹" error={err('init')} formatValue={(n) => formatINR(n, 0)} />
          <details className="rounded-md border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Allotment rules</summary>
            <div className="mt-3 space-y-4">
              <NumberField name="lag" label="Maximum days to wait for a NAV" value={f.raw.lag} onChange={(x) => f.set('lag', x)} sliderMin={0} sliderMax={31} suffix="days" error={err('lag')} hint="If no NAV is published within this many days, the instalment is skipped and listed." />
              <NumberField name="cost" label="Transaction cost (e.g. stamp duty)" value={f.raw.cost} onChange={(x) => f.set('cost', x)} sliderMin={0} sliderMax={1} step={0.005} suffix="%" error={err('cost')} hint="Stamp duty on mutual fund purchases is 0.005%. The expense ratio is already in the NAV." />
            </div>
          </details>
        </section>

        <section aria-labelledby="bt-results" className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 id="bt-results" className="text-xl font-semibold">
                Results
              </h2>
              <Badge tone="brand">Historical data</Badge>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <ExportButtons
                fileBase={`backtest-${data.meta.schemeCode}`}
                disabled={!result?.ok}
                buildReport={() => {
                  if (!result?.ok) throw new Error('No result');
                  return backtestReport(
                    data.meta.schemeName,
                    [
                      ['Scheme code', data.meta.schemeCode],
                      ['SIP amount (₹)', v.amt],
                      ['Frequency', freq],
                      ['SIP day', v.day],
                      ['Start date', start],
                      ['End date', end],
                      ['Annual step-up (%)', v.step],
                      ['Lumpsum on start date (₹)', v.init],
                      ['Maximum NAV lag (days)', v.lag],
                      ['Transaction cost (%)', v.cost],
                    ],
                    result.value,
                    data.provenance,
                  );
                }}
              />
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>
          {!result || !result.ok ? (
            <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />
          ) : (
            <BacktestResults r={result.value} warnings={result.warnings} />
          )}
          <ProvenancePanel provenance={data.provenance} freshness={data.freshness} servedFrom={data.servedFrom} lastError={data.lastError} droppedRows={data.droppedRows} />
        </section>
      </div>
      <MethodNote>
        <ul>
          <li>Each instalment is allotted at the first observed NAV on or after its scheduled date, within the maximum lag. Otherwise it is skipped and listed.</li>
          <li>The holding is valued at the last observed NAV on or before the end date. XIRR uses actual dates (ACT/365F).</li>
          <li>Maximum drawdown is measured on the NAV itself, so new contributions cannot hide a fall.</li>
          <li>Real allotment depends on cut-off times, payment realisation and AMC processing. Exit loads and taxes are not deducted.</li>
          <li>Past performance does not indicate future results.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function BacktestResults({ r, warnings }: { r: import('@/contracts').NavBacktestResult; warnings: string[] }) {
  return (
    <>
      <KpiGrid>
        <KpiCard label="Total invested" value={r.totalInvested} testId="kpi-invested" />
        <KpiCard label={`Value on ${r.valuationDate}`} value={r.finalValue} emphasis testId="kpi-value" />
        <KpiCard label={r.gain < 0 ? 'Loss' : 'Gain'} value={r.gain} sub={`${formatPct(r.absoluteReturnPct, 2)} absolute`} />
        <KpiCard label="XIRR (annualised)" value={r.xirr.ok ? formatShare(r.xirr.value.rate, 2) : 'Not available'} sub={r.xirr.ok ? (r.xirr.value.multipleRootsPossible ? 'Several rates fit these flows' : 'Money-weighted, actual dates') : r.xirr.error.message} />
        <KpiCard label="Largest NAV fall in the period" value={r.navMaxDrawdownPct === null ? 'Not available' : formatPct(r.navMaxDrawdownPct, 1)} sub="Peak-to-trough on the NAV" />
        <KpiCard label="Units held" value={formatIndianNumber(r.totalUnits, 4)} sub={`Valued at ₹${formatIndianNumber(r.valuationNav, 4)} per unit`} />
      </KpiGrid>
      <ConventionsLine items={['Next-available-NAV allotment', `Valued at the NAV of ${r.valuationDate}`, 'XIRR day count ACT/365F', `${formatCount(r.rows.length)} instalments allotted, ${r.skipped.length} skipped`]} />
      <Warnings warnings={warnings} />
      <Tabs
        label="Backtest views"
        tabs={[
          {
            id: 'chart',
            label: 'Chart',
            content: (
              <MoneyLineChart<BacktestRow>
                data={r.rows}
                xKey="effectiveDate"
                xLabel={(d) => String(d).slice(0, 7)}
                title="Value of holdings and amount invested at each allotment"
                summary={
                  <>
                    <Money value={r.totalInvested} /> invested became <Money value={r.finalValue} /> by {r.valuationDate}.
                  </>
                }
                series={[
                  { key: 'value', label: 'Value at allotment NAV', color: 'var(--chart-1)' },
                  { key: 'cumulativeInvested', label: 'Invested', color: 'var(--chart-2)', dashed: true },
                ]}
              />
            ),
          },
          {
            id: 'table',
            label: 'Instalments',
            content: (
              <DataTable<BacktestRow>
                caption="Every allotted instalment"
                rows={r.rows}
                rowKey={(x) => `${x.kind}-${x.instalment}`}
                columns={[
                  { header: '#', cell: (x) => (x.kind === 'initial' ? 'Lumpsum' : x.instalment) },
                  { header: 'Scheduled', cell: (x) => x.scheduledDate },
                  { header: 'Allotted', cell: (x) => x.effectiveDate },
                  { header: 'NAV (₹)', numeric: true, cell: (x) => formatIndianNumber(x.nav, 4) },
                  { header: 'Amount', numeric: true, cell: (x) => formatINR(x.amount, 0) },
                  { header: 'Units', numeric: true, cell: (x) => formatIndianNumber(x.units, 4) },
                  { header: 'Value', numeric: true, cell: (x) => formatINR(x.value, 0) },
                ]}
              />
            ),
          },
          {
            id: 'skipped',
            label: `Skipped (${r.skipped.length})`,
            content:
              r.skipped.length === 0 ? (
                <p className="text-sm">Every scheduled instalment found a NAV within the allowed lag.</p>
              ) : (
                <DataTable
                  caption="Skipped instalments"
                  rows={r.skipped}
                  rowKey={(s) => s.scheduledDate}
                  columns={[
                    { header: 'Scheduled date', cell: (s) => s.scheduledDate },
                    { header: 'Reason', cell: (s) => (s.reason === 'NO_NAV_WITHIN_LAG' ? 'No NAV within the allowed lag' : 'NAV falls after the end date') },
                  ]}
                />
              ),
          },
        ]}
      />
    </>
  );
}
