import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { SavedPlans } from '@/features/plans/ui/SavedPlans';

export const metadata: Metadata = { title: 'Saved Plans', description: 'Plans saved in this browser only.' };

export default function SavedPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Saved Plans' }]}
        title="Saved Plans"
        lede="Plans you save are stored only in this browser (localStorage). They are not sent to a server, and they are not available on other devices."
      />
      <PageBody>
        <SavedPlans />
      </PageBody>
    </>
  );
}
