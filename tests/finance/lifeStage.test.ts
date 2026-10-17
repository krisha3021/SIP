/**
 * Life-stage & Risk Planner. Every expected score is added up by hand from the table in
 * lifeStageConfig.ts; every range is derived by hand (debt = 100 − equity − gold).
 */
import { describe, expect, it } from 'vitest';
import { LIFE_STAGE_NOTICE, planLifeStageRisk, type LifeStageInput, type LifeStageResult } from '@/lib/finance/lifeStage';
import { LIFE_STAGE_CONFIG, PFRDA_AUTO_CHOICE_REFERENCE, type LifeStageConfig } from '@/lib/finance/lifeStageConfig';
import { stressTestRange } from '@/lib/finance/lifeStageStress';
import { buildLifeStageReport } from '@/lib/export/reportBuilders';
import { reportToCsv } from '@/lib/export/report';

const run = (input: LifeStageInput, config?: LifeStageConfig): LifeStageResult => {
  const r = planLifeStageRisk(input, config);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};
const pts = (b: LifeStageResult['capacity']) => Object.fromEntries(b.factors.map((f) => [f.id, f.points]));

/** Salaried 30-year-old, two earners, small EMI, full emergency fund, would hold through a fall. */
const steady: LifeStageInput = {
  currentAge: 30,
  targetRetirementAge: 60,
  dependants: 1,
  earningMembers: 2,
  monthlyHouseholdIncome: 100_000,
  monthlyEssentialExpenses: 40_000,
  monthlyEmis: 10_000,
  incomeStability: 'salaried-stable',
  emergencyFundMonthsHeld: 6,
  emergencyFundTargetMonths: 6,
  investmentHorizonYears: 20,
  investmentExperience: '3-to-10-years',
  lossReaction: 'hold',
};

/** No earners, pension income, heavy EMI, thin emergency fund, 2-year horizon, but says "invest more". */
const fragile: LifeStageInput = {
  currentAge: 50,
  targetRetirementAge: 52,
  dependants: 3,
  earningMembers: 0,
  monthlyHouseholdIncome: 30_000,
  monthlyEssentialExpenses: 20_000,
  monthlyEmis: 15_000,
  incomeStability: 'irregular',
  emergencyFundMonthsHeld: 1,
  emergencyFundTargetMonths: 6,
  investmentHorizonYears: 2,
  investmentExperience: 'over-10-years',
  lossReaction: 'invest-more',
};

