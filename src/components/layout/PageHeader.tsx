import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  href?: string;
  label: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all: Crumb[] = [{ href: '/', label: 'Home' }, ...items];
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-muted">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {last || !c.href ? (
                <span aria-current={last ? 'page' : undefined} className={last ? 'font-medium text-text' : undefined}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="text-muted hover:text-brand">
                  {c.label}
                </Link>
              )}
              {!last && <ChevronRight aria-hidden="true" size={14} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  crumbs,
  title,
  lede,
  children,
}: {
  crumbs: Crumb[];
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {lede && <p className="mt-2 max-w-3xl text-muted">{lede}</p>}
        {children}
      </div>
    </div>
  );
}

export function PageBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 py-8 sm:px-6 ${className}`}>{children}</div>;
}

/** Prose wrapper for static content pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl space-y-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
      {children}
    </div>
  );
}
