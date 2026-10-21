import { describe, expect, it } from 'vitest';
import { AMCS, SEBI_REGISTER_COUNT, amcCity, getAmc } from '@/lib/data/amc/registry';

describe('AMC registry (SEBI register snapshot 2026-10-21)', () => {
  it('holds every entry of the register, once', () => {
    expect(AMCS).toHaveLength(SEBI_REGISTER_COUNT);
    expect(new Set(AMCS.map((a) => a.registrationNo)).size).toBe(SEBI_REGISTER_COUNT);
    expect(new Set(AMCS.map((a) => a.slug)).size).toBe(SEBI_REGISTER_COUNT);
  });

  it('uses SEBI registration numbers, ISO dates and https-only websites', () => {
    for (const a of AMCS) {
      expect(a.registrationNo).toMatch(/^MF\/\d{3}\/\d{2}\/\d*$/);
      expect(a.registeredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(a.registeredOn))).toBe(false);
      if (a.website !== null) expect(new URL(a.website).protocol).toBe('https:');
      expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('registration year matches the year embedded in the registration number', () => {
    // MF/<serial>/<yy>/<n>: yy is the registration year (e.g. HDFC MF/044/00/6 → 2000).
    // Known exceptions where SEBI's register shows a later effective date than the number's year.
    const exceptions = new Set(['MF/055/07/03', 'MF/066/11/01']);
    for (const a of AMCS) {
      if (exceptions.has(a.registrationNo)) continue;
      const yy = a.registrationNo.split('/')[2]!;
      expect(a.registeredOn.slice(2, 4), a.sebiName).toBe(yy);
    }
  });

  it('looks up by slug and reads the city from the address', () => {
    const s = getAmc('sundaram-mutual-fund')!;
    expect(s.registrationNo).toBe('MF/034/97/2');
    expect(amcCity(s)).toBe('Chennai');
    expect(amcCity(getAmc('hdfc-mutual-fund')!)).toBe('Mumbai');
    expect(getAmc('no-such-amc')).toBeUndefined();
  });
});
