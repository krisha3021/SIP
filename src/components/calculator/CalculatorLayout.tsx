'use client';

import { RotateCcw, Printer } from 'lucide-react';
import { Button, Notice, ProjectionBadge } from '@/components/ui/primitives';
import type { CalcError } from '@/contracts';

/** Two-column calculator frame: assumptions on the left, results on the right (stacked on mobile). */
export function CalculatorLayout({
  form,
  results,
  onReset,
  actions,
  formTitle = 'Your assumptions',
  badge = <ProjectionBadge />,
}: {
  form: React.ReactNode;
  results: React.ReactNode;
  onReset: () => void;
  actions?: React.ReactNode;
  formTitle?: string;
  /** Label beside the results heading; projections use "Projection (assumption-based)". */
  badge?: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(20rem,26rem)_1fr]">
      <section aria-labelledby="assumptions-heading" className="rounded-xl border border-line bg-surface p-4 sm:p-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="assumptions-heading" className="text-xl font-semibold">
            {formTitle}
          </h2>
          <Button variant="ghost" onClick={onReset} className="no-print px-2">
            <RotateCcw aria-hidden="true" size={16} />
            Reset
          </Button>
        </div>
        <a href="#results-heading" className="no-print mb-4 inline-block text-sm font-semibold underline lg:hidden">
          Jump to results
        </a>
        <form className="space-y-5" onSubmit={(e) => e.preventDefault()} noValidate>
          {form}
        </form>
      </section>
      <section aria-labelledby="results-heading" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="results-heading" className="text-xl font-semibold">
              Results
            </h2>
            {badge}
          </div>
          <div className="no-print flex flex-wrap gap-2">
            {actions}
            <Button onClick={() => window.print()}>
              <Printer aria-hidden="true" size={16} />
              Print
            </Button>
          </div>
        </div>
        {results}
      </section>
    </div>
  );
}

/** Renders the engine's failure state. Never shows a substitute number. */
export function CalcErrorState({ error, parseIssue }: { error?: CalcError | null; parseIssue?: boolean }) {
  return (
    <div role="alert" aria-live="assertive">
      <Notice tone="danger" title="No result for these inputs">
        {parseIssue ? <p>Some inputs are not valid numbers. Fix the highlighted fields to see a projection.</p> : <p>{error?.message}</p>}
      </Notice>
    </div>
  );
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <Notice tone="warning" title={warnings.length === 1 ? 'Check this assumption' : 'Check these assumptions'} role="status">
      <ul className="list-disc space-y-1 pl-4">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Notice>
  );
}

/** Short methodology and limitations block shown under every calculator. */
export function MethodNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-line bg-surface p-4 text-sm open:pb-5">
      <summary className="cursor-pointer font-semibold">How this is calculated, and its limits</summary>
      <div className="mt-3 space-y-2 text-muted [&_li]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1">{children}</div>
      <p className="mt-3 text-muted">
        Full details: <a href="/methodology">Methodology</a>. Educational estimate only, not investment, tax or legal advice.
      </p>
    </details>
  );
}

/** Line describing the conventions in force, shown beside every result. */
export function ConventionsLine({ items }: { items: string[] }) {
  return (
    <p className="text-sm text-muted" data-testid="conventions">
      <span className="font-semibold text-text">Conventions: </span>
      {items.join(' · ')}
    </p>
  );
}
