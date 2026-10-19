/**
 * Deterministic Strategy Lab explanation. Every number is inserted from `result.facts` through `formatFact`, so the
 * text can be checked by the same grounding rules as an AI explanation. Comparisons ("higher", "wider") are made
 * from the facts; no new figures are computed here.
 */
import { formatINRCompact } from '../format/inr';
import type { GroundingFact } from '../ai/grounding';
import type { StrategyResult } from './strategy';

export function formatFact(f: GroundingFact): string {
  switch (f.unit) {
    case 'inr':
      return formatINRCompact(f.value);
    case 'percent':
      return `${f.value.toFixed(1)}%`;
    default:
      return String(Math.round(f.value));
  }
}

export interface Explanation {
  sections: Array<{ heading: string; paragraphs: string[] }>;
  notice: string;
  source: 'deterministic' | 'ai';
}

export const EXPLANATION_NOTICE =
  'Educational explanation of the figures above — not a recommendation of any strategy, scheme or allocation, and not a forecast. It uses only the numbers Lakshya computed from your assumptions.';

export function explainStrategies(result: StrategyResult): Explanation {
  const facts = new Map(result.facts.map((f) => [f.id, f]));
  const v = (id: string) => {
    const f = facts.get(id);
    if (!f) throw new Error(`Missing fact ${id}`);
    return formatFact(f);
  };
  const num = (id: string) => facts.get(id)?.value ?? NaN;
  const s = (id: string) => result.strategies.find((x) => x.id === id)!;
  const mixes = result.strategies.filter((x) => x.kind === 'allocation');
  /** Number-free display name, so labels never introduce figures that are not facts. */
  const nameOf = (x: StrategyResult['strategies'][number], i: number) => {
    const label = x.label.replace(/s*(.*)s*$/, '');
    return /d/.test(label) ? `Mix ${i + 1}` : label;
  };

  const sections: Explanation['sections'] = [];

  sections.push({
    heading: 'What is compared',
    paragraphs: [
      `Over ${v('inputs.years')} years, with a monthly capacity of ${v('inputs.monthlyCapacity')} and an existing goal corpus of ${v('inputs.existingCorpus')}, Lakshya compares contribution patterns and equity/debt/gold mixes using your return, volatility and inflation (${v('inputs.inflationPct')}) assumptions.`,
    ],
  });

  const fixed = s('fixed-sip');
  const step = s('step-up-sip');
  sections.push({
    heading: 'Contributions versus corpus',
    paragraphs: [
      `A fixed SIP puts in ${v('fixed-sip.totalContributions')} and projects ${v('fixed-sip.corpusNominal')} at its assumed return.`,
      `The step-up SIP puts in ${v('step-up-sip.totalContributions')} and projects ${v('step-up-sip.corpusNominal')}. Much of the ${step.corpusNominal > fixed.corpusNominal ? 'larger' : 'different'} corpus comes from contributing more, not from a better return.`,
      `Adding the existing corpus at the start (lump sum + SIP) projects ${v('lumpsum-plus-sip.corpusNominal')}. The higher contribution level projects ${v('contribution-125.corpusNominal')} but needs ${v('contribution-125.startingMonthly')} a month, above the capacity you entered.`,
    ],
  });

  if (mixes.length >= 2) {
    const sorted = [...mixes].sort((a, b) => b.assumedVolatilityPct - a.assumedVolatilityPct);
    const hi = sorted[0]!;
    const lo = sorted[sorted.length - 1]!;
    const hiName = nameOf(hi, mixes.indexOf(hi));
    const loName = nameOf(lo, mixes.indexOf(lo));
    sections.push({
      heading: 'Allocation trade-offs',
      paragraphs: [
        `${hiName} assumes ${v(`${hi.id}.blendedReturnPct`)} with ${v(`${hi.id}.blendedVolatilityPct`)} volatility; ${loName} assumes ${v(`${lo.id}.blendedReturnPct`)} with ${v(`${lo.id}.blendedVolatilityPct`)}.`,
        `Across simulated paths, ${hiName} ranges from ${v(`${hi.id}.mcP10`)} (10th percentile) to ${v(`${hi.id}.mcP90`)} (90th), and ${loName} from ${v(`${lo.id}.mcP10`)} to ${v(`${lo.id}.mcP90`)}. A higher assumed return comes with a ${num(`${hi.id}.mcP90`) - num(`${hi.id}.mcP10`) > num(`${lo.id}.mcP90`) - num(`${lo.id}.mcP10`) ? 'wider' : 'different'} spread of outcomes.`,
      ],
    });
  }

  sections.push({
    heading: 'Downside and uncertainty',
    paragraphs: [
      `In a weak outcome (10th percentile of ${v('inputs.simulations')} simulated paths), the fixed SIP ends near ${v('fixed-sip.mcP10')} against a median of ${v('fixed-sip.mcP50')}. The simulated median is below the projection at the assumed return because returns vary.`,
    ],
  });

  sections.push({
    heading: "In today's rupees",
    paragraphs: [`After ${v('inputs.inflationPct')} inflation, the fixed SIP's projected ${v('fixed-sip.corpusNominal')} would buy roughly what ${v('fixed-sip.corpusToday')} buys today.`],
  });

  if (result.goal) {
    sections.push({
      heading: 'Your goal',
      paragraphs: [
        `Your goal becomes ${v('goal.futureTarget')} in future rupees.${facts.has('fixed-sip.requiredMonthly') ? ` At the fixed SIP's assumed return it needs about ${v('fixed-sip.requiredMonthly')} a month; ${num('fixed-sip.additionalMonthly') > 0 ? `that is ${v('fixed-sip.additionalMonthly')} more than your capacity` : 'your capacity covers it at the assumed return'}.` : ''}`,
        `The share of simulated paths that reach the goal is ${v('fixed-sip.goalSuccessPct')} for the fixed SIP and ${v('lumpsum-plus-sip.goalSuccessPct')} for lump sum + SIP. These describe the model, not what will happen.`,
      ],
    });
  } else {
    sections.push({ heading: 'Your goal', paragraphs: ['No goal was entered, so no shortfall or success share is shown.'] });
  }

  sections.push({ heading: 'Limitations', paragraphs: [...result.limitations, ...result.notModelled.map((n) => `${n.label}: ${n.reason}`)] });

  return { sections, notice: EXPLANATION_NOTICE, source: 'deterministic' };
}
