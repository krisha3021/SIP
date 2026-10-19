import { describe, expect, it } from 'vitest';
import { blendedAssumptions, compareStrategies, type StrategyInput } from '@/lib/finance/strategy';
import { projectAccumulation } from '@/lib/finance/sip';

const base: StrategyInput = {
  targetAmount: 5_000_000,
  years: 15,
  monthlyCapacity: 15_000,
  existingCorpus: 200_000,
  stepUpPct: 10,
  inflationPct: 6,
  simulations: 300,
  seed: 7,
};

describe('blendedAssumptions', () => {
  it('blends expected return as a weighted mean and volatility as √(wᵀΣw) (hand-worked two-asset case)', () => {
    // w = (0.6, 0.4, 0); σ = (20%, 5%); ρ = 0.25 → var = .36·.04 + .16·.0025 + 2·.6·.4·.25·.2·.05 = .016 → σ = 12.6491%
    const b = blendedAssumptions(
      { equityPct: 60, debtPct: 40, goldPct: 0 },
      { equity: { expectedReturnPct: 12, volatilityPct: 20 }, debt: { expectedReturnPct: 7, volatilityPct: 5 }, gold: { expectedReturnPct: 8, volatilityPct: 15 } },
      { equityDebt: 0.25, equityGold: 0, debtGold: 0 },
    );
    expect(b.expectedReturnPct).toBeCloseTo(0.6 * 12 + 0.4 * 7, 12);
    expect(b.volatilityPct).toBeCloseTo(Math.sqrt(0.016) * 100, 10);
  });
});

describe('compareStrategies', () => {
  const r = compareStrategies(base);
  if (!r.ok) throw new Error(r.error.message);
  const by = Object.fromEntries(r.value.strategies.map((s) => [s.id, s]));

  it('includes the contribution and allocation strategies, and lists what is not modelled', () => {
    expect(Object.keys(by)).toEqual(expect.arrayContaining(['fixed-sip', 'step-up-sip', 'lumpsum-plus-sip', 'contribution-75', 'contribution-125', 'mix-1', 'mix-2', 'mix-3']));
    expect(r.value.notModelled.map((n) => n.id)).toEqual(expect.arrayContaining(['rebalancing', 'stp']));
  });

  it('fixed SIP at zero volatility equals the closed-form annuity at the blended effective return', () => {
    const zeroVol = compareStrategies({
      ...base,
      assets: { equity: { expectedReturnPct: 12, volatilityPct: 0 }, debt: { expectedReturnPct: 12, volatilityPct: 0 }, gold: { expectedReturnPct: 12, volatilityPct: 0 } },
    });
    if (!zeroVol.ok) throw new Error(zeroVol.error.message);
    const s = zeroVol.value.strategies.find((x) => x.id === 'fixed-sip')!;
    const m = Math.pow(1.12, 1 / 12) - 1;
    const closedForm = 15_000 * ((Math.pow(1 + m, 180) - 1) / m);
    expect(s.corpusNominal).toBeCloseTo(closedForm, 2);
    expect(s.monteCarlo.p10).toBeCloseTo(closedForm, 0);
    expect(s.monteCarlo.p90).toBeCloseTo(closedForm, 0);
  });

  it('lump sum + SIP invests the existing corpus; fixed SIP does not', () => {
    expect(by['lumpsum-plus-sip']!.totalContributions).toBeCloseTo(200_000 + 15_000 * 180, 6);
    expect(by['fixed-sip']!.totalContributions).toBeCloseTo(15_000 * 180, 6);
  });

  it('flags the 125% contribution level as above the stated capacity', () => {
    expect(by['contribution-125']!.exceedsCapacity).toBe(true);
    expect(by['contribution-75']!.exceedsCapacity).toBe(false);
  });

  it('required monthly amount reproduces the inflated target when fed back into the forward engine', () => {
    const s = by['fixed-sip']!;
    const fwd = projectAccumulation({ monthlyContribution: s.goal!.requiredMonthly, annualReturnPct: s.assumedReturnPct, months: 180 });
    if (!fwd.ok) throw new Error(fwd.error.message);
    expect(fwd.value.summary.finalValue / r.value.goal!.futureTarget).toBeCloseTo(1, 8);
    expect(r.value.goal!.futureTarget).toBeCloseTo(5_000_000 * Math.pow(1.06, 15), 2);
  });

  it('is deterministic for a fixed seed', () => {
    expect(compareStrategies(base)).toEqual(compareStrategies(base));
  });

  it('exposes facts with unique ids and finite numeric values only', () => {
    const ids = r.value.facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of r.value.facts) expect(Number.isFinite(f.value)).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(['goal.futureTarget', 'fixed-sip.corpusNominal', 'fixed-sip.mcP10', 'mix-1.blendedVolatilityPct']));
  });

  it('rejects allocation mixes whose weights do not sum to 100, and more than three mixes', () => {
    expect(compareStrategies({ ...base, mixes: [{ label: 'Bad', equityPct: 70, debtPct: 20, goldPct: 5 }] }).ok).toBe(false);
    const four = Array.from({ length: 4 }, (_, i) => ({ label: `M${i}`, equityPct: 50, debtPct: 50, goldPct: 0 }));
    expect(compareStrategies({ ...base, mixes: four }).ok).toBe(false);
  });

  it('works without a goal and then reports no shortfall figures', () => {
    const noGoal = compareStrategies({ ...base, targetAmount: undefined });
    expect(noGoal.ok && noGoal.value.goal).toBeNull();
    expect(noGoal.ok && noGoal.value.strategies.every((s) => s.goal === null)).toBe(true);
  });
});
