import type { Metadata } from 'next';
import Link from 'next/link';
import { PageBody, PageHeader, Prose } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Learn', description: 'Short explainers on the conventions behind investment calculators.' };

const ARTICLES = [
  {
    id: 'capacity-tolerance',
    title: 'Risk capacity and risk tolerance are different',
    body: (
      <>
        <p>
          Risk capacity is how much loss your situation can absorb: how long until you need the money, how many people depend on each earner, how steady your
          income is, how much goes to EMIs, and whether you have an emergency fund. Risk tolerance is how much loss you are willing to sit through.
        </p>
        <p>
          The two can disagree. The <Link href="/calculators/life-stage-planner">Life-stage &amp; Risk Planner</Link> shows both scores side by side, with each
          factor&apos;s points, and uses the lower one. It is an educational illustration, not a suitability assessment.
        </p>
      </>
    ),
  },
  {
    id: 'glide-path',
    title: 'Why a glide path narrows as retirement nears',
    body: (
      <>
        <p>
          Money needed soon has little time to recover from a fall, so many plans reduce the share of equity as the need approaches. A glide path shows that
          change year by year. Lakshya shows it as a range, not a single number, and can overlay the published PFRDA NPS Auto Choice curves for comparison.
        </p>
        <p>
          See also the <Link href="/calculators/retirement-planner">retirement planner</Link> and the <Link href="/calculators/allocation-explorer">Allocation Explorer</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'surplus',
    title: 'Start with cash flow',
    body: (
      <p>
        Before investing, it helps to know your monthly surplus and to hold an emergency fund. The <Link href="/calculators/cash-flow">cash-flow planner</Link> shows a
        surplus or a shortfall honestly, and how long it would take to build the emergency fund you choose.
      </p>
    ),
  },
  {
    id: 'timing',
    title: 'Start or end of the month: why timing changes the answer',
    body: (
      <>
        <p>
          A SIP paid at the start of a month earns one more month of growth than one paid at the end. Over long periods that adds up: at 12% a year, the
          difference is roughly one month&apos;s growth on the whole corpus.
        </p>
        <p>
          Many online calculators mix the two without saying so, which is why their forward and reverse answers do not match. Lakshya lets you choose,
          and uses the same choice everywhere. Try both in the <Link href="/calculators/sip">SIP calculator</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'rates',
    title: 'Nominal versus effective annual return',
    body: (
      <>
        <p>
          “12% a year” can mean 1% a month (nominal), which compounds to about 12.68% a year, or a monthly rate chosen so the year compounds to exactly
          12% (effective).
        </p>
        <p>Fund returns are usually quoted as effective annual figures (CAGR), so the effective convention is our default.</p>
      </>
    ),
  },
  {
    id: 'inflation',
    title: 'Today’s rupees',
    body: (
      <>
        <p>
          ₹1 crore in 20 years will buy less than ₹1 crore today. Dividing by accumulated inflation converts a future amount into today&apos;s purchasing
          power. At 6% inflation, prices roughly triple in 19 years.
        </p>
        <p>
          The <Link href="/calculators/goal-planner">goal planner</Link> can take your goal in today&apos;s rupees and inflate it for you.
        </p>
      </>
    ),
  },
  {
    id: 'monte-carlo',
    title: 'What a Monte Carlo “success rate” is, and is not',
    body: (
      <>
        <p>
          A Monte Carlo simulation draws many random return paths from a model and counts how many reach your goal. The answer depends entirely on the
          model: its average return, its volatility and its shape.
        </p>
        <p>
          Real markets have crashes, long flat periods and changing behaviour that a simple model misses. Treat the result as a way to see how wide the
          range of outcomes might be, not as a probability of success.
        </p>
      </>
    ),
  },
  {
    id: 'nav',
    title: 'Reading a NAV and its date',
    body: (
      <>
        <p>
          A mutual fund&apos;s NAV is published once per business day, after markets close. A NAV always refers to a specific date. Lakshya shows that
          date and marks data stale when it is older than expected, instead of calling anything “live”.
        </p>
        <p>NAVs already reflect the fund&apos;s expense ratio. Direct plans have lower expenses than regular plans of the same scheme, so their NAVs grow faster.</p>
      </>
    ),
  },
];

export default function LearnPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: 'Learn' }]} title="Learn" lede="Short explainers on the ideas behind the calculators. Educational content, not advice." />
      <PageBody>
        <Prose>
          <nav aria-label="Articles" className="rounded-lg border border-line bg-surface p-4 text-sm">
            <ul>
              {ARTICLES.map((a) => (
                <li key={a.id}>
                  <a href={`#${a.id}`}>{a.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          {ARTICLES.map((a) => (
            <article key={a.id} aria-labelledby={a.id}>
              <h2 id={a.id}>{a.title}</h2>
              <div className="space-y-3">{a.body}</div>
            </article>
          ))}
        </Prose>
      </PageBody>
    </>
  );
}
