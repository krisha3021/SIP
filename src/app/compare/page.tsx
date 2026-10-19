import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { CompareFunds } from '@/features/compare/ui/CompareFunds';

export const metadata: Metadata = {
  title: 'Compare Funds',
  description: 'Compare up to four mutual fund schemes on the same rows, with warnings when categories, plans or dates differ.',
};

/** Scheme codes in the URL are public identifiers, not personal data. */
function parseCodes(raw: string | string[] | undefined): number[] {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return [];
  return [...new Set(s.split(',').filter((c) => /^\d{1,7}$/.test(c)).map(Number))].slice(0, 4);
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const codes = parseCodes((await searchParams).codes);
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Compare Funds' }]}
        title="Compare Funds"
        lede="Put up to four schemes side by side on the same rows. Where fields are unavailable or not comparable, we say so rather than fill the gap."
      />
      <PageBody>
        <CompareFunds initialCodes={codes} />
      </PageBody>
    </>
  );
}
