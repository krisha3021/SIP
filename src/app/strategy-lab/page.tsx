import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { StrategyLabWithAi } from '@/features/strategy/ui/StrategyLabWithAi';

export const metadata: Metadata = {
  title: 'Strategy Lab',
  description: 'Compare SIP, step-up, lump sum and allocation strategies on your own assumptions, with downside ranges and plain-language explanations. Educational only.',
};

export default function StrategyLabPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Strategy Lab' }]}
        title="Strategy Lab"
        lede="Compare contribution patterns and equity/debt/gold mixes on your own assumptions. Every number is calculated by Lakshya’s tested engines; explanations only describe those numbers."
      />
      <PageBody>
        <StrategyLabWithAi />
      </PageBody>
    </>
  );
}
