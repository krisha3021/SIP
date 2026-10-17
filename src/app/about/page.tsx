import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { OwnerToSupply } from '@/components/layout/OwnerNotice';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'About' }]} title="About Lakshya" />
      <PageBody>
        <Prose>
          <p>Lakshya is an educational website for Indian investors. It was created by Alok Shukla.</p>
          <p>
            Its calculators show the assumptions and conventions behind every number, and its fund research shows only what the data provider
            publishes. It does not sell products, give personalised advice or assess suitability.
          </p>
          <p>Lakshya is not a SEBI-registered investment adviser or research analyst.</p>
          <OwnerToSupply what="Background, the operating entity (if any), and how Lakshya is funded." />
        </Prose>
      </PageBody>
    </>
  );
}
