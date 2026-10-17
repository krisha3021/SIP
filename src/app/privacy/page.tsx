import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';
import { LegalDraftBanner, Owner } from '@/features/legal/ui/ownerDetails';

export const metadata: Metadata = { title: 'Privacy' };

/* Mirror: docs/owner-actions/legal-drafts.md. Keep both in sync. */
export default function PrivacyPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Privacy' }]} title="Privacy notice" />
      <PageBody>
        <Prose>
          <LegalDraftBanner />
          <p>
            Effective date: <Owner field="effectiveDate" label="effective date" />.
          </p>

          <h2>Who runs Lakshya</h2>
          <p>
            Lakshya is operated by <Owner field="legalName" label="legal name or entity" />, <Owner field="postalAddress" label="postal address" />. Contact:{' '}
            <Owner field="contactEmail" label="contact email" />. Grievance officer: <Owner field="grievanceOfficer" label="grievance officer name and contact" />.
          </p>

          <h2>What happens to the information you enter</h2>
          <ul>
            <li>
              <strong>No accounts.</strong> There is no sign-up or sign-in, and we do not ask for your name, phone number or email.
            </li>
            <li>
              <strong>Calculators run in your browser.</strong> The amounts, ages and other assumptions you type are processed on your device. They are not sent to
              our server.
            </li>
            <li>
              <strong>Saved plans</strong> and your light/dark theme choice are stored in your browser&apos;s localStorage. They never leave your device. You can delete
              them on the Saved Plans page or by clearing this site&apos;s data in your browser.
            </li>
            <li>
              <strong>Share links</strong> contain only non-sensitive assumptions, such as return rates, horizons and conventions. They never contain income,
              expenses, loan EMIs, dependants, earning members, savings, existing holdings, or income-tax inputs. Anyone you send a link to can read what is in it.
            </li>
            <li>
              <strong>Downloads</strong> (CSV/Excel) and printouts are created on your device and can include everything you entered. We do not receive a copy.
            </li>
            <li>
              <strong>Fund search and NAV data.</strong> When you search for a fund or open a scheme, your search text or scheme code is sent to our server, which
              requests public NAV data from MFAPI.in, an independent third-party service that republishes AMFI data. MFAPI.in receives the search text or scheme
              code, not who you are.
            </li>
          </ul>

          <h2>Cookies, analytics and advertising</h2>
          <p>Lakshya sets no cookies and includes no analytics, tracking or advertising scripts. Fonts are served from our own domain.</p>

          <h2>Hosting logs</h2>
          <p>
            The site is hosted on Vercel. Like most hosts, Vercel processes technical request data (such as IP address, browser user agent, the page or API path
            requested and the time) to deliver the site, protect it from abuse and help us diagnose errors. Our API applies a per-IP rate limit kept briefly in
            memory. Log retention follows Vercel&apos;s plan settings: <Owner field="logRetention" label="log retention period, from the Vercel plan" />. Requests
            may be processed in data centres in and outside India.
          </p>

          <h2>Your rights</h2>
          <p>
            Because Lakshya does not keep accounts or store what you type, there is usually no personal data of yours on our systems beyond short-lived hosting
            logs. You may contact us at <Owner field="contactEmail" label="contact email" /> about any privacy question, including rights you may have under
            applicable law such as India&apos;s Digital Personal Data Protection Act, 2023.
          </p>

          <h2>Changes</h2>
          <p>If this notice changes, the new version will be posted here with a new effective date.</p>
        </Prose>
      </PageBody>
    </>
  );
}
