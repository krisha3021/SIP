'use client';

import { useMemo, useState } from 'react';
import { buildIncomeTaxReport, compareIncomeTax, SUPPORTED_TAX_YEARS, TAX_YEARS, type IncomeTaxInput, type RegimeEstimate } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice, SelectField } from '@/components/ui/Choice';
import { KpiCard, KpiGrid, Money } from '@/components/ui/Kpi';
import { Badge, Notice } from '@/components/ui/primitives';
import { CalculatorLayout, CalcErrorState, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { formatINR } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from './useFields';

type AgeBand = 'below60' | 'age60to80' | 'above80';
// Income is deliberately NOT read from or written to share links.
const DEFAULTS = { sal: 1500000, oth: 0, c80: 150000, nps: 0, d80s: 25000, d80p: 0 } as const satisfies Record<string, number>;
const FIELD_MAP: Record<string, string> = {
  salaryIncome: 'sal',
  otherIncome: 'oth',
  'deductions.sec80C': 'c80',
  'deductions.sec80CCD1B': 'nps',
  'deductions.sec80DSelf': 'd80s',
  'deductions.sec80DParents': 'd80p',
};

const VERIFIED_YEARS = SUPPORTED_TAX_YEARS.filter((fy) => TAX_YEARS[fy]?.status === 'verified');
const UNVERIFIED_YEARS = SUPPORTED_TAX_YEARS.filter((fy) => TAX_YEARS[fy]?.status !== 'verified');

export function IncomeTaxCalculator({ params }: { params?: SearchParamsRecord }) {
  const f = useFields(DEFAULTS); // never seeded from the URL
  const [fy, setFy] = useState<string>(optionFromParams(params, 'fy', VERIFIED_YEARS, VERIFIED_YEARS[0] ?? '2025-26'));
  const [age, setAge] = useState<AgeBand>(optionFromParams(params, 'age', ['below60', 'age60to80', 'above80'] as const, 'below60'));
  const [parentsSenior, setParentsSenior] = useState(false);
  const v = f.values;

  const input: IncomeTaxInput | null = useMemo(
    () =>
      f.allParsed
        ? {
            fy,
            ageBand: age,
            salaryIncome: v.sal!,
            otherIncome: v.oth!,
            deductions: { sec80C: v.c80!, sec80CCD1B: v.nps!, sec80DSelf: v.d80s!, sec80DParents: v.d80p!, parentsSenior },
          }
        : null,
    [f.allParsed, v, fy, age, parentsSenior],
  );
  const result = useMemo(() => (input ? compareIncomeTax(input) : null), [input]);
  // The engine's own explanation for each year that is listed but not yet verified.
  const disabledReasons = useMemo(
    () =>
      UNVERIFIED_YEARS.map((y) => {
        const r = compareIncomeTax({ fy: y });
        return { fy: y, message: r.ok ? '' : r.error.message };
      }),
    [],
  );
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: keyof typeof DEFAULTS) => f.parseErrors[k] ?? (errField === k && result && !result.ok ? result.error.message : null);
  const query = buildQuery({ fy, age });

  const money = (name: keyof typeof DEFAULTS, label: string, max: number, hint?: string) => (
    <NumberField name={name} label={label} value={f.raw[name]} onChange={(x) => f.set(name, x)} sliderMin={0} sliderMax={max} step={max >= 1_000_000 ? 10000 : 1000} prefix="₹" error={err(name)} hint={hint} formatValue={(n) => formatINR(n, 0)} />
  );

  const form = (
    <>
      <SelectField
        label="Financial year"
        value={fy}
        onChange={setFy}
        options={SUPPORTED_TAX_YEARS.map((y) => ({
          value: y,
          label: TAX_YEARS[y]?.status === 'verified' ? `FY ${y}` : `FY ${y} — not yet verified (disabled)`,
          disabled: TAX_YEARS[y]?.status !== 'verified',
        }))}
      />
      {disabledReasons.map((d) => (
        <Notice key={d.fy} tone="warning" title={`FY ${d.fy} is disabled`}>
          <p>{d.message}</p>
        </Notice>
      ))}
      <Choice
        legend="Your age during the year"
        value={age}
        onChange={setAge}
        options={[
          { value: 'below60', label: 'Below 60' },
          { value: 'age60to80', label: '60 to 79' },
          { value: 'above80', label: '80 or more' },
        ]}
      />
      {money('sal', 'Annual salary income (gross)', 5_000_000)}
      {money('oth', 'Other income (interest, rent after deductions, etc.)', 2_000_000, 'Do not include capital gains: they are taxed at special rates and are not modelled here.')}
      <fieldset className="space-y-4 rounded-md border border-line p-3">
        <legend className="px-1 text-sm font-medium">Old-regime deductions</legend>
        {money('c80', 'Section 80C investments', 300_000, 'Capped by the engine at the legal limit.')}
        {money('nps', 'Section 80CCD(1B) — NPS (own)', 100_000)}
        {money('d80s', 'Section 80D — health insurance (self/family)', 100_000)}
        {money('d80p', 'Section 80D — health insurance (parents)', 100_000)}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={parentsSenior} onChange={(e) => setParentsSenior(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Parents are senior citizens
        </label>
      </fieldset>
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />;
  } else {
    const t = result.value;
    results = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">Rules verified for FY {t.fy}</Badge>
          <span className="text-sm text-muted">Educational estimate — not tax advice.</span>
        </div>
        <KpiGrid>
          <KpiCard label="New regime — total tax" value={t.new.totalTax} emphasis={t.lowerRegime === 'new'} testId="kpi-new" />
          <KpiCard label="Old regime — total tax" value={t.old.totalTax} emphasis={t.lowerRegime === 'old'} testId="kpi-old" />
          <KpiCard
            label="Lower under these inputs"
            value={t.lowerRegime === 'equal' ? 'About equal' : t.lowerRegime === 'new' ? 'New regime' : 'Old regime'}
            sub={t.lowerRegime === 'equal' ? undefined : <>Lower by <Money value={t.difference} /></>}
          />
        </KpiGrid>
        <Warnings warnings={result.warnings} />
        <p className="text-sm" data-testid="result-summary">
          For FY {t.fy}, the new regime estimate is <Money value={t.new.totalTax} /> and the old regime estimate is <Money value={t.old.totalTax} />.{' '}
          {t.lowerRegime === 'equal' ? 'They are about the same.' : <>The {t.lowerRegime} regime is lower by <Money value={t.difference} />.</>}
        </p>
        <RegimeTable n={t.new} o={t.old} />
        <Notice tone="info" title="Not modelled">
          <ul className="list-disc space-y-1 pl-4">
            {t.config.exclusions.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
        <div className="text-sm">
          <p className="font-semibold">Sources and verification</p>
          <p className="text-muted">{t.config.verification}</p>
          <ul className="mt-1 list-disc pl-5">
            {t.config.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-block py-1 underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
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
          setAge('below60');
          setParentsSenior(false);
        }}
        actions={
          <>
            <ShareButton path="/calculators/income-tax" query={query} />
            <SavePlanButton calculator="Income tax" path="/calculators/income-tax" query={query} defaultName={`Tax comparison FY ${fy}`} />
            <ExportButtons
              fileBase="income-tax"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildIncomeTaxReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <p className="text-sm text-muted">The share link and saved plan keep only the financial year and age band. Income and deductions are never put in a link or saved.</p>
      <MethodNote>
        <ul>
          <li>Slab tax, then the section 87A rebate (with marginal relief in the new regime where configured), then health and education cess at the configured rate.</li>
          <li>Rules come from a financial-year configuration with source links. Years that have not been checked against primary sources are disabled rather than guessed.</li>
          <li>Incomes above ₹50 lakh are declined because surcharge is not modelled.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function RegimeTable({ n, o }: { n: RegimeEstimate; o: RegimeEstimate }) {
  const rows: Array<[string, keyof RegimeEstimate]> = [
    ['Gross income', 'grossIncome'],
    ['Standard deduction', 'standardDeduction'],
    ['Chapter VI-A deductions', 'chapterVIA'],
    ['Taxable income', 'taxableIncome'],
    ['Tax on slabs', 'slabTax'],
    ['Rebate (s.87A)', 'rebate'],
    ['Tax after rebate', 'taxAfterRebate'],
    ['Health & education cess', 'cess'],
    ['Total tax', 'totalTax'],
  ];
  return (
    <div role="region" aria-label="Regime breakdown" tabIndex={0} className="overflow-x-auto rounded-lg border border-line">
      <table className="num w-full text-sm">
        <caption className="sr-only">Tax computation under each regime</caption>
        <thead className="bg-surface-2">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Item</th>
            <th scope="col" className="px-3 py-2 text-right">New regime</th>
            <th scope="col" className="px-3 py-2 text-right">Old regime</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key]) => (
            <tr key={key} className={`border-t border-line ${key === 'totalTax' ? 'font-semibold' : ''}`}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">{label}</th>
              <td className="px-3 py-1.5 text-right">{formatINR(n[key] as number, 0)}</td>
              <td className="px-3 py-1.5 text-right">{formatINR(o[key] as number, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
