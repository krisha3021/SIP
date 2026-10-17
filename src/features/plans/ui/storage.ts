/**
 * Safe wrapper around window.localStorage.
 * Every access is in try/catch: storage can be disabled, full, or unavailable (private mode, SSR, sandboxed frames).
 * Nothing stored here leaves the browser.
 */
import { z } from 'zod';

function store(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export const safeStorage = {
  available(): boolean {
    const s = store();
    if (!s) return false;
    try {
      const k = '__lakshya_probe__';
      s.setItem(k, '1');
      s.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
  get(key: string): string | null {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      const s = store();
      if (!s) return false;
      s.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      store()?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const PLANS_KEY = 'lakshya:plans:v1';
export const MAX_PLANS = 50;

export const savedPlanSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  calculator: z.string().min(1).max(40),
  /** Calculator path, e.g. /calculators/sip */
  path: z.string().regex(/^\/[a-z0-9\-/]*$/),
  /** Assumptions as they appear in a share link query string. */
  query: z.string().max(2000),
  savedAt: z.string(),
});
export type SavedPlan = z.infer<typeof savedPlanSchema>;

export function readPlans(): SavedPlan[] {
  const raw = safeStorage.get(PLANS_KEY);
  if (!raw) return [];
  try {
    const parsed = z.array(savedPlanSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export type SaveOutcome = { ok: true; plan: SavedPlan } | { ok: false; reason: 'unavailable' | 'limit' | 'invalid' };

export function savePlan(input: Omit<SavedPlan, 'id' | 'savedAt'>): SaveOutcome {
  if (!safeStorage.available()) return { ok: false, reason: 'unavailable' };
  const plans = readPlans();
  if (plans.length >= MAX_PLANS) return { ok: false, reason: 'limit' };
  const plan = { ...input, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, savedAt: new Date().toISOString() };
  const valid = savedPlanSchema.safeParse(plan);
  if (!valid.success) return { ok: false, reason: 'invalid' };
  return safeStorage.set(PLANS_KEY, JSON.stringify([valid.data, ...plans])) ? { ok: true, plan: valid.data } : { ok: false, reason: 'unavailable' };
}

export function deletePlan(id: string): boolean {
  const plans = readPlans().filter((p) => p.id !== id);
  return safeStorage.set(PLANS_KEY, JSON.stringify(plans));
}
