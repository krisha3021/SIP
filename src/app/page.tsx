import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Calculator,
  CheckCircle2,
  FlaskConical,
  Layers,
  LineChart,
  Lock,
  Scale,
  Search,
  ShieldCheck,
  Star,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/primitives';
import { CALCULATORS } from '@/features/calculators/ui/registry';
import { ExampleProjection } from '@/features/home/ui/ExampleProjection';
import { AMCS, SEBI_REGISTER_RETRIEVED_ON } from '@/lib/data/amc/registry';

interface Entry {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
}

const GROUPS: Array<{
  id: string;
  title: string;
  lede: string;
  entries: Entry[];
}> = [
  {
    id: 'plan',
    title: 'Plan',
    lede: 'Turn a goal into a monthly number, with every assumption on the page.',
    entries: [
      {
        href: '/calculators/sip',
        icon: Calculator,
        title: 'SIP calculator',
        text: 'Project a monthly investment with its timing and rate convention spelled out.',
      },
      {
        href: '/calculators/goal-planner',
        icon: Target,
        title: 'Goal planner',
        text: 'The SIP a goal needs, in today’s or future rupees, and any shortfall.',
      },
      {
        href: '/calculators/monte-carlo',
        icon: FlaskConical,
        title: 'Uncertainty explorer',
        text: 'A range of outcomes from a simple, reproducible random-return model.',
      },
    ],
  },
  {
    id: 'research',
    title: 'Research',
    lede: 'Read what providers publish, with the date it was observed.',
    entries: [
      {
        href: '/funds',
        icon: Search,
        title: 'Scheme search',
        text: 'NAV history for any scheme, with provider, plan, option and dates.',
      },
      {
        href: '/amcs',
        icon: Building2,
        title: 'Fund houses',
        text: `All ${AMCS.length} SEBI-registered mutual funds: registration, website and schemes.`,
      },
      {
        href: '/compare',
        icon: Scale,
        title: 'Compare funds',
        text: 'Up to four schemes on the same rows, with warnings when they don’t compare.',
      },
      {
        href: '/watchlist',
        icon: Star,
        title: 'Watchlist',
        text: 'Follow schemes in this browser — no account needed.',
      },
    ],
  },
  {
    id: 'test',
    title: 'Test ideas',
    lede: 'Check a strategy against history and against a range of futures.',
    entries: [
      {
        href: '/historical',
        icon: LineChart,
        title: 'Backtest a SIP',
        text: 'Replay a SIP on observed NAVs, with each allotment and skipped instalment.',
      },
      {
        href: '/strategy-lab',
        icon: Layers,
        title: 'Strategy Lab',
        text: 'SIP, step-up, lump sum and allocation mixes on your own assumptions.',
      },
    ],
  },
];

const PRINCIPLES = [
  {
    title: 'Assumptions on show',
    text: 'Every projection says what it assumes — return, timing, inflation — and is labelled as a projection.',
  },
  {
    title: 'Data with its date',
    text: 'Fund data shows its provider and observation date. Missing fields say “Not available”, never a guess.',
  },
  {
    title: 'Private by default',
    text: 'No sign-in. Plans and watchlists stay in your browser, and nothing leaves it unless you approve that action.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Set a goal',
    text: 'Pick an amount and a date, or start from what you can invest each month.',
  },
  {
    n: '2',
    title: 'See the range',
    text: 'Compare a constant-return projection with downside and upside scenarios.',
  },
  {
    n: '3',
    title: 'Research schemes',
    text: 'Read NAV history and fund-house details from named, dated sources.',
  },
];

