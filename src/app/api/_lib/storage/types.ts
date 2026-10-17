// Store interfaces come from the shared contract (Agent 2 owns them); this file only re-exports them.
export type { CacheEntry, CacheStore, MfDataStore, QuarantinedObservation, StoredObservation } from '@/contracts/server';
export { InMemoryCacheStore, InMemoryMfDataStore } from '@/contracts/server';
export type { AutomationRunReport as AutomationRunReportForStore } from '@/contracts';
