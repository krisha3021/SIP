'use client';

import { useMemo, useState } from 'react';
import {
  EXPERIENCE,
  INCOME_STABILITY,
  LIFE_STAGE_NOTICE,
  LOSS_REACTION,
  PFRDA_AUTO_CHOICE_REFERENCE,
  buildLifeStageReport,
  planLifeStageRisk,
  type GlidePathRow,
  type LifeStageInput,
  type ScoreBreakdown,
} from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Choice, SelectField } from '@/components/ui/Choice';
import { Badge, Notice } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { CalculatorLayout, CalcErrorState, MethodNote, Warnings } from '@/components/calculator/CalculatorLayout';
import { ExportButtons, SavePlanButton, ShareButton } from '@/components/calculator/ActionButtons';
import { MandatoryNotice } from '@/components/calculator/MandatoryNotice';
import { formatINR } from '@/lib/format/inr';
import { buildQuery, optionFromParams, useFields, type SearchParamsRecord } from '@/features/calculators/ui/useFields';
import { GlidePathChart, RangeBar } from './GlidePathChart';
import { StressTest } from './StressTest';

type Stability = (typeof INCOME_STABILITY)[number];
type Experience = (typeof EXPERIENCE)[number];
type Reaction = (typeof LOSS_REACTION)[number];

const STABILITY_LABEL: Record<Stability, string> = {
  'salaried-stable': 'Salaried, stable',
  'salaried-variable': 'Salaried, variable pay',
  'self-employed': 'Self-employed',
  irregular: 'Irregular',
};
const EXPERIENCE_LABEL: Record<Experience, string> = {
  none: 'None',
  'under-3-years': 'Under 3 years',
  '3-to-10-years': '3 to 10 years',
  'over-10-years': 'Over 10 years',
};
const REACTION_LABEL: Record<Reaction, string> = {
  'sell-all': 'Sell everything',
  'sell-some': 'Sell some',
  hold: 'Hold and wait',
  'invest-more': 'Invest more',
};

/** Settings that may appear in a share link or saved plan. */
const SHAREABLE_DEFAULTS = { cur: 32, ret: 60, until: '', eft: 6, hz: 20 } as const satisfies Record<string, number | ''>;
/** Household finances: never read from or written to a URL. */
const PRIVATE_DEFAULTS = { dep: 2, earn: 1, inc: 120000, ess: 55000, emi: 15000, efh: 4 } as const satisfies Record<string, number>;

const FIELD_MAP: Record<string, string> = {
  currentAge: 'cur',
  targetRetirementAge: 'ret',
  planUntilAge: 'until',
  emergencyFundTargetMonths: 'eft',
  investmentHorizonYears: 'hz',
  dependants: 'dep',
  earningMembers: 'earn',
  monthlyHouseholdIncome: 'inc',
  monthlyEssentialExpenses: 'ess',
  monthlyEmis: 'emi',
  emergencyFundMonthsHeld: 'efh',
};

export const LIFE_STAGE_SHARED_KEYS = [...Object.keys(SHAREABLE_DEFAULTS), 'xp', 'lr', 'pf'];

