/**
 * Local audit log of permission decisions. Stores when, which action, where, and the outcome — never the data itself.
 * Kept in this browser only; the Privacy & Permissions page can clear it.
 */
import { z } from 'zod';
import { safeStorage } from '@/features/plans/ui/storage';

export const AUDIT_KEY = 'lakshya:audit:v1';
export const MAX_AUDIT = 200;

const entrySchema = z.object({
  at: z.string(),
  action: z.string().max(40),
  destination: z.string().max(120),
  outcome: z.enum(['approved', 'cancelled', 'sent', 'failed', 'blocked']),
});
export type AuditEntry = z.infer<typeof entrySchema>;

export function readAudit(): AuditEntry[] {
  const raw = safeStorage.get(AUDIT_KEY);
  if (!raw) return [];
  try {
    const p = z.array(entrySchema).safeParse(JSON.parse(raw));
    return p.success ? p.data : [];
  } catch {
    return [];
  }
}

/** Accepts only metadata fields, so payload values cannot be logged by mistake. */
export function recordAudit(e: { action: string; destination: string; outcome: AuditEntry['outcome'] }): void {
  const entry = entrySchema.safeParse({ at: new Date().toISOString(), action: e.action, destination: e.destination, outcome: e.outcome });
  if (!entry.success) return;
  safeStorage.set(AUDIT_KEY, JSON.stringify([entry.data, ...readAudit()].slice(0, MAX_AUDIT)));
}

export const clearAudit = () => safeStorage.remove(AUDIT_KEY);
