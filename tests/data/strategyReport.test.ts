import { describe, expect, it } from 'vitest';
import { compareStrategies } from '@/lib/finance/strategy';
import { buildStrategyReport, STRATEGY_NOTICE } from '@/lib/export/reportBuilders';

describe('buildStrategyReport', () => {
  const r = compareStrategies({ targetAmount: 3_000_000, years: 10, monthlyCapacity: 10_000, existingCorpus: 100_000, simulations: 200, seed: 1 });
  if (!r.ok) throw new Error(r.error.message);
  const rep = buildStrategyReport(r.value, { generatedAt: '2026-10-19T05:00:00.000Z', warnings: [] });

  it('carries the engine values unchanged (no recalculation in the export)', () => {
    const fixed = r.value.strategies.find((s) => s.id === 'fixed-sip')!;
    const row = rep.tables[0]!.rows.find((x) => x[0] === fixed.label)!;
    expect(row).toContain(fixed.corpusNominal);
    expect(row).toContain(fixed.monteCarlo.p10);
  });

  it('includes the educational notice, the simulation label, conventions and limitations', () => {
    expect(rep.methodology).toContain(STRATEGY_NOTICE);
    expect(rep.conventions.map((c) => c[0])).toEqual(expect.arrayContaining(['Return convention', 'Contribution timing', 'Simulation']));
    expect(rep.summary.some(([k]) => String(k).includes('Not modelled'))).toBe(true);
  });
});
