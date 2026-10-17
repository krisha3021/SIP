import Link from 'next/link';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const buttonBase =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  secondary: 'border border-line-strong bg-surface text-text hover:bg-surface-2',
  ghost: 'text-brand hover:bg-brand-soft',
};

export function buttonClass(variant: ButtonVariant = 'secondary', extra = '') {
  return `${buttonBase} ${buttonVariants[variant]} ${extra}`;
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ href, variant = 'secondary', className = '', children }: { href: string; variant?: ButtonVariant; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

type Tone = 'info' | 'warning' | 'danger';
const toneClass: Record<Tone, string> = {
  info: 'border-info/40 bg-info-soft text-info',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  danger: 'border-danger/40 bg-danger-soft text-danger',
};
const toneIcon = { info: Info, warning: AlertTriangle, danger: OctagonAlert };

export function Notice({
  tone = 'info',
  title,
  children,
  role,
  className = '',
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}) {
  const Icon = toneIcon[tone];
  return (
    <div role={role} className={`flex gap-3 rounded-lg border p-3 text-sm ${toneClass[tone]} ${className}`}>
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="[&_a]:text-inherit [&_a]:underline">{children}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'warning' | 'danger' | 'info' }) {
  const cls = {
    neutral: 'border-line-strong text-text bg-surface-2',
    brand: 'border-brand/40 text-brand-strong bg-brand-soft',
    warning: 'border-warning/40 text-warning bg-warning-soft',
    danger: 'border-danger/40 text-danger bg-danger-soft',
    info: 'border-info/40 text-info bg-info-soft',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

/** The mandatory label on every projected result. */
export function ProjectionBadge() {
  return <Badge tone="info">Projection (assumption-based)</Badge>;
}
