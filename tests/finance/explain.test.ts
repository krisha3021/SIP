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