export default function HomePage() {
  const stats = [
    {
      value: String(CALCULATORS.length),
      label: 'calculators, all free and public',
    },
    {
      value: String(AMCS.length),
      label: `fund houses on SEBI’s register (${SEBI_REGISTER_RETRIEVED_ON})`,
    },
    { value: '0', label: 'sign-ups needed to use any tool' },
    { value: '₹0', label: 'to use: no paywall, no subscription' },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <HeroBackdrop />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-semibold tracking-wide text-brand-strong uppercase">
              <ShieldCheck aria-hidden="true" size={14} /> Educational planning for India
            </p>
            <h1 className="mt-5 text-4xl font-semibold text-balance sm:text-5xl lg:text-6xl">
              Plan your money with numbers <span className="text-brand">you can check.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Calculators that show every assumption, and fund research that shows only what providers publish — with its date. No sign-in, no sales pitch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/calculators/sip" variant="primary">
                Start with a SIP <ArrowRight aria-hidden="true" size={16} />
              </ButtonLink>
              <ButtonLink href="/funds">Research a fund</ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {['No sign-in', 'No live-price theatre', 'Sources on every figure'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 aria-hidden="true" size={16} className="text-brand" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ExampleProjection />
        </div>
      </section>

      {/* Stats band */}
      <section aria-label="Lakshya at a glance" className="border-b border-line bg-surface-2">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col-reverse px-2 py-6 sm:px-4">
              <dt className="mt-1 text-sm text-muted">{s.label}</dt>
              <dd className="num font-display text-3xl font-semibold text-brand-strong">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Tool groups */}
      <section aria-labelledby="tools-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <h2 id="tools-heading" className="text-3xl font-semibold">
            Everything in one place
          </h2>
          <p className="mt-2 text-muted">Three kinds of tools, each with its method written down.</p>
        </div>
        <div className="mt-8 space-y-10">
          {GROUPS.map((g) => (
            <div key={g.id} className="grid gap-5 lg:grid-cols-[14rem_1fr]">
              <div>
                <h3 id={`grp-${g.id}`} className="text-xl font-semibold">
                  {g.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{g.lede}</p>
              </div>
              <ul aria-labelledby={`grp-${g.id}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.entries.map(({ href, icon: Icon, title, text }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group flex h-full gap-4 rounded-xl border border-line bg-surface p-5 text-text no-underline transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_12px_30px_-18px_rgb(0_0_0/0.4)]"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong transition group-hover:bg-brand group-hover:text-on-brand"
                      >
                        <Icon size={22} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-semibold group-hover:text-brand">
                          {title}
                          <ArrowRight aria-hidden="true" size={15} className="opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </span>
                        <span className="mt-1 block text-sm text-muted">{text}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm">
          <Link href="/calculators" className="font-medium">
            See all {CALCULATORS.length} calculators <span aria-hidden="true">→</span>
          </Link>
        </p>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 id="how-heading" className="text-3xl font-semibold">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-xl border border-line bg-bg p-5">
                <span aria-hidden="true" className="num grid size-9 place-items-center rounded-full bg-brand font-semibold text-on-brand">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Principles + fund houses */}
      <section aria-labelledby="trust-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 id="trust-heading" className="text-3xl font-semibold">
              What you can rely on
            </h2>
            <ul className="mt-6 space-y-4">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <CheckCircle2 aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-brand" />
                  <div>
                    <p className="font-semibold">{p.title}</p>
                    <p className="text-sm text-muted">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex gap-2 text-sm">
              <Lock aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-muted" />
              <span>
                <Link href="/privacy-permissions">Privacy &amp; Permissions</Link> explains what stays on this device.{' '}
                <Link href="/methodology">Methodology</Link> has every formula.
              </span>
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">Fund houses</h2>
              <Link href="/amcs" className="text-sm font-medium">
                All {AMCS.length} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="mt-1 text-sm text-muted">
              Every mutual fund on SEBI’s register, with its registration number and, where verified, its official website.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {[...AMCS]
                .sort((a, b) => a.registeredOn.localeCompare(b.registeredOn))
                .slice(0, 12)
                .map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/amcs/${a.slug}`}
                      className="inline-block rounded-full border border-line bg-surface-2 px-3 py-1 text-sm text-text no-underline hover:border-brand hover:text-brand"
                    >
                      {a.displayName}
                    </Link>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Shown by registration date, earliest first. Not a ranking or recommendation.</p>
          </div>
        </div>
      </section>

      {/* Disclaimer band */}
      <section className="border-t border-line bg-surface-2">
        <p className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted sm:px-6">
          Educational use only. Not investment advice. Lakshya is not a SEBI-registered investment adviser or research analyst, and is not affiliated with any
          mutual fund. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.
        </p>
      </section>
    </>
  );
}

/** Decorative backdrop: soft brand glow and a faint grid. Purely ornamental, hidden from assistive tech. */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -top-32 -right-24 size-[34rem] rounded-full bg-brand-soft opacity-70 blur-3xl" />
      <div className="absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-warning-soft opacity-60 blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.35]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="var(--border)" strokeWidth="1" />
          </pattern>
          <radialGradient id="hero-fade" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="hero-mask">
            <rect width="100%" height="100%" fill="url(#hero-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" mask="url(#hero-mask)" />
      </svg>
    </div>
  );
}
