import 'server-only';
/**
 * Server-only part of the shared contract (added in 0.2.0). Import it from route handlers, server
 * components, cron routes and scripts, never from client components: it reaches the upstream NAV
 * provider and storage. Same version and change process as '@/contracts' (docs/CONTRACTS.md).
 */
export { CONTRACT_VERSION } from './index';

// ── Data services ────────────────────────────────────────────────────────────
export type { SchemeMeta, SchemeNavHistory } from '@/lib/data/mfapi';
// 0.2.1: search and input validation re-exported so API routes never import '@/lib/data/*' directly.
export { searchSchemes, searchQuerySchema, schemeCodeSchema, PROVIDER_NAME } from '@/lib/data/mfapi';
export type { CacheStore, CacheEntry } from '@/lib/data/cache';
export { InMemoryCacheStore } from '@/lib/data/cache';
export { RequestDeduper } from '@/lib/data/dedupe';
export { createNavService, istDate } from '@/lib/data/navService';
export type { NavService, NavServiceResult, NavSource } from '@/lib/data/navService';
export type { DataError, DataErrorCode } from '@/lib/data/errors';
export { DATA_ERROR_HTTP_STATUS } from '@/lib/data/errors';
export { checkBacktestEligibility, backtestScheme, rollingReturnsForScheme } from '@/lib/data/eligibility';

// ── Automation task (Agent 1 wires the cron route) ────────────────────────────
export { runValidateMfData, loadApprovedSchemes, TASK_NAME as VALIDATE_MF_DATA_TASK } from '@/lib/automation/tasks/validateMfData';
export type { ValidateMfDataDeps, ValidateMfDataOptions, AiSummarizer, ApprovedScheme } from '@/lib/automation/tasks/validateMfData';
export type { MfDataStore, StoredObservation, QuarantinedObservation } from '@/lib/automation/tasks/storage';
export { InMemoryMfDataStore } from '@/lib/automation/tasks/storage';
export { isAuthorizedCronRequest } from '@/lib/automation/tasks/cronAuth';
export { consoleTaskLogger } from '@/lib/automation/tasks/logging';
export type { TaskLogger } from '@/lib/automation/tasks/logging';

// ── 0.5.0: scheme identity normalisation (uses the MFAPI plan/option parser, so server-only) ──
export { parseSchemeIdentity, isValidIsin } from '@/lib/data/identity';
