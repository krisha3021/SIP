import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { Notice } from '@/components/ui/primitives';
import { AmcDirectory } from '@/features/amc/ui/AmcDirectory';
import { AMCS, SEBI_MF_REGISTER_URL, SEBI_REGISTER_RETRIEVED_ON } from '@/lib/data/amc/registry';

export const metadata: Metadata = {
  title: 'Fund Houses (AMCs)',
  description: 'Every SEBI-registered mutual fund in India, with its registration number, registration date and official website.',
};

export default function AmcsPage() {
  const since2023 = AMCS.filter((a) => a.registeredOn >= '2023-01-01').length;
  const withSite = AMCS.filter((a) => a.website).length;
  const oldest = [...AMCS].sort((a, b) => a.registeredOn.localeCompare(b.registeredOn))[0]!;

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/funds', label: 'Fund Research' }, { label: 'Fund Houses' }]}
        title="Fund Houses (AMCs)"
        lede={
          <>
            Every mutual fund on SEBI’s register, read on {SEBI_REGISTER_RETRIEVED_ON}. Open a fund house to see its registration details, its official website
            and its schemes.
          </>
        }
      >
        <dl className="mt-5 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Registered with SEBI', String(AMCS.length)],
            ['Registered since 2023', String(since2023)],
            ['Earliest registration', `${oldest.registeredOn.slice(0, 4)}`],
            ['Official site verified', `${withSite} of ${AMCS.length}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="num text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </PageHeader>
      <PageBody className="space-y-6">
        <Notice tone="info" title="Where these facts come from">
          Names, registration numbers, dates and addresses come from the{' '}
          <a href={SEBI_MF_REGISTER_URL} target="_blank" rel="noopener noreferrer">
            SEBI register of mutual funds
          </a>
          . A website is listed only if we opened it and it identified itself as that fund house. AUM, holdings and ratings are not shown yet: we do not have
          permission to republish them.
        </Notice>
        <AmcDirectory amcs={AMCS} />
      </PageBody>
    </>
  );
}