describe('factor scores (hand-worked)', () => {
  it('steady household: capacity 30+15+20+12+15 = 92, tolerance 50+22 = 72', () => {
    const v = run(steady);
    expect(pts(v.capacity)).toEqual({ horizon: 30, 'dependants-per-earner': 15, 'income-stability': 20, 'emi-to-income': 12, 'emergency-cover': 15 });
    expect(v.capacity.score).toBe(92);
    expect(pts(v.tolerance)).toEqual({ 'loss-reaction': 50, experience: 22 });
    expect(v.tolerance.score).toBe(72);
    expect(v.capacity.factors.every((f) => f.explanation.length > 20 && f.points <= f.maxPoints)).toBe(true);
  });

  it('fragile household: capacity 0+0+0+3+3 = 6 although tolerance is 70+30 = 100', () => {
    const v = run(fragile);
    expect(pts(v.capacity)).toEqual({ horizon: 0, 'dependants-per-earner': 0, 'income-stability': 0, 'emi-to-income': 3, 'emergency-cover': 3 });
    expect(v.capacity.score).toBe(6);
    expect(v.tolerance.score).toBe(100);
  });

  it.each([
    [15, 30],
    [14, 23],
    [8, 23],
    [7, 15],
    [5, 15],
    [3, 8],
    [2, 0],
    [0, 0],
  ])('horizon %i years scores %i', (years, expected) => {
    expect(pts(run({ ...steady, investmentHorizonYears: years }).capacity).horizon).toBe(expected);
  });

  it('EMI boundaries: exactly 20% → 12, just above → 7, no EMI → 15, no income → 0', () => {
    expect(pts(run({ ...steady, monthlyEmis: 20_000 }).capacity)['emi-to-income']).toBe(12);
    expect(pts(run({ ...steady, monthlyEmis: 20_001 }).capacity)['emi-to-income']).toBe(7);
    expect(pts(run({ ...steady, monthlyEmis: 0 }).capacity)['emi-to-income']).toBe(15);
    expect(pts(run({ ...steady, monthlyHouseholdIncome: 0, monthlyEmis: 0 }).capacity)['emi-to-income']).toBe(0);
  });

  it('dependants per earner and emergency cover boundaries', () => {
    expect(pts(run({ ...steady, dependants: 2, earningMembers: 2 }).capacity)['dependants-per-earner']).toBe(15); // ratio exactly 1
    expect(pts(run({ ...steady, dependants: 0 }).capacity)['dependants-per-earner']).toBe(20);
    expect(pts(run({ ...steady, dependants: 7, earningMembers: 2 }).capacity)['dependants-per-earner']).toBe(0); // 3.5
    expect(pts(run({ ...steady, emergencyFundMonthsHeld: 3 }).capacity)['emergency-cover']).toBe(8); // ratio exactly 0.5
    expect(pts(run({ ...steady, emergencyFundMonthsHeld: 2.9 }).capacity)['emergency-cover']).toBe(3);
    expect(pts(run({ ...steady, emergencyFundMonthsHeld: 0 }).capacity)['emergency-cover']).toBe(0);
    expect(pts(run({ ...steady, emergencyFundMonthsHeld: 12 }).capacity)['emergency-cover']).toBe(15);
  });
});

describe('profile = lower of capacity and tolerance', () => {
  it('steady: min(92, 72) = 72 → growth, limited by tolerance', () => {
    const v = run(steady);
    expect(v.profile).toMatchObject({ id: 'growth', score: 72, limitedBy: 'tolerance' });
    expect(v.profile.explanation).toMatch(/lower of the two/);
  });

  it('fragile: min(6, 100) = 6 → conservative, limited by capacity', () => {
    expect(run(fragile).profile).toMatchObject({ id: 'conservative', score: 6, limitedBy: 'capacity' });
  });

  it('band boundary: 85 → high-growth, 78 → growth', () => {
    // capacity 30 + 20 + 20 + 15 + 0 = 85 (no dependants, no EMI, no emergency fund); tolerance 70 + 30 = 100
    const edge: LifeStageInput = { ...steady, dependants: 0, monthlyEmis: 0, emergencyFundMonthsHeld: 0, lossReaction: 'invest-more', investmentExperience: 'over-10-years', investmentHorizonYears: 15 };
    expect(run(edge).profile).toMatchObject({ id: 'high-growth', score: 85, limitedBy: 'capacity' });
    expect(run({ ...edge, investmentHorizonYears: 14 }).profile).toMatchObject({ id: 'growth', score: 78 }); // 23 + 20 + 20 + 15 + 0
  });

  it('equal scores report "both"', () => {
    // capacity 92 (as above); tolerance 70 (invest more) + 22 (3–10 years) = 92
    const v = run({ ...steady, lossReaction: 'invest-more' });
    expect(v.profile).toMatchObject({ id: 'high-growth', score: 92, limitedBy: 'both' });
  });
});

