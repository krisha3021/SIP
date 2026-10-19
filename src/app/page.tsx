import Link from 'next/link';
import { ArrowRight, Calculator, LineChart, Search, ShieldCheck, Target, FlaskConical, Scale, Star, Lock, Layers } from 'lucide-react';
import { ButtonLink } from '@/components/ui/primitives';

const ENTRY_POINTS = [
  { href: '/calculators/sip', icon: Calculator, title: 'SIP calculator', text: 'Project a monthly investment with the timing and rate convention spelled out.' },
  { href: '/calculators/goal-planner', icon: Target, title: 'Plan a goal', text: 'Find the SIP a goal needs, in today’s or future rupees, and your shortfall.' },
  { href: '/calculators/monte-carlo', icon: FlaskConical, title: 'Explore uncertainty', text: 'See a range of outcomes from a simple, reproducible random-return model.' },
  { href: '/funds', icon: Search, title: 'Research a fund', text: 'Search schemes and read the NAV history the provider publishes, with its dates.' },
  { href: '/historical', icon: LineChart, title: 'Backtest a SIP', text: 'Replay a SIP on observed NAVs, with each allotment date and skipped instalment.' },
  { href: '/strategy-lab', icon: Layers, title: 'Strategy Lab', text: 'Compare SIP, step-up, lump sum and allocation mixes on your own assumptions, with downside ranges.' },
  { href: '/compare', icon: Scale, title: 'Compare funds', text: 'Up to four schemes on the same rows, with warnings when they are not comparable.' },
  { href: '/watchlist', icon: Star, title: 'Watchlist', text: 'Follow schemes in this browser — no account needed.' },
  { href: '/privacy-permissions', icon: Lock, title: 'Privacy & Permissions', text: 'What stays on this device, and how any external action asks first.' },
  { href: '/methodology', icon: ShieldCheck, title: 'How we calculate', text: 'Formulas, conventions, data sources and known limits, in one place.' },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">Educational investment planning for India</p>
            <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Plan with numbers you can check.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              Lakshya’s calculators show every assumption, the contribution timing and the rate convention behind each result. Fund research shows only what
              the data provider publishes, with its observation date.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/calculators" variant="primary">
                Browse calculators <ArrowRight aria-hidden="true" size={16} />
              </ButtonLink>
              <ButtonLink href="/funds">Research a fund</ButtonLink>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 p-5 text-sm">
            <h2 className="font-sans text-base font-semibold">What you can rely on here</h2>
            <ul className="mt-3 space-y-2">
              <li>• No sign-in: every calculator is public.</li>
              <li>• Results are labelled “Projection (assumption-based)”.</li>
              <li>• No live-market ticker: we have no licensed quote feed, so we show none.</li>
              <li>• Fund data shows provider, scheme code and observation date. Missing fields say “Not available”.</li>
              <li>• Saved plans and your watchlist stay in your browser.</li>
              <li>• The header clock is your device’s time in IST; each dataset shows its own dates.</li>
              <li>• Nothing personal leaves this device unless you approve a specific action first.</li>
            </ul>
            <p className="mt-4 text-muted">Educational use only. Not investment advice. Lakshya is not a SEBI-registered investment adviser or research analyst.</p>
          </div>
        </div>
      </section>
      <section aria-labelledby="start-heading" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h2 id="start-heading" className="text-2xl font-semibold">
          Start here
        </h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ENTRY_POINTS.map(({ href, icon: Icon, title, text }) => (
            <li key={href}>
              <Link href={href} className="group block h-full rounded-xl border border-line bg-surface p-5 text-text no-underline hover:border-brand">
                <Icon aria-hidden="true" className="text-brand" size={22} />
                <span className="mt-3 block font-semibold group-hover:text-brand">{title}</span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
