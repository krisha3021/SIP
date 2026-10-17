import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { OwnerToSupply } from '@/components/layout/OwnerNotice';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Terms' }]} title="Terms of use" />
      <PageBody>
        <Prose>
          <OwnerToSupply what="The terms of use, the legal entity offering the site, governing law and jurisdiction, and liability terms, reviewed by a qualified professional." />
          <p>In the meantime, the <a href="/disclaimer">Disclaimer</a> describes the educational nature of every result.</p>
        </Prose>
      </PageBody>
    </>
  );
}
