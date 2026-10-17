'use client';

import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ALLOCATION_NOTICE, DEFAULT_ALLOCATION_ASSUMPTIONS, buildAllocationReport, exploreAllocation, type AllocationInput, type AllocationStep } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { CalculatorLayout, CalcErrorState, ConventionsLine, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { MandatoryNotice } from '@/components/calculator/MandatoryNotice';
import { formatINR, formatPct } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';

type Comfort = 'cautious' | 'balanced' | 'comfortable';
const A = DEFAULT_ALLOCATION_ASSUMPTIONS;
const DEFAULTS = {
  age: 35,
  hz: 15,
  k: A.ageRuleConstant,
  adjc: A.riskAdjustmentPct.cautious,
  adjb: A.riskAdjustmentPct.balanced,
  adjm: A.riskAdjustmentPct.comfortable,
  emin: A.minEquityPct,
  emax: A.maxEquityPct,
  shy: A.shortHorizonYears,
  shmax: A.shortHorizonMaxEquityPct,
  gold: A.goldPct,
  re: '',
  rd: '',
  rg: '',
} as const satisfies Record<string, number | ''>;
/** The amount to split is never put in a link. */
const PRIVATE_DEFAULTS = { amt: '' } as const satisfies Record<string, ''>;
const FIELD_MAP: Record<string, string> = {
  age: 'age',
  horizonYears: 'hz',
  'assumptions.ageRuleConstant': 'k',
  'assumptions.riskAdjustmentPct.cautious': 'adjc',
  'assumptions.riskAdjustmentPct.balanced': 'adjb',
  'assumptions.riskAdjustmentPct.comfortable': 'adjm',
  'assumptions.minEquityPct': 'emin',
  'assumptions.maxEquityPct': 'emax',
  'assumptions.shortHorizonYears': 'shy',
  'assumptions.shortHorizonMaxEquityPct': 'shmax',
  'assumptions.goldPct': 'gold',
  'expectedReturnsPct.equity': 're',
  'expectedReturnsPct.debt': 'rd',
  'expectedReturnsPct.gold': 'rg',
  amount: 'amt',
};
const COLORS = { Equity: 'var(--chart-1)', Debt: 'var(--chart-3)', Gold: 'var(--chart-2)' } as const;

export function AllocationExplorer({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS, params);
  const p = useFields(PRIVATE_DEFAULTS);
  const [comfort, setComfort] = useState<Comfort>(optionFromParams(params, 'rc', ['cautious', 'balanced', 'comfortable'] as const, 'balanced'));
  const v = f.values;

  const input: AllocationInput | null = useMemo(() => {
    if (!f.allParsed || !p.allParsed) return null;
    const returns = v.re !== null || v.rd !== null || v.rg !== null;
    return {
      age: v.age!,
      horizonYears: v.hz!,
      selfDescribedRiskComfort: comfort,
      assumptions: {
        ageRuleConstant: v.k!,
        riskAdjustmentPct: { cautious: v.adjc!, balanced: v.adjb!, comfortable: v.adjm! },
        minEquityPct: v.emin!,
        maxEquityPct: v.emax!,
        shortHorizonYears: v.shy!,
        shortHorizonMaxEquityPct: v.shmax!,
        goldPct: v.gold!,
      },
      // A partial set of returns is passed through so the engine reports which one is missing.
      ...(returns ? { expectedReturnsPct: { equity: v.re ?? NaN, debt: v.rd ?? NaN, gold: v.rg ?? NaN } } : {}),
      ...(p.values.amt !== null ? { amount: p.values.amt } : {}),
    };
  }, [f.allParsed, p.allParsed, v, p.values, comfort]);

  const result = useMemo(() => (input ? exploreAllocation(input) : null), [input]);
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: string) =>
    (f.parseErrors as Record<string, string | undefined>)[k] ?? (p.parseErrors as Record<string, string | undefined>)[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ ...f.raw, rc: comfort });
  const path = '/calculators/allocation-explorer';

  const pct = (k: keyof typeof DEFAULTS, label: string, min: number, max: number, hint?: string, noSlider?: boolean) => (
    <NumberField name={k} label={label} value={f.raw[k]} onChange={(x) => f.set(k, x)} sliderMin={min} sliderMax={max} suffix="%" error={err(k)} hint={hint} noSlider={noSlider} compact />
  );

  const form = (
    <>
      <NumberField name="age" label="Age" value={f.raw.age} onChange={(x) => f.set('age', x)} sliderMin={18} sliderMax={90} suffix="years" error={err('age')} />
      <NumberField name="hz" label="When you need the money" value={f.raw.hz} onChange={(x) => f.set('hz', x)} sliderMin={0} sliderMax={40} suffix="years" error={err('hz')} />
      <Choice<Comfort>
        legend="How comfortable are you with ups and downs?"
        value={comfort}
        onChange={setComfort}
        options={[
          { value: 'cautious', label: 'Cautious' },
          { value: 'balanced', label: 'In between' },
          { value: 'comfortable', label: 'Comfortable' },
        ]}
        hint="Your own description. This is not a risk questionnaire."
      />
      <details className="rounded-md border border-line p-3" open>
        <summary className="cursor-pointer text-sm font-medium">The rule&apos;s assumptions (editable)</summary>
        <div className="mt-3 space-y-3">
          <NumberField name="k" label="Age-rule constant (equity = constant − age)" value={f.raw.k} onChange={(x) => f.set('k', x)} sliderMin={50} sliderMax={150} error={err('k')} compact />
          {pct('adjc', 'Adjustment if cautious', -50, 50)}
          {pct('adjb', 'Adjustment if in between', -50, 50)}
          {pct('adjm', 'Adjustment if comfortable', -50, 50)}
          {pct('emin', 'Minimum equity', 0, 100)}
          {pct('emax', 'Maximum equity', 0, 100)}
          <NumberField name="shy" label="Short horizon below" value={f.raw.shy} onChange={(x) => f.set('shy', x)} sliderMin={0} sliderMax={30} suffix="years" error={err('shy')} compact />
          {pct('shmax', 'Equity limit for a short horizon', 0, 100)}
          {pct('gold', 'Gold', 0, 100)}
        </div>
      </details>
      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">Optional: return assumptions and an amount</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">Enter all three to see a weighted average. These are your assumptions, not forecasts.</p>
          {pct('re', 'Equity return', -20, 30, undefined, true)}
          {pct('rd', 'Debt return', -20, 30, undefined, true)}
          {pct('rg', 'Gold return', -20, 30, undefined, true)}
          <NumberField name="amt" label="Amount to split" value={p.raw.amt} onChange={(x) => p.set('amt', x)} sliderMin={0} sliderMax={10_000_000} noSlider prefix="₹" error={err('amt')} hint="Not included in share links or saved plans." />
        </div>
      </details>
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = (
      <>
        <MandatoryNotice text={ALLOCATION_NOTICE} />
        <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />
      </>
    );
  } else {
    const r = result.value;
    const slices = [
      { name: 'Equity' as const, value: r.equityPct },
      { name: 'Debt' as const, value: r.debtPct },
      { name: 'Gold' as const, value: r.goldPct },
    ];
    results = (
      <>
        <MandatoryNotice text={r.notice} />
        <KpiGrid>
          <KpiCard label="Equity" value={formatPct(r.equityPct, 1)} emphasis testId="kpi-equity" />
          <KpiCard label="Debt" value={formatPct(r.debtPct, 1)} />
          <KpiCard label="Gold" value={formatPct(r.goldPct, 1)} />
          {r.blendedExpectedReturnPct !== null && <KpiCard label="Weighted average of your return assumptions" value={formatPct(r.blendedExpectedReturnPct, 2)} sub="An assumption, not a forecast" />}
        </KpiGrid>
        {r.rupeeSplit && (
          <p className="text-sm">
            Split of your amount: equity <Money value={r.rupeeSplit.equity} />, debt <Money value={r.rupeeSplit.debt} />, gold <Money value={r.rupeeSplit.gold} />.
          </p>
        )}
        <ConventionsLine items={[`Age rule: ${r.assumptions.ageRuleConstant} − age`, `Equity bounds ${r.assumptions.minEquityPct}–${r.assumptions.maxEquityPct}%`, `Gold ${r.assumptions.goldPct}%; debt is the remainder`]} />
        <Warnings warnings={result.warnings.filter((w) => w !== r.notice)} />
        <p className="text-sm" data-testid="result-summary">
          Under this rule of thumb and your assumptions, the illustration is {formatPct(r.equityPct, 1)} equity, {formatPct(r.debtPct, 1)} debt and {formatPct(r.goldPct, 1)} gold. The steps tab shows how each
          number was reached.
        </p>
        <Tabs
          label="Allocation views"
          tabs={[
            {
              id: 'steps',
              label: 'Steps',
              content: (
                <DataTable<AllocationStep>
                  caption="How the illustration was built, step by step"
                  rows={r.steps}
                  rowKey={(s, i) => `${s.step}-${i}`}
                  columns={[
                    { header: 'Step', cell: (s) => s.step },
                    { header: 'Equity after step', numeric: true, cell: (s) => formatPct(s.equityPct, 1) },
                    { header: 'Explanation', cell: (s) => s.explanation },
                  ]}
                />
              ),
            },
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <figure className="space-y-2">
                  <div style={{ height: 240 }} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart accessibilityLayer={false}>
                        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" isAnimationActive={false} label={(e: { name?: string; value?: number }) => `${e.name} ${e.value}%`}>
                          {slices.map((s) => (
                            <Cell key={s.name} fill={COLORS[s.name]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => `${val}%`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="text-sm text-muted">
                    <span className="font-semibold text-text">Equity, debt and gold shares. </span>
                    The KPI cards above list the same numbers.
                  </figcaption>
                </figure>
              ),
            },
          ]}
        />
        {r.rupeeSplit && <p className="text-xs text-muted">Amount split shown in full: equity {formatINR(r.rupeeSplit.equity)}, debt {formatINR(r.rupeeSplit.debt)}, gold {formatINR(r.rupeeSplit.gold)}.</p>}
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
          setComfort('balanced');
        }}
        actions={
          <>
            <ShareButton path={path} query={query} />
            <SavePlanButton calculator="Allocation Explorer" path={path} query={query} defaultName="Allocation illustration" />
            <ExportButtons
              fileBase="allocation-explorer"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildAllocationReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <MethodNote>
        <ul>
          <li>Equity starts at the age-rule constant minus your age, is adjusted for the comfort level you describe, then kept within the bounds you set.</li>
          <li>A short horizon limits equity further. Gold is your chosen share; debt is what remains.</li>
          <li>This is a transparent rule of thumb for learning. It does not know your income, liabilities, dependants or taxes. See the Life-stage & Risk Planner for a fuller educational illustration.</li>
        </ul>
      </MethodNote>
    </div>
  );
}
