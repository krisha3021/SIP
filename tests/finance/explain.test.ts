import { describe, expect, it } from 'vitest';
import { compareStrategies } from '@/lib/finance/strategy';
import { explainStrategies, formatFact } from '@/lib/finance/explain';
import { checkGrounding, extractNumberTokens } from '@/lib/ai/grounding';

const result = (() => {
  const r = compareStrategies({ targetAmount: 4_000_000, years: 12, monthlyCapacity: 12_000, existingCorpus: 150_000, simulations: 200, seed: 3 });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
})();

describe('number-token extraction', () => {
  it('finds rupee amounts in lakh/crore and plain form, percentages and bare numbers', () => {
    expect(extractNumberTokens('₹12.5 L, ₹1.2 Cr, ₹85,000, 12.0%, over 15 years')).toEqual(['₹12.5 L', '₹1.2 Cr', '₹85,000', '12.0%', '15']);
  });
});

describe('checkGrounding', () => {
  const facts = [
    { id: 'a', label: 'A', value: 1_250_000, unit: 'inr' as const },
    { id: 'b', label: 'B', value: 12, unit: 'percent' as const },
  ];
  it('accepts text whose numbers all come from facts, with valid citations', () => {
    expect(checkGrounding(`The corpus is ${formatFact(facts[0]!)} [a] at ${formatFact(facts[1]!)} [b].`, facts)).toEqual({ grounded: true, problems: [] });
  });
  it('rejects an invented number', () => {
    const g = checkGrounding('The corpus could reach ₹99 L [a].', facts);
    expect(g.grounded).toBe(false);
    expect(g.problems.join(' ')).toMatch(/₹99 L/);
  });
  it('rejects an unknown citation', () => {
    expect(checkGrounding(`${formatFact(facts[0]!)} [zzz]`, facts).grounded).toBe(false);
  });
  it('rejects guarantee and "best fund" language', () => {
    expect(checkGrounding('This is guaranteed.', facts).grounded).toBe(false);
    expect(checkGrounding('Pick the best fund.', facts).grounded).toBe(false);
  });
});

describe('explainStrategies (deterministic)', () => {
  const e = explainStrategies(result);
  const text = e.sections.flatMap((s) => s.paragraphs).join('\n');

  it('covers scope, trade-offs, downside, inflation, goal, limitations and the educational boundary', () => {
    expect(e.sections.map((s) => s.heading)).toEqual(['What is compared', 'Contributions versus corpus', 'Allocation trade-offs', 'Downside and uncertainty', "In today's rupees", 'Your goal', 'Limitations']);
    expect(e.notice).toMatch(/not a recommendation/i);
  });

  it('uses only numbers taken from the engine facts', () => {
    const g = checkGrounding(text, result.facts);
    expect(g.problems).toEqual([]);
    expect(g.grounded).toBe(true);
  });
});

describe('review fixes — explanation content', () => {
  it('names the allocation mixes in the trade-off paragraph (no blank names)', () => {
    const e = explainStrategies(result);
    const para = e.sections.find((s) => s.heading === 'Allocation trade-offs')!.paragraphs.join(' ');
    expect(para).toContain('Equity-heavy');
    expect(para).toContain('Debt-heavy');
    expect(para).not.toMatch(/,\s{2}|^\s|;\s{2}/);
  });

  it('formats negative percentages with the same minus sign the checker understands, and stays grounded', () => {
    expect(formatFact({ id: 'x', label: 'x', value: -5, unit: 'percent' })).toBe('−5.0%');
    const neg = compareStrategies({ years: 10, monthlyCapacity: 10_000, simulations: 100, seed: 2, assets: { equity: { expectedReturnPct: -5, volatilityPct: 10 }, debt: { expectedReturnPct: -2, volatilityPct: 2 }, gold: { expectedReturnPct: -1, volatilityPct: 5 } } });
    if (!neg.ok) throw new Error(neg.error.message);
    const text = explainStrategies(neg.value).sections.flatMap((s) => s.paragraphs).join('\n');
    expect(checkGrounding(text, neg.value.facts).problems).toEqual([]);
  });

  it('sends only number-free fact labels, so naming a strategy never introduces an unbacked figure', () => {
    for (const f of result.facts) expect(f.label).not.toMatch(/\d/);
    expect(result.facts.map((f) => f.id)).toContain('inputs.stepUpPct');
  });
});

describe('review fixes — grounding bypasses (must all be rejected)', () => {
  const facts = [
    { id: 'r', label: 'Return', value: 12.5, unit: 'percent' as const },
    { id: 'y', label: 'Years', value: 12, unit: 'years' as const },
    { id: 'c', label: 'Corpus', value: 4_715_000, unit: 'inr' as const },
  ];
  it.each([
    'You could reach 8 crore.',
    'That is about 60 lakh more.', // "47 lakh" would be a fair rounding of ₹47.15 L and is accepted
    'Your money grows 12x.',
    'It grows 3.5x over time.',
    'Expect about 50k a month.',
    'A fall of -12.5% is possible.',
    'Returns between 8–12.5% are typical.',
    'It earns twelve percent.',
    'You may reach five crore.',
  ])('rejects %j', (text) => {
    expect(checkGrounding(text, facts).grounded).toBe(false);
  });
  it('never lets a percent claim be grounded by a years fact (12 percent vs 12 years)', () => {
    const f2 = [{ id: 'y', label: 'Years', value: 12, unit: 'years' as const }, { id: 'r', label: 'Return', value: 20, unit: 'percent' as const }];
    expect(checkGrounding('It earns 12 percent a year.', f2).grounded).toBe(false);
    expect(checkGrounding('It earns 12 per cent a year.', f2).grounded).toBe(false);
  });
  it('still accepts properly grounded text and small counting words', () => {
    expect(checkGrounding('Over 12 years [y], three strategies reach ₹47.15 L [c] at 12.5% [r]; 2 of them are lump sum based.', facts)).toEqual({ grounded: true, problems: [] });
  });
});
