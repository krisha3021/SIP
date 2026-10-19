// @vitest-environment jsdom
import './setup-dom';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProvenancePanel } from '@/features/funds/ui/ProvenancePanel';
import type { Provenance } from '@/contracts';

const p: Provenance = {
  provider: 'MFAPI.in (third-party mirror of AMFI NAV data)',
  providerUrl: 'https://api.mfapi.in/mf/122639',
  identifier: 'AMFI scheme code 122639',
  observedAt: '2026-10-16',
  fetchedAt: '2026-10-16T20:00:00.000Z',
  coverage: { from: '2013-05-28', to: '2026-10-16', observations: 3294 },
  plan: 'Direct',
  option: 'Growth',
  currency: 'INR',
  units: 'INR per unit',
  classification: 'observed',
  notes: [],
};

describe('ProvenancePanel timestamps', () => {
  it('shows data-as-of, provider publication, last success, last attempt and freshness as separate rows', () => {
    render(
      <ProvenancePanel
        provenance={p}
        freshness="stale"
        servedFrom="last-known-good"
        lastError="timeout"
        droppedRows={0}
        timestamps={{ dataAsOf: '2026-10-16', providerPublishedAt: null, lastSuccessfulRetrieval: '2026-10-16T20:00:00.000Z', lastAttemptedRefresh: '2026-10-19T04:00:00.000Z', freshness: 'stale' }}
      />,
    );
    const panel = screen.getByRole('region', { name: /data source/i });
    for (const label of ['Data as of', 'Provider publication date', 'Last successful retrieval', 'Last attempted refresh', 'Freshness status']) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
    expect(within(panel).getByText('Not supplied by this provider')).toBeInTheDocument();
    // The attempt time is shown and differs from the success time: a failed refresh did not advance success.
    const attempt = within(panel).getByText('Last attempted refresh').nextElementSibling!;
    const success = within(panel).getByText('Last successful retrieval').nextElementSibling!;
    expect(attempt.textContent).not.toBe(success.textContent);
    expect(within(panel).getByText('Data as of').nextElementSibling!.textContent).toBe('2026-10-16');
  });
});