describe('ranges, prerequisites and glide path', () => {
  it('steady: growth range 45–70 equity, 5–15 gold, 15–50 debt; no prerequisites', () => {
    const v = run(steady);
    expect(v.prerequisites).toEqual([]);
    expect(v.profileRange).toEqual({ equity: { min: 45, max: 70 }, gold: { min: 5, max: 15 }, debt: { min: 15, max: 50 } });
    expect(v.currentRange).toEqual(v.profileRange);
  });

  it('glide path from 30 to 75 caps equity by years to retirement (hand-derived rows)', () => {
    const v = run(steady);
    expect(v.glidePath.map((g) => g.age)).toEqual(Array.from({ length: 46 }, (_, i) => 30 + i));
    const at = (age: number) => v.glidePath.find((g) => g.age === age)!;
    expect(at(50).range.equity).toEqual({ min: 45, max: 70 }); // 10 years left → cap 70
    expect(at(51).range.equity).toEqual({ min: 45, max: 55 }); // 9 years → cap 55
    expect(at(56).range.equity).toEqual({ min: 40, max: 40 }); // 4 years → cap 40
    expect(at(59)).toMatchObject({ yearsToRetirement: 1, phase: 'accumulation', equityCapPct: 40 });
    expect(at(60)).toMatchObject({ yearsToRetirement: 0, phase: 'retirement', equityCapPct: 30 });
    expect(at(60).range).toEqual({ equity: { min: 30, max: 30 }, gold: { min: 5, max: 15 }, debt: { min: 55, max: 65 } });
    expect(at(75).range.equity.max).toBe(30);
  });

  it.each([steady, fragile, { ...steady, currentAge: 22, targetRetirementAge: 45, lossReaction: 'invest-more' as const, investmentExperience: 'over-10-years' as const }])(
    'equity range never widens with age; debt minimum never falls (case %#)',
    (input) => {
      const g = run(input).glidePath;
      for (let i = 1; i < g.length; i++) {
        expect(g[i]!.range.equity.max).toBeLessThanOrEqual(g[i - 1]!.range.equity.max);
        expect(g[i]!.range.equity.min).toBeLessThanOrEqual(g[i - 1]!.range.equity.min);
        expect(g[i]!.range.debt.min).toBeGreaterThanOrEqual(g[i - 1]!.range.debt.min);
        expect(g[i]!.range.equity.min).toBeLessThanOrEqual(g[i]!.range.equity.max);
      }
    },
  );

  it('fragile: every prerequisite is flagged before the range, and the tightest cap (10%) applies today', () => {
    const v = run(fragile);
    expect(v.prerequisites.map((f) => [f.id, f.equityCapPct])).toEqual([
      ['emergency-fund-below-target', null],
      ['high-emi', null], // 15,000 / 30,000 = 50% > 40%
      ['no-earners', 20],
      ['short-horizon', 10],
      ['essentials-exceed-income', null], // 20,000 + 15,000 > 30,000
    ]);
    expect(v.prerequisites.every((f) => f.explanation.length > 30)).toBe(true);
    expect(v.currentRange).toEqual({ equity: { min: 0, max: 10 }, gold: { min: 0, max: 10 }, debt: { min: 80, max: 100 } });
  });

  it('caps in config apply to today’s range only when configured', () => {
    const cfg: LifeStageConfig = { ...LIFE_STAGE_CONFIG, prerequisites: { ...LIFE_STAGE_CONFIG.prerequisites, emergencyShortfallEquityCapPct: 25 } };
    const v = run({ ...steady, emergencyFundMonthsHeld: 2 }, cfg);
    expect(v.prerequisites.find((f) => f.id === 'emergency-fund-below-target')?.equityCapPct).toBe(25);
    expect(v.currentRange.equity).toEqual({ min: 25, max: 25 });
  });

  it('a plan-until age extends or shortens the glide path', () => {
    expect(run({ ...steady, planUntilAge: 61 }).glidePath.at(-1)!.age).toBe(61);
    expect(run({ ...steady, currentAge: 99, targetRetirementAge: 100 }).glidePath.map((g) => g.age)).toEqual(Array.from({ length: 12 }, (_, i) => 99 + i));
  });
});

