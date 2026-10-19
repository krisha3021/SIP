import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { Watchlist } from '@/features/watchlist/ui/Watchlist';

export const metadata: Metadata = {
  title: 'Watchlist',
  description: 'Schemes you are following, saved in this browser only. No sign-in needed.',
};

export default function WatchlistPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Watchlist' }]} title="Watchlist" lede="Schemes you are following. Saved in this browser only — no account, no sync." />
      <PageBody>
        <Watchlist />
      </PageBody>
    </>
  );
}
