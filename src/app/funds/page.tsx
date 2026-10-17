import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { Notice } from '@/components/ui/primitives';
import { FundSearch } from '@/features/funds/ui/FundSearch';

export const metadata: Metadata = {
  title: 'Mutual Fund Research',
  description: 'Search Indian mutual fund schemes and read their published NAV history, with provider and observation dates.',
};

export default function FundsPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Fund Research' }]}
        title="Mutual Fund Research"
        lede="Search schemes by name and read the NAV history the data provider publishes. We show the provider, scheme code, plan and option, and the date of the newest NAV."
      />
      <PageBody className="space-y-6">
        <Notice tone="info" title="What this page does not show">
          No ratings, rankings, AUM, expense ratios or holdings: our data source does not provide them, and we do not invent them. Nothing here is a
          recommendation.
        </Notice>
        <FundSearch />
      </PageBody>
    </>
  );
}
