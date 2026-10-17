import Link from 'next/link';
import { FOOTER_NAV, PRIMARY_NAV } from './nav';
import { LogoMark } from './LogoMark';

export function SiteFooter() {
  return (
    <footer data-site-footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="font-display text-lg font-semibold">Lakshya</span>
          </div>
          <p className="mt-3 max-w-md text-sm text-muted">
            Educational investment planning and mutual fund research for Indian investors. Every result is an
            estimate that depends on the assumptions you enter. Not investment, tax or legal advice. Lakshya is not a
            SEBI-registered investment adviser or research analyst.
          </p>
          <p className="mt-4 text-sm font-medium">Created by Alok Shukla</p>
        </div>
        <nav aria-label="Explore">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {PRIMARY_NAV.map((i) => (
              <li key={i.href}>
                <Link href={i.href}>{i.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="About and legal">
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-muted">About &amp; legal</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {FOOTER_NAV.map((i) => (
              <li key={i.href}>
                <Link href={i.href}>{i.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="print-only px-4 text-xs">Lakshya — Created by Alok Shukla. Educational estimate only; not advice.</p>
    </footer>
  );
}
