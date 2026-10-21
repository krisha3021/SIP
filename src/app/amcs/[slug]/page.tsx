import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Lock } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { Badge, Card, Notice } from '@/components/ui/primitives';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { AMCS, SEBI_MF_REGISTER_URL, SEBI_REGISTER_RETRIEVED_ON, WEBSITES_VERIFIED_ON, amcCity, getAmc } from '@/lib/data/amc/registry';

export function generateStaticParams() {
  return AMCS.map((a) => ({ slug: a.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = getAmc((await params).slug);
  if (!a) return {};
  return {
    title: a.displayName,
    description: `${a.displayName}: SEBI registration ${a.registrationNo}, registered ${a.registeredOn}, official website and schemes.`,
  };
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

/** Fields Lakshya does not display yet, with the reason and where the AMC itself publishes them. */
const GATED = [
  {
    label: 'Assets under management (AUM)',
    reason:
      'AMC-wise AUM is compiled by AMFI, whose terms do not allow public display without written permission. Display stays off until that permission is recorded.',
    own: 'Every AMC publishes its own AUM disclosures on its website.',
  },
  {
    label: 'Portfolio holdings',
    reason: 'Monthly scheme portfolios are published by each AMC under its own website terms. Lakshya does not republish them without permission.',
    own: 'Look for “Portfolio disclosure” or “Factsheet” on the AMC’s website.',
  },
  {
    label: 'Ratings',
    reason:
      'Star ratings belong to third-party research firms and need a display licence, which Lakshya does not hold. Lakshya never generates its own ratings.',
    own: 'There is no official SEBI or AMFI rating of fund houses.',
  },
];

export default async function AmcPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getAmc((await params).slug);
  if (!a) notFound();
  const years = Number(SEBI_REGISTER_RETRIEVED_ON.slice(0, 4)) - Number(a.registeredOn.slice(0, 4));

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/funds', label: 'Fund Research' }, { href: '/amcs', label: 'Fund Houses' }, { label: a.displayName }]}
        title={a.displayName}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="brand">SEBI-registered mutual fund</Badge>
          <Badge>{a.registrationNo}</Badge>
          <Badge>{amcCity(a)}</Badge>
          {years <= 2 && <Badge tone="info">New entrant</Badge>}
        </div>
      </PageHeader>
      <PageBody className="space-y-6">
        {a.slug === 'lakshya-mutual-fund' && (
          <Notice tone="warning" title="Not connected to this website">
            This website, Lakshya, is an independent educational tool. It is not affiliated with Lakshya Mutual Fund.
          </Notice>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card aria-labelledby="reg-heading">
            <h2 id="reg-heading" className="text-xl font-semibold">
              Registration
            </h2>
            <dl className="mt-4 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted">Name on SEBI register</dt>
              <dd className="font-medium">{a.sebiName}</dd>
              <dt className="text-muted">Registration number</dt>
              <dd className="num font-medium">{a.registrationNo}</dd>
              <dt className="text-muted">Registered on</dt>
              <dd>
                {longDate(a.registeredOn)} <span className="text-muted">· validity: perpetual</span>
              </dd>
              <dt className="text-muted">Registered address</dt>
              <dd>{a.registeredAddress}</dd>
            </dl>
            <p className="mt-4 text-xs text-muted">
              Source:{' '}
              <a href={SEBI_MF_REGISTER_URL} target="_blank" rel="noopener noreferrer">
                SEBI register of mutual funds
              </a>
              , read {SEBI_REGISTER_RETRIEVED_ON}. Check SEBI for the current entry.
            </p>
          </Card>

          <Card aria-labelledby="site-heading">
            <h2 id="site-heading" className="text-xl font-semibold">
              Official website
            </h2>
            {a.website ? (
              <>
                <a href={a.website} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 font-medium break-all">
                  {a.website.replace(/^https:\/\//, '').replace(/\/$/, '')} <ExternalLink aria-hidden="true" size={14} />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <p className="mt-2 text-sm text-muted">
                  Opened on {WEBSITES_VERIFIED_ON}; the page identified itself as {a.displayName}. Factsheets, AUM and portfolio disclosures are published
                  there.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Not recorded. We could not confirm an official website on {WEBSITES_VERIFIED_ON}, so we do not guess one.
              </p>
            )}
          </Card>
        </div>

        <section aria-labelledby="gated-heading" className="space-y-3">
          <h2 id="gated-heading" className="text-xl font-semibold">
            AUM, holdings and ratings
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {GATED.map((g) => (
              <li key={g.label} className="rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Lock aria-hidden="true" size={15} className="text-muted" /> {g.label}
                </p>
                <p className="mt-2 font-medium text-muted">Not available: awaiting data permission</p>
                <p className="mt-2">{g.reason}</p>
                <p className="mt-2 text-muted">{g.own}</p>
              </li>
            ))}
          </ul>
        </section>

        <Card aria-labelledby="schemes-heading">
          <h2 id="schemes-heading" className="text-xl font-semibold">
            Schemes
          </h2>
          <p className="mt-1 text-sm text-muted">
            Scheme names containing “{a.searchTerm}” from MFAPI.in (a mirror of AMFI NAV data), up to 50 results. Similar names from other fund houses can
            appear, and closed schemes may be listed. Open a scheme to see its fund house as the provider reports it.
          </p>
          <div className="mt-4">
            <FundSearch label={`Search ${a.displayName} schemes`} initialQuery={a.searchTerm} />
          </div>
        </Card>

        <p className="text-sm">
          <Link href="/amcs">← All fund houses</Link>
        </p>
      </PageBody>
    </>
  );
}
