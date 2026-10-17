import type { Metadata } from 'next';
import Link from 'next/link';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { CALCULATORS } from '@/features/calculators/ui/registry';

export const metadata: Metadata = {
  title: 'Goals & Retirement',
  description: 'Plan a goal, test a retirement withdrawal plan and explore uncertainty with a Monte Carlo model.',
};

const STEPS = [
  { slug: 'goal-planner', step: '1. Size the goal', text: 'Work out the monthly SIP a goal needs and how far your current SIP falls short.' },
  { slug: 'monte-carlo', step: '2. Stress-test it', text: 'See how often a simple random-return model reaches the goal, and how wide the range is.' },
  { slug: 'swp', step: '3. Plan the withdrawals', text: 'For retirement, test how long a corpus lasts with withdrawals that rise each year.' },
];

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Goals & Retirement' }]}
        title="Goals & Retirement"
        lede="Three tools that work together. They share the same conventions, so a number from one can be checked in another."
      />
      <PageBody>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => {
            const c = CALCULATORS.find((x) => x.slug === s.slug)!;
            return (
              <li key={s.slug}>
                <Link href={`/calculators/${c.slug}`} className="block h-full rounded-xl border border-line bg-surface p-5 text-text no-underline hover:border-brand">
                  <span className="text-sm font-semibold text-brand">{s.step}</span>
                  <span className="mt-1 block text-lg font-semibold">{c.title}</span>
                  <span className="mt-2 block text-sm text-muted">{s.text}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-8 max-w-3xl text-sm text-muted">
          These are educational projections. They are not a financial plan or advice, and they do not assess whether any product is suitable for you.
        </p>
      </PageBody>
    </>
  );
}
