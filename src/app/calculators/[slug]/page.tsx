import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { CALCULATORS, getCalculator, type CalculatorSlug } from '@/features/calculators/ui/registry';
import { AccumulationCalculator } from '@/features/calculators/ui/AccumulationCalculator';
import { GoalPlanner } from '@/features/calculators/ui/GoalPlanner';
import { SwpCalculator } from '@/features/calculators/ui/SwpCalculator';
import { MonteCarlo } from '@/features/calculators/ui/MonteCarlo';
import { IncomeTaxCalculator } from '@/features/calculators/ui/IncomeTaxCalculator';
import { LifeStagePlanner } from '@/features/planner/ui/LifeStagePlanner';
import { CashFlowPlanner } from '@/features/calculators/ui/CashFlowPlanner';
import { RetirementPlanner } from '@/features/calculators/ui/RetirementPlanner';
import { AllocationExplorer } from '@/features/calculators/ui/AllocationExplorer';
import type { SearchParamsRecord } from '@/features/calculators/ui/useFields';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParamsRecord> };

export function generateStaticParams() {
  return CALCULATORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getCalculator(slug);
  return c ? { title: c.title, description: c.summary, alternates: { canonical: `/calculators/${c.slug}` } } : {};
}

function render(slug: CalculatorSlug, sp: SearchParamsRecord) {
  switch (slug) {
    case 'sip':
    case 'step-up-sip':
    case 'lumpsum':
    case 'corpus-sip':
      return <AccumulationCalculator variant={slug} params={sp} />;
    case 'goal-planner':
      return <GoalPlanner params={sp} />;
    case 'swp':
      return <SwpCalculator params={sp} />;
    case 'monte-carlo':
      return <MonteCarlo params={sp} />;
    case 'income-tax':
      return <IncomeTaxCalculator params={sp} />;
    case 'life-stage-planner':
      return <LifeStagePlanner params={sp} />;
    case 'cash-flow':
      return <CashFlowPlanner params={sp} />;
    case 'retirement-planner':
      return <RetirementPlanner params={sp} />;
    case 'allocation-explorer':
      return <AllocationExplorer params={sp} />;
  }
}

export default async function CalculatorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const c = getCalculator(slug);
  if (!c) notFound();
  const sp = await searchParams;
  const crumbs = c.category === 'Goals & retirement' ? [{ href: '/goals', label: 'Goals & Retirement' }, { label: c.title }] : [{ href: '/calculators', label: 'Calculators' }, { label: c.title }];
  return (
    <>
      <PageHeader crumbs={crumbs} title={c.title} lede={c.summary} />
      <PageBody>{render(c.slug, sp)}</PageBody>
    </>
  );
}