export function LifeStagePlanner({ params }: { params?: SearchParamsRecord }) {
  const s = useFields(SHAREABLE_DEFAULTS, params);
  const p = useFields(PRIVATE_DEFAULTS); // never seeded from the URL
  const [stability, setStability] = useState<Stability>('salaried-stable');
  const [experience, setExperience] = useState<Experience>(optionFromParams(params, 'xp', EXPERIENCE, '3-to-10-years'));
  const [reaction, setReaction] = useState<Reaction>(optionFromParams(params, 'lr', LOSS_REACTION, 'hold'));
  const [pfrda, setPfrda] = useState(params?.pf === '1');

  const input: LifeStageInput | null = useMemo(() => {
    if (!s.allParsed || !p.allParsed) return null;
    const v = { ...s.values, ...p.values };
    return {
      currentAge: v.cur!,
      targetRetirementAge: v.ret!,
      ...(v.until !== null ? { planUntilAge: v.until } : {}),
      dependants: v.dep!,
      earningMembers: v.earn!,
      monthlyHouseholdIncome: v.inc!,
      monthlyEssentialExpenses: v.ess!,
      monthlyEmis: v.emi!,
      incomeStability: stability,
      emergencyFundMonthsHeld: v.efh!,
      emergencyFundTargetMonths: v.eft!,
      investmentHorizonYears: v.hz!,
      investmentExperience: experience,
      lossReaction: reaction,
      includePfrdaReference: pfrda,
    };
  }, [s.allParsed, p.allParsed, s.values, p.values, stability, experience, reaction, pfrda]);

  const result = useMemo(() => (input ? planLifeStageRisk(input) : null), [input]);
  const errField = result && !result.ok && result.error.field ? FIELD_MAP[result.error.field] : undefined;
  const err = (k: string) =>
    (s.parseErrors as Record<string, string | undefined>)[k] ?? (p.parseErrors as Record<string, string | undefined>)[k] ?? (errField === k && result && !result.ok ? result.error.message : null);

  // Only non-sensitive settings: no income, expenses, EMIs, dependants, earners or savings.
  const query = buildQuery({ ...s.raw, xp: experience, lr: reaction, pf: pfrda ? 1 : null });
  const path = '/calculators/life-stage-planner';

  const num = (fset: typeof s | typeof p, k: string, label: string, min: number, max: number, opts: { step?: number; suffix?: string; money?: boolean; hint?: string; noSlider?: boolean } = {}) => (
    <NumberField
      name={k}
      label={label}
      value={(fset.raw as Record<string, string>)[k]!}
      onChange={(x) => (fset.set as (k: string, v: string) => void)(k, x)}
      sliderMin={min}
      sliderMax={max}
      step={opts.step ?? 1}
      prefix={opts.money ? '₹' : undefined}
      suffix={opts.suffix}
      error={err(k)}
      hint={opts.hint}
      noSlider={opts.noSlider}
      formatValue={opts.money ? (n) => formatINR(n, 0) : undefined}
    />
  );

  const form = (
    <>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Life stage</legend>
        {num(s, 'cur', 'Current age', 18, 80, { suffix: 'years' })}
        {num(s, 'ret', 'Target retirement age', 30, 80, { suffix: 'years' })}
        {num(s, 'until', 'Show the glide path until age (optional)', 40, 110, { suffix: 'years', noSlider: true, hint: 'Leave empty for 15 years after retirement.' })}
        {num(s, 'hz', 'Investment horizon (when you need this money)', 0, 40, { suffix: 'years' })}
      </fieldset>
      <fieldset className="space-y-4 rounded-md border border-line p-3">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">Household (kept private)</legend>
        <p className="text-xs text-muted">These answers are never put in a share link or saved plan.</p>
        {num(p, 'dep', 'People who depend on household income', 0, 10)}
        {num(p, 'earn', 'Earning members', 0, 6)}
        {num(p, 'inc', 'Monthly household income (after tax)', 0, 1_000_000, { step: 5000, money: true })}
        {num(p, 'ess', 'Monthly essential expenses', 0, 500_000, { step: 1000, money: true })}
        {num(p, 'emi', 'Monthly loan EMIs', 0, 500_000, { step: 1000, money: true })}
        <SelectField<Stability>
          label="Income stability"
          value={stability}
          onChange={setStability}
          options={INCOME_STABILITY.map((v) => ({ value: v, label: STABILITY_LABEL[v] }))}
        />
        {num(p, 'efh', 'Emergency fund you hold, in months of expenses', 0, 24, { step: 0.5, suffix: 'months' })}
      </fieldset>
      {num(s, 'eft', 'Your emergency-fund target', 1, 24, { suffix: 'months', hint: 'Your own target; the planner compares your fund with it.' })}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-muted">Your attitude to risk</legend>
        <Choice<Reaction>
          legend="If your investments fell 20% in a few months, what would you most likely do?"
          value={reaction}
          onChange={setReaction}
          options={LOSS_REACTION.map((v) => ({ value: v, label: REACTION_LABEL[v] }))}
        />
        <SelectField<Experience> label="Investing experience" value={experience} onChange={setExperience} options={EXPERIENCE.map((v) => ({ value: v, label: EXPERIENCE_LABEL[v] }))} />
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={pfrda} onChange={(e) => setPfrda(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
        <span>Show the PFRDA NPS Auto Choice equity curves for comparison</span>
      </label>
    </>
  );

  let results: React.ReactNode;
  if (!result || !result.ok) {
    results = (
      <>
        <MandatoryNotice text={LIFE_STAGE_NOTICE} />
        <CalcErrorState error={result && !result.ok ? result.error : null} parseIssue={!result} />
      </>
    );
  } else {
    const r = result.value;
    const otherWarnings = result.warnings.filter((w) => w !== r.notice);
    const retirementAge = input!.targetRetirementAge;
    results = (
      <>
        <MandatoryNotice text={r.notice} />
        <section aria-labelledby="profile-heading" className="rounded-lg border border-brand/50 bg-brand-soft p-4" data-testid="profile">
          <h3 id="profile-heading" className="font-sans text-sm font-semibold uppercase tracking-wide text-brand-strong">
            Illustrative profile
          </h3>
          <p className="mt-1 text-2xl font-semibold text-brand-strong">
            {r.profile.label} <span className="num text-base font-normal">(score {r.profile.score} of 100)</span>
          </p>
          <p className="mt-1 text-sm text-text">
            Set by: <strong>{r.profile.limitedBy === 'both' ? 'capacity and tolerance (equal)' : r.profile.limitedBy}</strong>. {r.profile.explanation}
          </p>
        </section>

        <div className="grid gap-4 xl:grid-cols-2" data-testid="scores">
          <ScoreCard title="Risk capacity (your situation)" b={r.capacity} limiting={r.profile.limitedBy !== 'tolerance'} />
          <ScoreCard title="Risk tolerance (your answers)" b={r.tolerance} limiting={r.profile.limitedBy !== 'capacity'} />
        </div>

        <section aria-labelledby="prereq-heading" className="space-y-2">
          <h3 id="prereq-heading" className="text-lg font-semibold">
            Check first: prerequisites
          </h3>
          {r.prerequisites.length === 0 ? (
            <p className="text-sm">No prerequisite was flagged for your answers.</p>
          ) : (
            <ul className="space-y-2" data-testid="prerequisites">
              {r.prerequisites.map((f) => (
                <li key={f.id}>
                  <Notice tone="warning" title={f.equityCapPct === null ? 'Flag' : `Flag — equity limited to ${f.equityCapPct}% in today's range`}>
                    {f.explanation}
                  </Notice>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="range-heading" className="space-y-3 rounded-lg border border-line bg-surface p-4" data-testid="current-range">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="range-heading" className="text-lg font-semibold">
              Educational range for today
            </h3>
            <Badge tone="info">A range, not a target</Badge>
          </div>
          <RangeBar label="Equity" min={r.currentRange.equity.min} max={r.currentRange.equity.max} color="var(--chart-1)" />
          <RangeBar label="Debt" min={r.currentRange.debt.min} max={r.currentRange.debt.max} color="var(--chart-3)" />
          <RangeBar label="Gold" min={r.currentRange.gold.min} max={r.currentRange.gold.max} color="var(--chart-2)" />
          <p className="text-xs text-muted">
            Before the glide path and prerequisite limits, the {r.profile.label.toLowerCase()} profile&apos;s table range is equity {r.profileRange.equity.min}–{r.profileRange.equity.max}%, gold{' '}
            {r.profileRange.gold.min}–{r.profileRange.gold.max}%, debt {r.profileRange.debt.min}–{r.profileRange.debt.max}%.
          </p>
        </section>

        <Warnings warnings={otherWarnings} />

        <section aria-labelledby="glide-heading" className="space-y-3">
          <h3 id="glide-heading" className="text-lg font-semibold">
            Glide path by age
          </h3>
          <Tabs
            label="Glide path views"
            tabs={[
              {
                id: 'chart',
                label: 'Chart',
                content: (
                  <figure className="space-y-2">
                    <GlidePathChart rows={r.glidePath} pfrda={r.pfrdaReference} retirementAge={retirementAge} pfrdaHoldsAfterAge={PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge} />
                    <figcaption className="text-sm text-muted" data-testid="glide-summary">
                      <span className="font-semibold text-text">Equity and debt ranges by age. </span>
                      At age {r.glidePath[0]!.age} the equity range is {r.glidePath[0]!.range.equity.min}–{r.glidePath[0]!.range.equity.max}%; at age{' '}
                      {r.glidePath[r.glidePath.length - 1]!.age} it is {r.glidePath[r.glidePath.length - 1]!.range.equity.min}–{r.glidePath[r.glidePath.length - 1]!.range.equity.max}%. The
                      range never widens with age. The glide path does not include today&apos;s prerequisite limits.
                    </figcaption>
                  </figure>
                ),
              },
              {
                id: 'table',
                label: 'Table',
                content: (
                  <DataTable<GlidePathRow>
                    caption="Glide path by age"
                    rows={r.glidePath}
                    rowKey={(row) => row.age}
                    columns={[
                      { header: 'Age', cell: (row) => row.age },
                      { header: 'Phase', cell: (row) => (row.phase === 'accumulation' ? 'Building' : 'Retired') },
                      { header: 'Equity', numeric: true, cell: (row) => `${row.range.equity.min}–${row.range.equity.max}%` },
                      { header: 'Debt', numeric: true, cell: (row) => `${row.range.debt.min}–${row.range.debt.max}%` },
                      { header: 'Gold', numeric: true, cell: (row) => `${row.range.gold.min}–${row.range.gold.max}%` },
                      ...(r.pfrdaReference
                        ? r.pfrdaReference.series.map((ser) => ({
                            header: `PFRDA ${ser.name}`,
                            numeric: true,
                            cell: (row: GlidePathRow) => {
                              const pt = ser.points.find((x) => x.age === row.age);
                              if (!pt) return '—';
                              return row.age > PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge ? `${pt.equityPct}% (extension)` : `${pt.equityPct}%`;
                            },
                          }))
                        : []),
                    ]}
                  />
                ),
              },
            ]}
          />
          {r.pfrdaReference && (
            <div className="rounded-lg border border-line bg-surface p-3 text-sm" data-testid="pfrda-source">
              <p>
                <strong>Source:</strong>{' '}
                <a href={r.pfrdaReference.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {r.pfrdaReference.source}
                </a>{' '}
                (verified {r.pfrdaReference.verifiedOn}).
              </p>
              <p className="mt-1 font-medium text-warning">
                Values after age {PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge} are Lakshya&apos;s extension: PFRDA&apos;s table ends at {PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge}, and the
                age-{PFRDA_AUTO_CHOICE_REFERENCE.holdsAfterAge} value is held constant.
              </p>
              <p className="mt-1 text-muted">{r.pfrdaReference.note}</p>
            </div>
          )}
        </section>

        <StressTest range={r.currentRange} />
        <MandatoryNotice text={r.notice} />
        <p className="text-xs text-muted">Rule table version {r.configVersion}.</p>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <CalculatorLayout
        form={form}
        results={results}
        formTitle="Your answers"
        onReset={() => {
          s.reset();
          p.reset();
          setStability('salaried-stable');
          setExperience('3-to-10-years');
          setReaction('hold');
          setPfrda(false);
        }}
        actions={
          <>
            <ShareButton path={path} query={query} />
            <SavePlanButton calculator="Life-stage & Risk Planner" path={path} query={query} defaultName="Life-stage plan" />
            <ExportButtons
              fileBase="life-stage-planner"
              disabled={!result?.ok}
              buildReport={() => {
                if (!result?.ok || !input) throw new Error('No result');
                return buildLifeStageReport(input, result.value, { generatedAt: new Date().toISOString(), warnings: result.warnings });
              }}
            />
          </>
        }
      />
      <p className="text-sm text-muted">
        Share links and saved plans keep only your ages, horizon, emergency-fund target and risk answers. Income, expenses, EMIs, savings, dependants and earners are
        never included. The exported file does include them, because it is created on your device for you.
      </p>
      <MethodNote>
        <ul>
          <li>Risk capacity (0–100) scores your horizon, dependants per earner, income stability, EMIs as a share of income, and your emergency fund against your own target.</li>
          <li>Risk tolerance (0–100) scores your stated reaction to a 20% fall and your investing experience.</li>
          <li>The profile uses the lower of the two scores. Prerequisites are checked before any range, and some limit today&apos;s equity range.</li>
          <li>Ranges come from a fixed, published table. The glide path caps equity by years to retirement, so the range never widens with age.</li>
          <li>The stress test uses only the NAV history you choose. It shows one past fall, not a forecast.</li>
        </ul>
      </MethodNote>
    </div>
  );
}

function ScoreCard({ title, b, limiting }: { title: string; b: ScoreBreakdown; limiting: boolean }) {
  return (
    <section className={`rounded-lg border p-4 ${limiting ? 'border-brand/50' : 'border-line'} bg-surface`} aria-label={title}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-sans text-base font-semibold">{title}</h3>
        <span className="num text-2xl font-semibold">
          {b.score}
          <span className="text-sm font-normal text-muted"> / {b.maxScore}</span>
        </span>
      </div>
      {limiting && <p className="mt-1 text-xs font-semibold text-brand">This score sets the profile.</p>}
      <ul className="mt-3 space-y-3">
        {b.factors.map((f) => (
          <li key={f.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{f.label}</span>
              <span className="num shrink-0 font-semibold">
                {f.points} / {f.maxPoints}
              </span>
            </div>
            <p className="text-xs text-muted">Your answer: {f.value}</p>
            <p className="text-xs text-muted">{f.explanation}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
