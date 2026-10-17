import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { HistoricalBacktest } from '@/features/historical/ui/NavBacktest';

export const metadata: Metadata = {
  title: 'Historical Analysis',
  description: 'Replay a SIP on a scheme’s observed NAVs, with allotment dates, skipped instalments, XIRR and NAV drawdown.',
};

export default async function HistoricalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scheme = typeof sp.scheme === 'string' && /^\d{1,7}$/.test(sp.scheme) ? sp.scheme : null;
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Historical Analysis' }]}
        title="Historical Analysis"
        lede="Replay a SIP on a scheme’s published NAVs. Every allotment date, skipped instalment and the data source are shown. Past performance does not indicate future results."
      />
      <PageBody>
        <HistoricalBacktest initialScheme={scheme} />
      </PageBody>
    </>
  );
}