describe('input validation and configuration', () => {
  it.each([
    [{ targetRetirementAge: 30 }, 'targetRetirementAge'],
    [{ targetRetirementAge: 25 }, 'targetRetirementAge'],
    [{ currentAge: 17 }, 'currentAge'],
    [{ planUntilAge: 60 }, 'planUntilAge'],
    [{ emergencyFundTargetMonths: 0 }, 'emergencyFundTargetMonths'],
    [{ dependants: -1 }, 'dependants'],
    [{ lossReaction: 'panic' }, 'lossReaction'],
    [{ monthlyHouseholdIncome: Number.NaN }, 'monthlyHouseholdIncome'],
  ])('rejects %j', (patch, field) => {
    const r = planLifeStageRisk({ ...steady, ...patch } as LifeStageInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_INPUT');
      expect(r.error.field).toBe(field);
    }
  });

  it('allows early retirement', () => {
    expect(run({ ...steady, targetRetirementAge: 31 }).glidePath[0]).toMatchObject({ age: 30, yearsToRetirement: 1, equityCapPct: 40 });
  });

  it('rejects an inconsistent edited configuration instead of using it', () => {
    const bad = { ...LIFE_STAGE_CONFIG, capacity: { ...LIFE_STAGE_CONFIG.capacity, horizonYears: { ...LIFE_STAGE_CONFIG.capacity.horizonYears, maxPoints: 40 } } };
    const r = planLifeStageRisk(steady, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Capacity weights must sum to 100/);
    const badRange = { ...LIFE_STAGE_CONFIG, ranges: { ...LIFE_STAGE_CONFIG.ranges, growth: { equity: { min: 70, max: 45 }, gold: { min: 5, max: 15 } } } };
    expect(planLifeStageRisk(steady, badRange).ok).toBe(false);
  });

  it('an edited table changes the result transparently', () => {
    const cfg: LifeStageConfig = { ...LIFE_STAGE_CONFIG, ranges: { ...LIFE_STAGE_CONFIG.ranges, growth: { equity: { min: 40, max: 60 }, gold: { min: 0, max: 10 } } } };
    expect(run(steady, cfg).profileRange).toEqual({ equity: { min: 40, max: 60 }, gold: { min: 0, max: 10 }, debt: { min: 30, max: 60 } });
  });

  it('is deterministic', () => {
    expect(planLifeStageRisk(fragile)).toEqual(planLifeStageRisk(fragile));
  });
});

