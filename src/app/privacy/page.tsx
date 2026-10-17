import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { OwnerToSupply } from '@/components/layout/OwnerNotice';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Privacy' }]} title="Privacy" />
      <PageBody>
        <Prose>
          <OwnerToSupply what="The formal privacy policy, including the data controller's identity, contact for privacy requests, and the hosting provider's processing terms." />
          <h2>How the site works today</h2>
          <ul>
            <li>There are no accounts and no sign-in. Calculators run in your browser.</li>
            <li>Saved plans and your theme choice are stored in your browser&apos;s localStorage. They are not sent to our server. You can delete them from Saved Plans or by clearing site data.</li>
            <li>Share links contain the assumptions shown on the calculator. The income-tax calculator&apos;s link contains only the financial year and age band, never income.</li>
            <li>Fund searches and NAV requests go to our server, which fetches public NAV data from the provider. Your search text is sent to the provider as part of the request.</li>
            <li>No analytics or advertising scripts are included in this build.</li>
            <li>Our hosting provider may keep standard server logs (such as IP address and request time) for security and operations.</li>
          </ul>
        </Prose>
      </PageBody>
    </>
  );
}
