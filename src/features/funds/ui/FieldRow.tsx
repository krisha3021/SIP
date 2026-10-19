import { RESEARCH_FIELD_LABELS, type ProvenancedField, type ResearchFieldKey } from '@/contracts';
import { formatIndianNumber } from '@/lib/format/inr';
import { formatTimestamp } from './api';

const STATUS_TEXT: Record<ProvenancedField['status'], string> = {
  available: '',
  'not-available': 'Not available',
  'insufficient-history': 'Insufficient history',
  'blocked-licensing': 'Not available — awaiting data permission',
  'not-configured': 'Not available',
  stale: 'Stale',
};

const LICENCE_TEXT: Record<ProvenancedField['license_or_usage_status'], string> = {
  permitted: 'Display permitted',
  'awaiting-permission': 'Awaiting permission from the data owner',
  unlicensed: 'No display licence held',
  'not-applicable': 'No source configured',
};

/** Formats a value by its unit. Never invents a unit or rounds beyond the source's precision. */
export function formatFieldValue(f: ProvenancedField): string {
  if (f.value === null) return STATUS_TEXT[f.status];
  if (typeof f.value === 'string') return f.value;
  switch (f.unit) {
    case 'percent':
      return `${f.value}%`;
    case 'inr-crore':
      return `₹${formatIndianNumber(f.value, 2)} crore`;
    case 'inr':
      return `₹${formatIndianNumber(f.value, 0)}`;
    case 'inr-per-unit':
      return `₹${formatIndianNumber(f.value, 4)}`;
    default:
      return String(f.value);
  }
}

export function FieldValue({ field: f }: { field: ProvenancedField }) {
  return (
    <>
      <span className={f.value === null ? 'text-muted' : 'num font-medium'}>{formatFieldValue(f)}</span>
      {f.value !== null && f.observation_date && <span className="ml-2 text-xs text-muted">as of {f.observation_date}</span>}
      {f.status === 'stale' && <span className="ml-2 text-xs text-warning">(older than the provider’s cadence)</span>}
      {f.reason && <p className="mt-0.5 text-xs text-muted">{f.reason}</p>}
      <details className="mt-0.5 text-xs">
        <summary className="cursor-pointer text-muted">Provenance</summary>
        <dl className="mt-1 grid grid-cols-[9rem_1fr] gap-x-2 text-muted">
          <dt>Provider</dt>
          <dd>{f.provider}</dd>
          <dt>Scope</dt>
          <dd>
            {f.scope}
            {f.plan_type !== 'Unknown' ? ` · ${f.plan_type} / ${f.option_type}` : ' · whole scheme'}
          </dd>
          <dt>Observation date</dt>
          <dd>{f.observation_date ?? 'Not available'}</dd>
          <dt>Retrieved</dt>
          <dd>{f.retrieved_at ? formatTimestamp(f.retrieved_at) : 'Not retrieved'}</dd>
          <dt>Usage</dt>
          <dd>{LICENCE_TEXT[f.license_or_usage_status]}</dd>
          <dt>Validation</dt>
          <dd>{f.validation_status}</dd>
        </dl>
        {f.source_url && (
          <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block">
            View source
          </a>
        )}
      </details>
    </>
  );
}

/** Definition list of research fields, each with its value or an honest status, and its provenance. */
export function ResearchFieldList({ fields }: { fields: Partial<Record<ResearchFieldKey, ProvenancedField>> }) {
  const entries = (Object.keys(fields) as ResearchFieldKey[]).filter((k) => k !== 'rating');
  return (
    <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[14rem_1fr]">
      {entries.map((k) => (
        <div key={k} className="contents">
          <dt className="text-muted">{RESEARCH_FIELD_LABELS[k]}</dt>
          <dd>
            <FieldValue field={fields[k]!} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