describe('PFRDA reference curve and notice', () => {
  it('the quoted table has 21 ages (35…55) and ends at the equity share in each fund name', () => {
    const t = PFRDA_AUTO_CHOICE_REFERENCE.equityPctByAge;
    for (const s of Object.values(t)) expect(s).toHaveLength(21);
    expect(t['LC75 – High (15E/55Y)'].at(-1)).toBe(15);
    expect(t['LC50 – Moderate (10E/55Y)'].at(-1)).toBe(10);
    expect(t['LC25 – Low (5E/55Y)'].at(-1)).toBe(5);
    expect(t['LC – Aggressive (35E/55Y)'].at(-1)).toBe(35);
    expect(PFRDA_AUTO_CHOICE_REFERENCE.url).toMatch(/^https:\/\/pfrda\.org\.in\//);
  });

  it('is included only on request and maps ages to the table', () => {
    expect(run(steady).pfrdaReference).toBeNull();
    const ref = run({ ...steady, includePfrdaReference: true }).pfrdaReference!;
    const lc75 = ref.series.find((s) => s.name.startsWith('LC75'))!.points;
    const at = (age: number) => lc75.find((p) => p.age === age)!.equityPct;
    expect([at(30), at(35), at(40), at(45), at(55), at(70)]).toEqual([75, 75, 55, 35, 15, 15]);
    expect(ref.verifiedOn).toBe('2026-10-17');
  });

  it('carries the mandatory notice and avoids advice, AI and product language', () => {
    const r = planLifeStageRisk({ ...steady, includePfrdaReference: true });
    if (!r.ok) throw new Error();
    expect(r.value.notice).toBe(LIFE_STAGE_NOTICE);
    expect(r.warnings[0]).toBe(LIFE_STAGE_NOTICE);
    expect(LIFE_STAGE_NOTICE).toMatch(/not a suitability assessment/);
    expect(LIFE_STAGE_NOTICE).toMatch(/not registered with SEBI/);
    const text = JSON.stringify(r.value);
    expect(text).not.toMatch(/\b(AI|best|optimal|BlackRock|Aladdin|Jio)\b/i);
  });
});

describe('stress test on caller-supplied series', () => {
  const equity = [
    { date: '2020-01-01', nav: 100 },
    { date: '2020-02-03', nav: 110 }, // peak
    { date: '2020-03-23', nav: 77 }, // trough: 77 / 110 − 1 = −30%
    { date: '2020-06-01', nav: 90 },
    { date: '2020-11-02', nav: 111 }, // recovery
  ];
  const debt = [
    { date: '2020-01-31', nav: 50 }, // last on or before the peak
    { date: '2020-03-20', nav: 52 }, // last on or before the trough: +4%
    { date: '2020-12-31', nav: 53 },
  ];
  const range = run(steady).profileRange; // equity 45–70, gold 5–15 → gold midpoint 10

  it('applies the observed fall to both ends of the range (hand-worked)', () => {
    const r = stressTestRange(range, { equity: { label: 'Example index', points: equity }, debt: { label: 'Example debt', points: debt } }, { amount: 100_000 });
    if (!r.ok) throw new Error(r.error.message);
    const v = r.value;
    expect([v.peakDate, v.troughDate, v.recoveryDate]).toEqual(['2020-02-03', '2020-03-23', '2020-11-02']);
    expect(v.assetChangesPct.equity).toBeCloseTo(-30, 10);
    expect(v.assetChangesPct.debt).toBeCloseTo(4, 10);
    expect(v.assumedUnchanged).toEqual(['gold']);
    // lower: 45% × −30% + 45% × 4% + 10% × 0 = −11.7%; upper: 70% × −30% + 20% × 4% = −20.2%
    expect(v.mixes[0]).toMatchObject({ name: 'lower-equity', weightsPct: { equity: 45, debt: 45, gold: 10 } });
    expect(v.mixes[0].portfolioChangePct).toBeCloseTo(-11.7, 10);
    expect(v.mixes[0].rupeeChange).toBeCloseTo(-11_700, 6);
    expect(v.mixes[1].portfolioChangePct).toBeCloseTo(-20.2, 10);
    expect(r.warnings.join(' ')).toMatch(/not a forecast/);
    expect(r.warnings.join(' ')).toMatch(/Assumed unchanged.*gold/);
  });

  it('a series that starts after the peak is not back-filled', () => {
    const r = stressTestRange(range, { equity: { label: 'E', points: equity }, debt: { label: 'Late debt', points: [{ date: '2020-03-01', nav: 10 }, { date: '2020-04-01', nav: 11 }] } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.assetChangesPct.debt).toBeNull();
    expect(r.value.assumedUnchanged).toEqual(['debt', 'gold']);
  });

  it('respects a window and reports when there was no fall', () => {
    const r = stressTestRange(range, { equity: { label: 'E', points: equity } }, { window: { from: '2020-01-01', to: '2020-02-28' } });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.assetChangesPct.equity).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/never fell/);
  });

  it('rejects too little data and bad windows', () => {
    expect(stressTestRange(range, { equity: { label: 'E', points: [equity[0]!] } }).ok).toBe(false);
    expect(stressTestRange(range, { equity: { label: 'E', points: equity } }, { window: { from: '2020-05-01', to: '2020-01-01' } }).ok).toBe(false);
  });
});

describe('Life-stage report payload', () => {
  it('uses engine values and the notice, and renders to CSV', () => {
    const input = { ...fragile, includePfrdaReference: true };
    const res = run(input);
    const rep = buildLifeStageReport(input, res, { generatedAt: '2026-10-17T10:00:00.000Z' });
    expect(rep.methodology).toBe(LIFE_STAGE_NOTICE);
    expect(rep.summary.find(([k]) => k === 'Risk capacity score (of 100)')?.[1]).toBe(res.capacity.score);
    expect(rep.tables.map((t) => t.name)).toEqual(['Score factors', 'Glide path', 'Prerequisites', 'PFRDA reference']);
    expect(rep.tables[1]!.rows).toHaveLength(res.glidePath.length);
    expect(reportToCsv(rep)).toContain("Today's range,\"Equity 0–10%, debt 80–100%, gold 0–10%\"");
  });
});
