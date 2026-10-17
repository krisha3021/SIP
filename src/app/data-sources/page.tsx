import type { Metadata } from 'next';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Data Sources', description: 'Where Lakshya’s data comes from, how current it is, and what is not available.' };

export default function DataSourcesPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Data Sources' }]} title="Data Sources" lede="What data Lakshya uses, where it comes from, and what we deliberately do not show." />
      <PageBody>
        <Prose>
          <h2>Mutual fund NAVs</h2>
          <ul>
            <li>
              <strong>Provider:</strong> MFAPI.in (
              <a href="https://www.mfapi.in" rel="noopener noreferrer">
                mfapi.in
              </a>
              ), an independent third-party service that republishes NAV data originally published by AMCs through AMFI. It is not an official AMFI service.
            </li>
            <li>
              <strong>Fields used:</strong> scheme code, scheme name, fund house, category, scheme type, ISINs, and dated NAVs.
            </li>
            <li>
              <strong>Plan and option</strong> (Direct/Regular, Growth/IDCW) are read from the scheme name. When the name does not say, we show &quot;Not stated&quot; rather than guess.
            </li>
            <li>
              <strong>Freshness:</strong> NAVs are published once per business day. A NAV is shown as the latest available when it is within three weekdays of today (India time); otherwise it is marked stale.
            </li>
            <li>
              <strong>Caching:</strong> our server reuses a successfully fetched copy for up to 6 hours (NAVs change at most once per business day). If the provider fails, the last good copy is served with its original dates and a &quot;Cached&quot; label.
            </li>
            <li>The provider&apos;s terms for commercial use and redistribution must be confirmed before public launch.</li>
          </ul>
          <h2>Not available</h2>
          <ul>
            <li>Live or delayed index and stock quotes: no licensed quote provider is configured, so no ticker is shown.</li>
            <li>AUM, expense ratios, holdings, fund managers and third-party star ratings: not provided by our source, so shown as &quot;Not available&quot;.</li>
          </ul>
          <h2>Tax rules</h2>
          <p>
            Tax slabs and limits come from a financial-year configuration that links to the Income Tax Department pages used for verification. Unverified years are disabled. See{' '}
            <a href="/methodology#tax">Methodology</a>.
          </p>
          <h2>Your inputs</h2>
          <p>Calculator inputs are assumptions you choose. Results are projections from those assumptions, not data.</p>
        </Prose>
      </PageBody>
    </>
  );
}
