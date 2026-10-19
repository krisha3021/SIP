import type { DatasetTimestamps, FreshnessState, Provenance } from '@/contracts';
import { Badge, Notice } from '@/components/ui/primitives';
import { formatCount } from '@/features/calculators/ui/format';
import { formatTimestamp, freshnessLabel, type NavResponse } from './api';

export function FreshnessBadge({ freshness, provenance, servedFrom }: { freshness: FreshnessState; provenance: Provenance; servedFrom: NavResponse['servedFrom'] }) {
  const f = freshnessLabel(freshness, provenance, servedFrom);
  return <Badge tone={f.tone}>{f.label}</Badge>;
}

/** Where the data came from and how current it is. Freshness is from the observation date, never the page load time. */
export function ProvenancePanel({ provenance: p, freshness, servedFrom, lastError, droppedRows, timestamps }: { provenance: Provenance; freshness: FreshnessState; servedFrom: NavResponse['servedFrom']; lastError: string | null; droppedRows: number; timestamps: DatasetTimestamps }) {
  const f = freshnessLabel(freshness, p, servedFrom);
  const rows: Array<[string, React.ReactNode]> = [
    ['Provider', p.provider],
    ['Identifier', p.identifier],
    ['Plan / option', `${p.plan} / ${p.option}${p.plan === 'Unknown' || p.option === 'Unknown' ? ' (not stated in the scheme name)' : ''}`],
    ['Data as of', timestamps.dataAsOf ?? 'Not available'],
    ['Provider publication date', timestamps.providerPublishedAt ? formatTimestamp(timestamps.providerPublishedAt) : 'Not supplied by this provider'],
    ['Last successful retrieval', timestamps.lastSuccessfulRetrieval ? formatTimestamp(timestamps.lastSuccessfulRetrieval) : 'Not available'],
    ['Last attempted refresh', timestamps.lastAttemptedRefresh ? formatTimestamp(timestamps.lastAttemptedRefresh) : 'Not available'],
    ['Freshness status', f.label],
    ['Coverage', p.coverage ? `${p.coverage.from} to ${p.coverage.to} · ${formatCount(p.coverage.observations)} observations` : 'Not available'],
    ['Units', p.units],
  ];
  return (
    <section aria-labelledby="prov-heading" role="region" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="prov-heading" className="font-sans text-base font-semibold">
          Data source
        </h2>
        <FreshnessBadge freshness={freshness} provenance={p} servedFrom={servedFrom} />
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[11rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="num break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {servedFrom === 'last-known-good' && (
        <Notice tone="warning" title="Showing the last copy we fetched successfully">
          The latest request to the provider failed{lastError ? ` (${lastError})` : ''}. Dates above are from the earlier successful fetch and have not been advanced.
        </Notice>
      )}
      {droppedRows > 0 && <p className="text-xs text-muted">{droppedRows} malformed row(s) from the provider were ignored.</p>}
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
        {p.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>MFAPI.in is an independent third-party service that republishes AMFI NAV data; it is not an official AMFI service.</li>
      </ul>
    </section>
  );
}
