'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildCashFlowReport, planCashFlow, type AccumulationRow, type CashFlowInput, type ContributionTiming, type RateConvention } from '@/contracts';
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
import { formatINR, formatINRCompact, formatPct } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';
import { shortMonthLabel } from './format';

/** Never read from or written to a URL: income, expenses, EMIs, investments and savings. */
const PRIVATE_DEFAULTS = { inc: 100000, oth: 0, ess: 45000, disc: 20000, emi: 15000, inv: 10000, efs: 150000 } as const satisfies Record<string, number>;
/** Non-sensitive settings that may be shared. */
const SHAREABLE_DEFAULTS = { efm: 6, pr: 10, py: 10 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = {
  monthlyTakeHomeIncome: 'inc',
  otherMonthlyIncome: 'oth',
  essentialExpenses: 'ess',
  discretionaryExpenses: 'disc',
  loanEmis: 'emi',
  existingMonthlyInvestments: 'inv',
  emergencyFundMonths: 'efm',
  currentEmergencySavings: 'efs',
  'surplusProjection.annualReturnPct': 'pr',
  'surplusProjection.months': 'py',
};

export function CashFlowPlanner({ params }: { params?: SearchParamsRecord }) {
  const p = useFields(PRIVATE_DEFAULTS);
  const s = useFields(SHAREABLE_DEFAULTS, params);
  const [basis, setBasis] = useState<'essential' | 'total'>(optionFromParams(params, 'b', ['essential', 'total'] as const, 'essential'));
  const [project, setProject] = useState(params?.proj === '1');
  const [timing, setTiming] = useState<ContributionTiming>(optionFromParams(params, 't', ['end', 'begin'] as const, 'end'));
  const [rc, setRc] = useState<RateConvention>(optionFromParams(params, 'rc', ['effective', 'nominal'] as const, 'effective'));

  const input: CashFlowInput | null = useMemo(() => {
    if (!p.allParsed || !s.allParsed) return null;
    const v = { ...p.values, ...s.values };
    return {
      monthlyTakeHomeIncome: v.inc!,
      otherMonthlyIncome: v.oth!,
      essentialExpenses: v.ess!,
      discretionaryExpenses: v.disc!,
      loanEmis: v.emi!,
      existingMonthlyInvestments: v.inv!,
      emergencyFundMonths: v.efm!,
      emergencyFundBasis: basis,
      currentEmergencySavings: v.efs!,
      ...(project ? { surplusProjection: { annualReturnPct: v.pr!, months: v.py! * 12, timing, rateConvention: rc } } : {}),
    };
  }, [p.allParsed, s.allParsed, p.values, s.values, basis, project, timing, rc]);

  const result = useMemo(() => (input ? planCashFlow(input) : null), [input]);
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: string) =>
    (p.parseErrors as Record<string, string | undefined>)[k] ?? (s.parseErrors as Record<string, string | undefined>)[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...s.raw, b: basis, proj: project ? 1 : null, t: timing, rc });
  const path = '/calculators/cash-flow';

  const money = (k: keyof typeof PRIVATE_DEFAULTS, label: string, max: number) => (
    <NumberField name={k} label={label} value={p.raw[k]} onChange={(x) => p.set(k, x)} sliderMin={0} sliderMax={max} step={1000} prefix="₹" error={err(k)} formatValue={(n) => formatINR(n, 0)} />
  );

  const form = (
    <>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Monthly money in</legend>
        {money('inc', 'Take-home income (after tax)', 1_000_000)}
        {money('oth', 'Other regular income', 300_000)}
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Monthly money out</legend>
        {money('ess', 'Essential expenses', 500_000)}
        {money('disc', 'Discretionary expenses', 300_000)}
        {money('emi', 'Loan EMIs', 300_000)}
        {money('inv', 'Investments you already make (SIPs etc.)', 300_000)}
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Emergency fund</legend>
        <NumberField name="efm" label="Months of expenses to hold" value={s.raw.efm} onChange={(x) => s.set('efm', x)} sliderMin={1} sliderMax={24} suffix="months" error={err('efm')} hint="Your choice; there is no built-in default." />
        <Choice
          legend="Months of which expenses?"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'essential', label: 'Essentials + EMIs' },
            { value: 'total', label: 'All expenses + EMIs' },
          ]}
        />
        {money('efs', 'Emergency savings you hold now', 5_000_000)}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={project} onChange={(e) => setProject(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
        <span>Also project investing the monthly surplus</span>
      </label>
      {project && (
        <>
          <NumberField name="pr" label="Assumed annual return" value={s.raw.pr} onChange={(x) => s.set('pr', x)} sliderMin={0} sliderMax={15} step={0.5} suffix="%" error={err('pr')} />
          <NumberField name="py" label="Years" value={s.raw.py} onChange={(x) => s.set('py', x)} sliderMin={1} sliderMax={40} suffix="years" error={err('py')} />
          <TimingField value={timing} onChange={setTiming} />
          <RateConventionField value={rc} onChange={setRc} />
        </>
      )}
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const c = result.value;
    const ef = c.emergencyFund;
    const negative = c.surplus < 0;
    results = (
      <>
        {negative && (
          <div role="status">
            <Notice tone="danger" title="Monthly outflows are higher than income">
              You are short by <Money value={-c.surplus} /> a month on these figures. The savings rate below includes this shortfall.
            </Notice>
          </div>
        )}
        <KpiGrid>
          <KpiCard label={negative ? 'Monthly shortfall' : 'Monthly surplus'} value={c.surplus} emphasis testId="kpi-surplus" />
          <KpiCard label="Savings rate" value={c.savingsRatePct === null ? 'Not available' : formatPct(c.savingsRatePct, 1)} sub="Existing investments plus surplus, as a share of income" />
          <KpiCard label="Total monthly income" value={c.totalIncome} />
          <KpiCard label="Total monthly expenses" value={c.totalExpenses} sub="Essentials, discretionary and EMIs" />
          <KpiCard label="EMIs as a share of income" value={c.emiToIncomePct === null ? 'Not available' : formatPct(c.emiToIncomePct, 1)} />
          <KpiCard label="Emergency-fund target" value={ef.target} sub={`${ef.months} months of ${ef.basis === 'essential' ? 'essentials + EMIs' : 'all expenses + EMIs'}`} />
          <KpiCard label="Emergency-fund gap" value={ef.gap} sub={ef.coveragePct === null ? undefined : `${formatPct(ef.coveragePct, 0)} covered`} />
          <KpiCard
            label="Months to close the gap"
            value={ef.monthsToCloseGapFromSurplus === null ? 'Not possible from surplus' : `${ef.monthsToCloseGapFromSurplus} months`}
            sub="Putting the whole surplus aside, no return assumed"
          />
        </KpiGrid>
        <ConventionsLine items={['Monthly figures, after tax', 'No return assumed unless you add a projection', ...(c.surplusProjection ? [TIMING_LABEL[timing], CONVENTION_LABEL[rc]] : [])]} />
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          Income of <Money value={c.totalIncome} /> against committed outflows of <Money value={c.totalCommitted} /> leaves a monthly {negative ? 'shortfall' : 'surplus'} of{' '}
          <Money value={Math.abs(c.surplus)} className="font-semibold" />. Your emergency savings of <Money value={ef.current} /> cover{' '}
          {ef.monthsCovered === null ? 'an unknown number of' : ef.monthsCovered.toFixed(1)} months against a target of <Money value={ef.target} />.
        </p>
        <Tabs
          label="Cash-flow views"
          tabs={[
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <figure className="space-y-2">
                  <div style={{ height: 240 }} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        accessibilityLayer={false}
                        data={[
                          { name: 'Income', value: c.totalIncome },
                          { name: 'Expenses', value: c.totalExpenses },
                          { name: 'All outflows', value: c.totalCommitted },
                        ]}
                        margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} stroke="var(--border-strong)" />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(v: number) => formatINRCompact(v)} width={72} stroke="var(--border-strong)" />
                        <Tooltip formatter={(v) => formatINR(Number(v), 0)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }} />
                        <Bar dataKey="value" name="Monthly amount" fill="var(--chart-1)" isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="text-sm text-muted">
                    <span className="font-semibold text-text">Monthly income against outflows. </span>
                    The table tab lists the same figures.
                  </figcaption>
                </figure>
              ),
            },
            {
              id: 'table',
              label: 'Table',
              content: (
                <DataTable
                  caption="Monthly cash-flow summary"
                  rows={[
                    ['Total income', formatINR(c.totalIncome, 0)],
                    ['Total expenses (incl. EMIs)', formatINR(c.totalExpenses, 0)],
                    ['All outflows (incl. existing investments)', formatINR(c.totalCommitted, 0)],
                    [negative ? 'Shortfall' : 'Surplus', formatINR(c.surplus, 0)],
                    ['Savings rate', c.savingsRatePct === null ? 'Not available' : formatPct(c.savingsRatePct, 1)],
                    ['Investment rate', c.investmentRatePct === null ? 'Not available' : formatPct(c.investmentRatePct, 1)],
                    ['Emergency-fund target', formatINR(ef.target, 0)],
                    ['Emergency savings held', formatINR(ef.current, 0)],
                    ['Emergency-fund gap', formatINR(ef.gap, 0)],
                  ]}
                  rowKey={(r) => r[0]!}
                  columns={[
                    { header: 'Item', cell: (r) => r[0] },
                    { header: 'Monthly / amount', numeric: true, cell: (r) => r[1] },
                  ]}
                />
              ),
            },
            ...(c.surplusProjection
              ? [
                  {
                    id: 'projection',
                    label: 'Surplus projection',
                    content: (
                      <MoneyLineChart<AccumulationRow>
                        data={c.surplusProjection.yearly}
                        xKey="month"
                        xLabel={shortMonthLabel}
                        title="Projection of investing the monthly surplus (assumption-based)"
                        summary={<>Investing the surplus each month projects to <Money value={c.surplusProjection.summary.finalValue} />.</>}
                        series={[
                          { key: 'value', label: 'Projected value', color: 'var(--chart-1)' },
                          { key: 'invested', label: 'Invested', color: 'var(--chart-2)', dashed: true },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
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
          p.reset();
          s.reset();
          setBasis('essential');
          setProject(false);
          setTiming('end');
          setRc('effective');
        }}
        actions={
          <>
            <ShareButton path={path} query={query} />
            <SavePlanButton calculator="Cash-flow planner" path={path} query={query} defaultName="Cash-flow plan" />
            <ExportButtons
              fileBase="cash-flow"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildCashFlowReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <p className="text-sm text-muted">Share links and saved plans keep only the emergency-fund and projection settings. Income, expenses, EMIs, investments and savings are never included.</p>
      <MethodNote>
        <ul>
          <li>Surplus = income − (essential + discretionary expenses + EMIs + investments you already make). A negative surplus is shown as a shortfall, never hidden.</li>
          <li>Savings rate = (existing investments + surplus) ÷ income, so a shortfall lowers it, possibly below zero.</li>
          <li>Emergency-fund target = the months you choose × the monthly basis you choose. No return is assumed unless you add a projection.</li>
        </ul>
      </MethodNote>
    </div>
  );
}
