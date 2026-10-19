import type { Metadata } from 'next';
import { DISCLAIMER } from '@/contracts';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { LegalDraftBanner, Owner } from '@/features/legal/ui/ownerDetails';

export const metadata: Metadata = { title: 'Disclaimer' };

/* Mirror: docs/owner-actions/legal-drafts.md. Keep both in sync. */
export default function DisclaimerPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Disclaimer' }]} title="Disclaimer" />
      <PageBody>
        <Prose>
          <LegalDraftBanner />
          <p className="text-lg">{DISCLAIMER}</p>
          <h2>Educational use only</h2>
          <ul>
            <li>Lakshya is not registered with SEBI as an investment adviser or research analyst, and does not give personalised advice.</li>
            <li>No page recommends, rates or ranks any fund, product or allocation. Lakshya shows no star ratings.</li>
            <li>
              The Life-stage &amp; Risk Planner and the Allocation Explorer are educational illustrations of a published rule. They are not suitability
              assessments. For personalised advice, consult a SEBI-registered investment adviser.
            </li>
          </ul>
          <h2>Projections and models</h2>
          <ul>
            <li>Projections assume constant returns unless a page says otherwise. Real returns vary, and can be negative.</li>
            <li>Monte Carlo percentages describe a simplified model, not the probability of a real-world outcome.</li>
            <li>A stress test shows one fall observed in past data. Future falls can be larger or last longer.</li>
          </ul>
          <h2>Data</h2>
          <ul>
            <li>
              NAV data comes from MFAPI.in, an independent third party that republishes AMFI data. It may contain errors or gaps. Past performance does not
              indicate future results.
            </li>
            <li>There is no live market data on this site.</li>
            <li>Tax estimates cover only the cases and rules listed on the calculator, for verified financial years.</li>
          </ul>
          <p>
            Questions: <Owner field="contactEmail" label="contact email" />. Operated by <Owner field="legalName" label="legal name or entity" />. Effective date:{' '}
            <Owner field="effectiveDate" label="effective date" />.
          </p>
        </Prose>
      </PageBody>
    </>
  );
}
