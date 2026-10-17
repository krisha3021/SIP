import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { CalculatorDirectory } from '@/features/calculators/ui/CalculatorDirectory';

export const metadata: Metadata = {
  title: 'Calculators',
  description: 'SIP, step-up SIP, lumpsum, goal, SWP, Monte Carlo and income-tax calculators with stated assumptions.',
};

export default function CalculatorsPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Calculators' }]}
        title="Calculators"
        lede="Every calculator works without signing in, shows its assumptions and conventions, and labels its results as projections."
      />
      <PageBody>
        <CalculatorDirectory />
      </PageBody>
    </>
  );
}
