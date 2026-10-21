import Link from 'next/link';
import { projectAccumulation } from '@/contracts';
import { ProjectionBadge } from '@/components/ui/primitives';
import { formatINRCompact } from '@/lib/format/inr';

/** One fixed, fully stated example — computed by the same engine as the SIP calculator, never a market figure. */
export const EXAMPLE = {
  monthlyContribution: 10_000,
  annualReturnPct: 12,
  months: 180,
} as const;

const W = 320;
const H = 140;

/** Hero card: a worked SIP example with its assumptions, and a small chart of invested vs projected value. */
export function ExampleProjection() {
  const r = projectAccumulation({ ...EXAMPLE });
  if (!r.ok) return null;
  const { yearly, summary } = r.value;
  const max = summary.finalValue;
  const pts = [{ invested: 0, value: 0 }, ...yearly];
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 8);
  const line = (key: 'invested' | 'value') => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('value')} L${W},${H} L0,${H} Z`;

  return (
    <figure className="relative rounded-2xl border border-line bg-surface p-5 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="font-sans text-sm font-semibold">Worked example: ₹10,000 a month for 15 years</figcaption>
        <ProjectionBadge />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 h-36 w-full"
        role="img"
        aria-label={`Projected value rises to ${formatINRCompact(summary.finalValue)} against ${formatINRCompact(summary.totalInvested)} invested.`}
      >
        <defs>
          <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--chart-grid)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#hero-area)" />
        <path d={line('invested')} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line('value')} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 px-2 py-2">
          <dt className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className="inline-block h-0.5 w-3 border-t-2 border-dashed border-[var(--chart-2)]" /> Invested
          </dt>
          <dd className="num font-semibold">{formatINRCompact(summary.totalInvested)}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-2">
          <dt className="text-xs text-muted">Growth</dt>
          <dd className="num font-semibold">{formatINRCompact(summary.gains)}</dd>
        </div>
        <div className="rounded-lg bg-brand-soft px-2 py-2">
          <dt className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className="inline-block h-0.5 w-3 bg-[var(--chart-1)]" /> Projected
          </dt>
          <dd className="num font-semibold text-brand-strong">{formatINRCompact(summary.finalValue)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Assumes a constant 12% a year (effective), contributions at month-end, no inflation adjustment. Real returns vary and can be negative.{' '}
        <Link href="/calculators/sip">Try your own numbers</Link>
      </p>
    </figure>
  );
}
