import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { FundDetail } from '@/features/funds/ui/FundDetail';

type Props = { params: Promise<{ schemeCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { schemeCode } = await params;
  return { title: `Scheme ${schemeCode}`, robots: { index: false } };
}

export default async function FundPage({ params }: Props) {
  const { schemeCode } = await params;
  if (!/^\d{1,7}$/.test(schemeCode)) notFound();
  return (
    <>
      <PageHeader crumbs={[{ href: '/funds', label: 'Fund Research' }, { label: `Scheme ${schemeCode}` }]} title="Scheme NAV history" />
      <PageBody>
        <FundDetail schemeCode={schemeCode} />
      </PageBody>
    </>
  );
}
