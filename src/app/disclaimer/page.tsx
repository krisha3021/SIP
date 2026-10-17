import type { Metadata } from 'next';
import { DISCLAIMER } from '@/contracts';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { OwnerToSupply } from '@/components/layout/OwnerNotice';

export const metadata: Metadata = { title: 'Disclaimer' };

export default function DisclaimerPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Disclaimer' }]} title="Disclaimer" />
      <PageBody>
        <Prose>
          <p className="text-lg">{DISCLAIMER}</p>
          <ul>
            <li>Projections assume constant returns unless a page says otherwise. Real returns vary, and can be negative.</li>
            <li>Monte Carlo percentages describe a simplified model, not the probability of a real-world outcome.</li>
            <li>Historical NAV analysis uses data published by a third-party provider. It may contain errors or gaps, and past performance does not indicate future results.</li>
            <li>Tax estimates cover only the cases and rules listed on the calculator, for verified financial years.</li>
            <li>Nothing on this site is a recommendation to buy, sell or hold any security or scheme.</li>
          </ul>
          <OwnerToSupply what="A legally reviewed final disclaimer." />
        </Prose>
      </PageBody>
    </>
  );
}
