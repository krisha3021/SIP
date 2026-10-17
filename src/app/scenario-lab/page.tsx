import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { ScenarioLab } from '@/features/scenarios/ui/ScenarioLab';

export const metadata: Metadata = { title: 'Scenario Lab', description: 'Compare up to three sets of SIP assumptions side by side.' };

export default function ScenarioLabPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Scenario Lab' }]}
        title="Scenario Lab"
        lede="Compare up to three sets of assumptions side by side. Each scenario runs through the same projection engine as the SIP calculator."
      />
      <PageBody>
        <ScenarioLab />
      </PageBody>
    </>
  );
}
