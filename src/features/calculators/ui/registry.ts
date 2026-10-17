export type CalculatorSlug =
  | 'sip'
  | 'step-up-sip'
  | 'lumpsum'
  | 'corpus-sip'
  | 'goal-planner'
  | 'swp'
  | 'monte-carlo'
  | 'income-tax';

export interface CalculatorEntry {
  slug: CalculatorSlug;
  title: string;
  summary: string;
  category: 'Grow wealth' | 'Goals & retirement' | 'Tax';
  keywords: string[];
}

export const CALCULATORS: CalculatorEntry[] = [
  {
    slug: 'sip',
    title: 'SIP calculator',
    summary: 'Project a fixed monthly investment at an assumed return, with timing and rate conventions shown.',
    category: 'Grow wealth',
    keywords: ['sip', 'systematic investment plan', 'monthly', 'mutual fund'],
  },
  {
    slug: 'step-up-sip',
    title: 'Step-up SIP calculator',
    summary: 'Raise the monthly SIP each year by a percentage or a fixed amount, with an optional cap.',
    category: 'Grow wealth',
    keywords: ['step up', 'top up', 'increase', 'annual increase', 'sip'],
  },
  {
    slug: 'lumpsum',
    title: 'Lumpsum calculator',
    summary: 'Project a one-time investment over a chosen number of years.',
    category: 'Grow wealth',
    keywords: ['lumpsum', 'one time', 'single investment', 'fd comparison'],
  },
  {
    slug: 'corpus-sip',
    title: 'Existing corpus + SIP',
    summary: 'Start from what you already have, add a SIP, and model pauses and one-time top-ups.',
    category: 'Grow wealth',
    keywords: ['existing', 'corpus', 'pause', 'top-up', 'portfolio', 'sip'],
  },
  {
    slug: 'goal-planner',
    title: 'Goal planner (reverse SIP)',
    summary: 'Find the monthly SIP a goal needs, and the shortfall at your current contribution.',
    category: 'Goals & retirement',
    keywords: ['goal', 'reverse sip', 'target', 'education', 'house', 'shortfall', 'required sip'],
  },
  {
    slug: 'swp',
    title: 'SWP / retirement withdrawal',
    summary: 'Test how long a corpus lasts with monthly withdrawals that rise each year.',
    category: 'Goals & retirement',
    keywords: ['swp', 'systematic withdrawal', 'retirement', 'pension', 'drawdown', 'income'],
  },
  {
    slug: 'monte-carlo',
    title: 'Monte Carlo goal simulator',
    summary: 'Explore a range of outcomes under a simple random-return model, against a goal you set.',
    category: 'Goals & retirement',
    keywords: ['monte carlo', 'probability', 'simulation', 'risk', 'volatility', 'uncertainty'],
  },
  {
    slug: 'income-tax',
    title: 'Income-tax regime comparison',
    summary: 'Compare the new and old regimes for a verified financial year (FY 2025-26).',
    category: 'Tax',
    keywords: ['income tax', 'new regime', 'old regime', '80c', '80d', 'tax'],
  },
];

export function getCalculator(slug: string): CalculatorEntry | undefined {
  return CALCULATORS.find((c) => c.slug === slug);
}
