import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { OwnerToSupply } from '@/components/layout/OwnerNotice';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Contact' }]} title="Contact" />
      <PageBody>
        <Prose>
          <OwnerToSupply what="A contact email address or form, and a postal address if one is required for grievance handling." />
          <p>Until contact details are published, please do not send personal or financial information through any channel claiming to represent Lakshya.</p>
        </Prose>
      </PageBody>
    </>
  );
}
