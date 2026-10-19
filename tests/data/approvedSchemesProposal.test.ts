/**
 * The proposed scheme list (docs/owner-actions/approved-schemes-proposal.md) must pass the same validation as the
 * live config, so that applying it after owner approval is a copy-paste. The live config itself stays unchanged.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadApprovedSchemes } from '@/lib/automation/tasks/validateMfData';
import { inferPlanOption } from '@/lib/data/mfapi';

const md = readFileSync('docs/owner-actions/approved-schemes-proposal.md', 'utf-8');
const block = /```json\n([\s\S]*?)\n```/.exec(md)?.[1];

describe('approved-scheme proposal', () => {
  it('has a JSON block that the live loader accepts', () => {
    expect(block).toBeDefined();
    const schemes = loadApprovedSchemes(JSON.parse(block!));
    expect(schemes.length).toBeGreaterThanOrEqual(10);
    expect(schemes.length).toBeLessThanOrEqual(15);
    expect(schemes.every((s) => s.expectedPlan === 'Direct' && s.expectedOption === 'Growth')).toBe(true);
  });

  it('does not overlap the existing entries, and the merged list stays valid', () => {
    const current = loadApprovedSchemes();
    const proposed = loadApprovedSchemes(JSON.parse(block!));
    expect(current.map((s) => s.schemeCode)).toEqual([122639, 122640]); // unchanged until the owner approves
    expect(() => loadApprovedSchemes({ version: 1, schemes: [...current, ...proposed] })).not.toThrow();
  });

  it('every listed MFAPI name reads as Direct / Growth with the inference the task uses', () => {
    const names = [...md.matchAll(/^\| [^|]+ \| \d+ \| ([^|]+) \|/gm)].map((m) => m[1]!.trim());
    expect(names.length).toBe(JSON.parse(block!).schemes.length);
    for (const n of names) expect(inferPlanOption(n)).toEqual({ plan: 'Direct', option: 'Growth' });
  });
});
