import type { Metadata } from 'next';
import Link from 'next/link';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { LegalDraftBanner, Owner } from '@/features/legal/ui/ownerDetails';

export const metadata: Metadata = { title: 'Terms of use' };

/* Mirror: docs/owner-actions/legal-drafts.md. Keep both in sync. */
export default function TermsPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Terms' }]} title="Terms of use" />
      <PageBody>
        <Prose>
          <LegalDraftBanner />
          <p>
            Effective date: <Owner field="effectiveDate" label="effective date" />. These terms are between you and <Owner field="legalName" label="legal name or entity" />{' '}
            (“we”), which operates Lakshya.
          </p>

          <h2>1. What Lakshya is</h2>
          <p>
            Lakshya is a free, educational website with investment calculators and mutual-fund research tools for India. It is not a SEBI-registered investment
            adviser or research analyst. Nothing on the site is investment, tax, legal or financial advice, a recommendation to buy, sell or hold any security or
            scheme, or a suitability assessment. Read the <Link href="/disclaimer">Disclaimer</Link>.
          </p>

          <h2>2. Using the site</h2>
          <ul>
            <li>You can use the site without an account. You are responsible for the assumptions you enter and for any decision you make.</li>
            <li>Do not try to disrupt the site, bypass its rate limits, scrape it at volume, or use its API routes as a data feed.</li>
            <li>We may change, suspend or withdraw any feature at any time.</li>
          </ul>

          <h2>3. Results and data</h2>
          <ul>
            <li>Calculator results are projections based entirely on the assumptions you enter. Actual results will differ.</li>
            <li>
              Fund NAV data comes from MFAPI.in, an independent third party that republishes AMFI data. It may be delayed, incomplete or wrong. We show the date of
              each observation and never call it live.
            </li>
            <li>Tax estimates cover only the cases and rules shown on the calculator, for financial years marked as verified.</li>
            <li>We do not guarantee that the site is accurate, complete, available or error-free.</li>
          </ul>

          <h2>4. Your content</h2>
          <p>Saved plans stay in your own browser. Share links contain only the non-sensitive assumptions shown on the page. You choose whom to send them to.</p>

          <h2>5. Intellectual property</h2>
          <p>
            The site&apos;s design, text and code belong to <Owner field="legalName" label="legal name or entity" />. Lakshya was created by Alok Shukla. Third-party
            data remains subject to its providers&apos; terms.
          </p>

          <h2>6. Liability</h2>
          <p>
            To the extent the law allows, we are not liable for any loss arising from use of, or reliance on, the site or its results.{' '}
            <Owner field="liabilityClause" label="final liability wording, reviewed by a qualified professional" />
          </p>

          <h2>7. Governing law</h2>
          <p>
            These terms are governed by <Owner field="governingLaw" label="governing law" />. Courts at <Owner field="jurisdiction" label="jurisdiction (city / courts)" /> have
            jurisdiction.
          </p>

          <h2>8. Contact and changes</h2>
          <p>
            Questions: <Owner field="contactEmail" label="contact email" />. If these terms change, the new version will be posted here with a new effective date.
          </p>
        </Prose>
      </PageBody>
    </>
  );
}
