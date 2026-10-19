import type { ProvenancedField } from '@/contracts';

export interface RatingMeta {
  scale: number;
  /** The category or peer group the provider rated within. */
  category: string;
  methodologyUrl?: string;
  /** Attribution text required by the provider's licence. */
  attribution: string;
}

/**
 * Third-party rating. Stars render only for an available, display-permitted value from a single named provider with
 * its date, scale, context and attribution. Otherwise "Rating unavailable" — never zero stars, never an average
 * across providers, never generated. Any internal score must be shown elsewhere, visually separate.
 */
export function RatingDisplay({ field, meta }: { field: ProvenancedField; meta?: RatingMeta }) {
  const value = typeof field.value === 'number' ? field.value : null;
  const showable =
    field.status === 'available' &&
    field.license_or_usage_status === 'permitted' &&
    meta !== undefined &&
    value !== null &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= meta.scale;

  if (!showable) {
    return (
      <div className="text-sm">
        <p className="font-medium">Rating unavailable</p>
        {field.reason && <p className="mt-0.5 text-xs text-muted">{field.reason}</p>}
      </div>
    );
  }
  const label = `${value} out of ${meta.scale} — ${field.provider}`;
  return (
    <div className="space-y-1 text-sm">
      <p role="img" aria-label={label} className="text-lg tracking-wider text-brand">
        <span aria-hidden="true">{'★'.repeat(value)}{'☆'.repeat(meta.scale - value)}</span>
      </p>
      <p>
        <span className="font-medium">{field.provider}</span> · rated {field.observation_date} · within {meta.category}
      </p>
      {meta.methodologyUrl && (
        <a href={meta.methodologyUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
          Rating methodology
        </a>
      )}
      <p className="text-xs text-muted">{meta.attribution}</p>
      <p className="text-xs text-muted">A rating describes past characteristics within its category; it is not a prediction of future performance.</p>
    </div>
  );
}
