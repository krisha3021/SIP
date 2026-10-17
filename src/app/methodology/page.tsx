import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTRACT_VERSION, MAX_SIMULATIONS, SUPPORTED_TAX_YEARS, TAX_YEARS } from '@/contracts';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How Lakshya calculates SIP, goal, SWP, Monte Carlo, tax and NAV backtest results, and the limits of each.',
};

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Methodology' }]}
        title="Methodology"
        lede="How every number on Lakshya is produced. All pages use the same tested calculation engines; the website only displays their results."
      />
      <PageBody>
        <Prose>
          <nav aria-label="On this page" className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">On this page</p>
            <ul>
              <li><a href="#conventions">Conventions</a></li>
              <li><a href="#accumulation">SIP, step-up, lumpsum and corpus + SIP</a></li>
              <li><a href="#goal">Goal planner</a></li>
              <li><a href="#swp">SWP / withdrawals</a></li>
              <li><a href="#monte-carlo">Monte Carlo</a></li>
              <li><a href="#tax">Income tax</a></li>
              <li><a href="#nav">Historical NAV analysis</a></li>
              <li><a href="#labels">Labels and freshness</a></li>
            </ul>
          </nav>

          <h2 id="conventions">Conventions</h2>
          <ul>
            <li><strong>Contribution timing.</strong> End of month (default): the balance grows, then the contribution is added. Start of month: the contribution is added, then the balance grows for that month.</li>
            <li><strong>Rate convention.</strong> Effective (default): monthly rate = (1 + annual)^(1/12) − 1, so 12% means 12% a year. Nominal: monthly rate = annual ÷ 12, so 12% compounds to about 12.68% a year.</li>
            <li><strong>Today&apos;s rupees.</strong> A future value is divided by (1 + inflation)^(months ÷ 12).</li>
            <li>The chosen timing and rate convention are shown beside every result and included in every export.</li>
          </ul>

          <h2 id="accumulation">SIP, step-up, lumpsum and corpus + SIP</h2>
          <p>One engine handles all four. It simulates month by month from an initial amount invested at the start.</p>
          <ul>
            <li>Step-ups apply at the start of each contribution year (months 13, 25, 37, …), by a percentage or a fixed amount, optionally capped.</li>
            <li>Paused months contribute nothing. One-time top-ups follow the same timing as regular contributions.</li>
            <li>The engine warns when a step-up makes the monthly amount more than ten times the starting amount.</li>
            <li>Limits: returns are constant; fees, exit loads, stamp duty and taxes are not deducted.</li>
          </ul>

          <h2 id="goal">Goal planner</h2>
          <ul>
            <li>A goal in today&apos;s rupees is inflated to the horizon. Existing savings grow at the assumed return.</li>
            <li>The required SIP uses the closed-form annuity factor for the chosen timing (or a bracketed bisection when a step-up cap applies), so entering it in the SIP calculator reproduces the goal.</li>
            <li>The shortfall compares the goal with the projection at your current SIP.</li>
          </ul>

          <h2 id="swp">SWP / withdrawals</h2>
          <ul>
            <li>Simulated month by month, with the order (grow then withdraw, or withdraw then grow) shown.</li>
            <li>Withdrawals rise once a year by the percentage you set.</li>
            <li>When the balance cannot cover a withdrawal, the partial amount actually available is recorded and the plan ends. Depletion is reported to the month.</li>
            <li>No withdrawal rate is labelled &quot;safe&quot;.</li>
          </ul>

          <h2 id="monte-carlo">Monte Carlo</h2>
          <ul>
            <li>Monthly log-returns are drawn from a normal distribution with yearly drift μ = ln(1 + E) − σ²/2, so average yearly growth equals the expected return E. The median path is therefore below the expected-return path when volatility σ is high.</li>
            <li>A seeded random generator makes runs reproducible. Up to {MAX_SIMULATIONS.toLocaleString('en-IN')} simulations run in a background thread.</li>
            <li>Success means a path&apos;s final value reaches the goal you set. It describes the model, not the real world: fat tails, volatility clustering, regime changes, fees and taxes are ignored.</li>
          </ul>

          <h2 id="tax">Income tax</h2>
          <ul>
            <li>Resident individuals only. Slab tax, then the rebate (with marginal relief where configured), then health and education cess.</li>
            <li>Each financial year has its own configuration, with sources and a verification note:</li>
          </ul>
          <ul>
            {SUPPORTED_TAX_YEARS.map((fy) => (
              <li key={fy}>
                FY {fy}: {TAX_YEARS[fy]!.status === 'verified' ? 'verified and enabled' : 'not yet verified — disabled'}. {TAX_YEARS[fy]!.verification}
              </li>
            ))}
          </ul>
          <ul>
            <li>Surcharge, special-rate income (such as capital gains) and many deductions are not modelled; the calculator lists them.</li>
          </ul>

          <h2 id="nav">Historical NAV analysis</h2>
          <ul>
            <li>Only observed NAVs are used. Nothing is interpolated or invented before a scheme&apos;s first NAV.</li>
            <li>Each SIP instalment is allotted at the first NAV on or after its scheduled date, within a maximum lag; otherwise it is skipped and listed.</li>
            <li>Holdings are valued at the last NAV on or before the end date. XIRR uses actual dates with ACT/365F day count, and reports when it cannot find a rate rather than guessing one.</li>
            <li>Maximum drawdown is measured on the NAV, not on the balance, so new contributions cannot hide a fall.</li>
            <li>Rolling returns are point-to-point CAGR for every monthly start date: (NAV at end ÷ NAV at start)^(365 ÷ days) − 1.</li>
          </ul>

          <h2 id="labels">Labels and freshness</h2>
          <ul>
            <li>Every calculator result is labelled &quot;Projection (assumption-based)&quot;. Monte Carlo output is a synthetic simulation.</li>
            <li>NAV freshness comes from the date of the newest observation, never from when the page loaded. A failed fetch never advances it; a cached copy is labelled &quot;Cached — last updated …&quot;.</li>
            <li>
              See <Link href="/data-sources">Data Sources</Link> for providers and their limits.
            </li>
          </ul>
          <p className="text-sm text-muted">Engine contract version {CONTRACT_VERSION}.</p>
        </Prose>
      </PageBody>
    </>
  );
}
