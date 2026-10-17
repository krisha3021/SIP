/**
 * Storage interface for the MF data-quality task, plus an in-memory implementation for tests and
 * local runs. A production implementation (Postgres, Redis/KV, …) must keep the same semantics:
 *
 * - `acceptObservations` is idempotent on (schemeCode, date). An identical NAV is a no-op. A DIFFERENT
 *   NAV for an already accepted date is never written; it is returned as a conflict for quarantine.
 * - `quarantine` is idempotent on (schemeCode, date, reason, nav).
 * - `acquireLock` is an atomic compare-and-set with expiry (e.g. `SET key owner NX PX ttl` in Redis,
 *   or an INSERT … ON CONFLICT with an expiry check in SQL).
 * Proposed relational schema: docs/DATA-SOURCES.md §Storage.
 */
import type { AutomationRunReport, DataQualityFinding } from '@/contracts';

export interface StoredObservation {
  schemeCode: number;
  /** ISO date of the NAV. */
  date: string;
  nav: number;
  acceptedAt: string;
  runId: string;
}

export interface QuarantinedObservation {
  schemeCode: number;
  date: string | null;
  nav: number | null;
  reason: DataQualityFinding['kind'];
  message: string;
  runId: string;
  quarantinedAt: string;
}

export interface MfDataStore {
  /** Accepted observations for a scheme on or after `sinceDate` (all when omitted), ascending by date. */
  getObservations(schemeCode: number, sinceDate?: string): Promise<StoredObservation[]>;
  getLatestObservation(schemeCode: number): Promise<StoredObservation | null>;
  acceptObservations(obs: StoredObservation[]): Promise<{ inserted: number; unchanged: number; conflicts: StoredObservation[] }>;
  quarantine(records: QuarantinedObservation[]): Promise<{ inserted: number; alreadyPresent: number }>;
  acquireLock(name: string, owner: string, ttlMs: number, now: Date): Promise<boolean>;
  releaseLock(name: string, owner: string): Promise<void>;
  saveRunReport(report: AutomationRunReport): Promise<void>;
}

const quarantineKey = (q: QuarantinedObservation) => `${q.schemeCode}|${q.date ?? '-'}|${q.reason}|${q.nav ?? '-'}`;

export class InMemoryMfDataStore implements MfDataStore {
  readonly observations = new Map<number, Map<string, StoredObservation>>();
  readonly quarantined = new Map<string, QuarantinedObservation>();
  readonly runReports: AutomationRunReport[] = [];
  private readonly locks = new Map<string, { owner: string; expiresAt: number }>();

  async getObservations(schemeCode: number, sinceDate?: string): Promise<StoredObservation[]> {
    const m = this.observations.get(schemeCode);
    if (!m) return [];
    return [...m.values()]
      .filter((o) => sinceDate === undefined || o.date >= sinceDate)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((o) => ({ ...o }));
  }

  async getLatestObservation(schemeCode: number): Promise<StoredObservation | null> {
    const all = await this.getObservations(schemeCode);
    return all[all.length - 1] ?? null;
  }

  async acceptObservations(obs: StoredObservation[]) {
    let inserted = 0;
    let unchanged = 0;
    const conflicts: StoredObservation[] = [];
    for (const o of obs) {
      let m = this.observations.get(o.schemeCode);
      if (!m) this.observations.set(o.schemeCode, (m = new Map()));
      const existing = m.get(o.date);
      if (!existing) {
        m.set(o.date, { ...o });
        inserted++;
      } else if (existing.nav === o.nav) {
        unchanged++;
      } else {
        conflicts.push({ ...o });
      }
    }
    return { inserted, unchanged, conflicts };
  }

  async quarantine(records: QuarantinedObservation[]) {
    let inserted = 0;
    let alreadyPresent = 0;
    for (const q of records) {
      const k = quarantineKey(q);
      if (this.quarantined.has(k)) alreadyPresent++;
      else {
        this.quarantined.set(k, { ...q });
        inserted++;
      }
    }
    return { inserted, alreadyPresent };
  }

  async acquireLock(name: string, owner: string, ttlMs: number, now: Date): Promise<boolean> {
    const held = this.locks.get(name);
    if (held && held.expiresAt > now.getTime() && held.owner !== owner) return false;
    this.locks.set(name, { owner, expiresAt: now.getTime() + ttlMs });
    return true;
  }

  async releaseLock(name: string, owner: string): Promise<void> {
    if (this.locks.get(name)?.owner === owner) this.locks.delete(name);
  }

  async saveRunReport(report: AutomationRunReport): Promise<void> {
    this.runReports.push(structuredClone(report));
  }
}
