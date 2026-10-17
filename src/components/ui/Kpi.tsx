import { formatINR, formatINRCompact } from '@/lib/format/inr';

/** Compact INR (lakh/crore) with the exact amount available as a tooltip and to screen readers. */
export function Money({ value, className = '' }: { value: number; className?: string }) {
  const exact = formatINR(value);
  return (
    <span className={`num ${className}`} title={exact}>
      <span aria-hidden="true">{formatINRCompact(value)}</span>
      <span className="sr-only">{exact}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  emphasis,
  testId,
}: {
  label: string;
  /** A rupee amount (rendered compact + exact) or preformatted text. */
  value: number | string;
  sub?: React.ReactNode;
  emphasis?: boolean;
  testId?: string;
}) {
  const isMoney = typeof value === 'number';
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border p-3 sm:p-4 ${emphasis ? 'border-brand/50 bg-brand-soft' : 'border-line bg-surface'}`}
    >
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1">
        <span className={`num block text-xl font-semibold sm:text-2xl ${emphasis ? 'text-brand-strong' : 'text-text'}`}>
          {isMoney ? <Money value={value} /> : value}
        </span>
        {isMoney && (
          <span className="num mt-0.5 block text-xs text-muted" aria-hidden="true">
            Exact: {formatINR(value)}
          </span>
        )}
        {sub && <span className="mt-1 block text-xs text-muted">{sub}</span>}
      </dd>
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-4">{children}</dl>;
}
