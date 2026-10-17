/**
 * Daily task: "Validate configured mutual-fund data and produce a quality report".
 *
 * For each approved scheme (approved-schemes.json) the task fetches the provider history, validates it
 * deterministically, compares it with previously accepted observations, accepts clean NEW observations
 * idempotently, and quarantines suspicious ones. It never repairs, interpolates or guesses a value.
 * The output is the contract's `AutomationRunReport`.
 *
 * Checks, per scheme (thresholds in `ValidationThresholds`):
 *   invalid-payload    response fails the schema (rejected); non-positive or future-dated NAV (quarantined)
 *   identity-mismatch  scheme code, name, fund house, plan or option differ from the approved entry (all new rows quarantined)
 *   missing            provider rows without a usable NAV; gaps of more than `maxGapBusinessDays` weekdays
 *   duplicate          repeated dates (identical = info; conflicting = quarantined); a provider revision of an
 *                      already accepted NAV (quarantined, the stored value is kept)
 *   suspicious-jump    |NAV / reference NAV − 1| above the scheme's threshold; the reference is the last ACCEPTED
 *                      NAV, so a jump that persists keeps every later row in quarantine until a person reviews it
 *   stale              latest accepted NAV is older than `staleBusinessDays` weekdays (IST calendar)
 *   upstream-error     the provider could not be reached or returned an HTTP error after bounded retries
 *
 * Run controls: kill switch, duplicate-run lock, per-run timeout, external cancellation (AbortSignal),
 * concurrency limit, bounded per-request retry, redacted logging, and an optional AI-summary hook that runs
 * only after the structured report is complete and can never change it.
 */
import { z } from 'zod';
import type { AutomationRunReport, AutomationRunStatus, DataQualityFinding } from '@/contracts';
import { ddmmyyyyToIso } from '@/lib/finance/dates';
import { fetchNavHistoryRaw, inferPlanOption, navHistorySchema, PROVIDER_NAME, MFAPI_BASE, UpstreamError } from '@/lib/data/mfapi';
import { toDataError } from '@/lib/data/errors';
import { istDate } from '@/lib/data/navService';
import { navFreshness, type DatasetState, type FreshnessState } from '@/lib/data/provenance';
import approvedSchemesJson from './approved-schemes.json';
import { redactingLogger, silentTaskLogger, type TaskLogger } from './logging';
import type { MfDataStore, QuarantinedObservation, StoredObservation } from './storage';

export const TASK_NAME = 'validate-mf-data' as const;

// ── Configuration ────────────────────────────────────────────────────────────

export const approvedSchemeSchema = z.object({
  schemeCode: z.number().int().positive().max(9_999_999),
  /** Case-insensitive substring the provider's scheme name must contain. */
  nameContains: z.string().min(3),
  fundHouse: z.string().min(2).optional(),
  expectedPlan: z.enum(['Direct', 'Regular']),
  expectedOption: z.enum(['Growth', 'IDCW']),
  /** Overrides `ValidationThresholds.maxDailyMovePct` for this scheme (e.g. lower for liquid funds). */
  maxDailyMovePct: z.number().positive().max(100).optional(),
});
export type ApprovedScheme = z.infer<typeof approvedSchemeSchema>;

export const approvedSchemesFileSchema = z
  .object({ version: z.literal(1), notes: z.string().optional(), schemes: z.array(approvedSchemeSchema).max(200) })
  .refine((f) => new Set(f.schemes.map((s) => s.schemeCode)).size === f.schemes.length, {
    message: 'Scheme codes in the approved list must be unique',
  });

/** Loads and validates the approved list. Throws on an invalid file: a bad config must stop the run. */
export function loadApprovedSchemes(json: unknown = approvedSchemesJson): ApprovedScheme[] {
  return approvedSchemesFileSchema.parse(json).schemes;
}

export interface ValidationThresholds {
  /** Weekdays after which the latest NAV counts as stale (holidays are absorbed by this grace). Default 3. */
  staleBusinessDays: number;
  /** Largest plausible move between consecutive NAVs, percent. Default 15. */
  maxDailyMovePct: number;
  /** Weekday gap between consecutive NAVs that is reported as missing data. Default 5. */
  maxGapBusinessDays: number;
  /** On the first run for a scheme, only the last N calendar days are accepted. Default 30. */
  initialWindowDays: number;
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  staleBusinessDays: 3,
  maxDailyMovePct: 15,
  maxGapBusinessDays: 5,
  initialWindowDays: 30,
};

// ── Pure validation of one scheme's payload ──────────────────────────────────

export interface SchemeAssessment {
  accept: Array<{ date: string; nav: number }>;
  quarantine: Array<{ date: string | null; nav: number | null; reason: DataQualityFinding['kind']; message: string }>;
  findings: DataQualityFinding[];
  /** False when the payload was rejected outright (no observation was usable). */
  payloadValid: boolean;
}

function weekdaysBetween(fromIso: string, toIso: string): number {
  let count = 0;
  const d = new Date(fromIso + 'T00:00:00Z');
  const end = new Date(toIso + 'T00:00:00Z');
  for (d.setUTCDate(d.getUTCDate() + 1); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

function minusDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const fmtPct = (x: number) => `${(x * 100).toFixed(2)}%`;

/**
 * Deterministic validation of a provider payload for one approved scheme.
 * `prior` holds previously accepted observations (ascending); only its overlap with the payload and its
 * latest entry are used.
 */
export function assessSchemePayload(
  scheme: ApprovedScheme,
  json: unknown,
  prior: StoredObservation[],
  todayIst: string,
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS,
): SchemeAssessment {
  const findings: DataQualityFinding[] = [];
  const quarantine: SchemeAssessment['quarantine'] = [];
  const code = scheme.schemeCode;
  const finding = (f: Omit<DataQualityFinding, 'schemeCode'>) => findings.push({ schemeCode: code, ...f });

  const parsed = navHistorySchema.safeParse(json);
  if (!parsed.success) {
    finding({
      severity: 'error',
      kind: 'invalid-payload',
      observationDate: null,
      message: 'The provider response did not match the expected format and was rejected. Nothing was accepted.',
      quarantined: false,
    });
    return { accept: [], quarantine, findings, payloadValid: false };
  }
  const { meta, data } = parsed.data;

  // 1. Rows → candidate observations. Malformed rows are reported, never repaired.
  const byDate = new Map<string, number[]>();
  for (const row of data) {
    const date = ddmmyyyyToIso(row.date);
    const nav = Number(row.nav);
    if (!date) {
      finding({ severity: 'warning', kind: 'missing', observationDate: null, message: `A provider row has an invalid date ("${row.date.slice(0, 20)}") and was ignored.`, quarantined: false });
      continue;
    }
    if (row.nav.trim() === '' || !Number.isFinite(nav)) {
      finding({ severity: 'warning', kind: 'missing', observationDate: date, message: `The provider row for ${date} has no numeric NAV ("${row.nav.slice(0, 20)}"); it was ignored.`, quarantined: false });
      continue;
    }
    if (nav <= 0) {
      const message = `The NAV for ${date} is ${nav}, which is not positive.`;
      quarantine.push({ date, nav, reason: 'invalid-payload', message });
      finding({ severity: 'error', kind: 'invalid-payload', observationDate: date, message, quarantined: true });
      continue;
    }
    if (date > todayIst) {
      const message = `The NAV is dated ${date}, after today's date (${todayIst}) in India.`;
      quarantine.push({ date, nav, reason: 'invalid-payload', message });
      finding({ severity: 'error', kind: 'invalid-payload', observationDate: date, message, quarantined: true });
      continue;
    }
    byDate.set(date, [...(byDate.get(date) ?? []), nav]);
  }

  // 2. Duplicate dates.
  const unique: Array<{ date: string; nav: number }> = [];
  for (const [date, navs] of byDate) {
    if (navs.length === 1) {
      unique.push({ date, nav: navs[0]! });
    } else if (navs.every((n) => n === navs[0])) {
      unique.push({ date, nav: navs[0]! });
      finding({ severity: 'info', kind: 'duplicate', observationDate: date, message: `${navs.length} identical rows for ${date} were collapsed into one.`, quarantined: false });
    } else {
      const message = `The provider reported ${navs.length} different NAVs for ${date} (${navs.join(', ')}). None was accepted.`;
      for (const nav of new Set(navs)) quarantine.push({ date, nav, reason: 'duplicate', message });
      finding({ severity: 'error', kind: 'duplicate', observationDate: date, message, quarantined: true });
    }
  }
  unique.sort((a, b) => (a.date < b.date ? -1 : 1));

  // 3. Identity.
  const problems: string[] = [];
  if (Number(meta.scheme_code) !== code) problems.push(`the provider returned scheme code ${String(meta.scheme_code)}`);
  if (!meta.scheme_name.toLowerCase().includes(scheme.nameContains.toLowerCase())) {
    problems.push(`the scheme name "${meta.scheme_name}" does not contain "${scheme.nameContains}"`);
  }
  if (scheme.fundHouse && (meta.fund_house ?? '').toLowerCase() !== scheme.fundHouse.toLowerCase()) {
    problems.push(`the fund house is "${meta.fund_house ?? 'not stated'}", expected "${scheme.fundHouse}"`);
  }
  const { plan, option } = inferPlanOption(meta.scheme_name);
  if (plan !== scheme.expectedPlan) problems.push(`the plan reads as ${plan}, expected ${scheme.expectedPlan}`);
  if (option !== scheme.expectedOption) problems.push(`the option reads as ${option}, expected ${scheme.expectedOption}`);

  // 4. Compare with prior accepted observations; select new ones.
  const priorByDate = new Map(prior.map((p) => [p.date, p.nav]));
  const lastAccepted = prior[prior.length - 1] ?? null;
  const latestPayload = unique[unique.length - 1];
  const fresh: Array<{ date: string; nav: number }> = [];
  for (const o of unique) {
    const stored = priorByDate.get(o.date);
    if (stored !== undefined) {
      if (stored !== o.nav) {
        const message = `The provider now reports ${o.nav} for ${o.date}, but ${stored} was accepted earlier. The stored value is kept.`;
        quarantine.push({ date: o.date, nav: o.nav, reason: 'duplicate', message });
        finding({ severity: 'error', kind: 'duplicate', observationDate: o.date, message, quarantined: true });
      }
      continue;
    }
    if (lastAccepted ? o.date > lastAccepted.date : latestPayload && o.date >= minusDays(latestPayload.date, thresholds.initialWindowDays)) {
      fresh.push(o);
    }
  }

  if (problems.length) {
    const message = `Scheme identity check failed: ${problems.join('; ')}. New observations were quarantined.`;
    for (const o of fresh) quarantine.push({ date: o.date, nav: o.nav, reason: 'identity-mismatch', message });
    finding({ severity: 'error', kind: 'identity-mismatch', observationDate: null, message, quarantined: fresh.length > 0 });
    return { accept: [], quarantine, findings, payloadValid: true };
  }

  // 5. Jump and gap checks against the last accepted (or last good) NAV.
  const maxMove = (scheme.maxDailyMovePct ?? thresholds.maxDailyMovePct) / 100;
  let ref: { date: string; nav: number } | null = lastAccepted ?? (fresh.length ? (unique[unique.indexOf(fresh[0]!) - 1] ?? null) : null);
  const accept: Array<{ date: string; nav: number }> = [];
  for (const o of fresh) {
    if (ref) {
      const move = o.nav / ref.nav - 1;
      if (Math.abs(move) > maxMove) {
        const message = `NAV moved ${fmtPct(move)} from ${ref.nav} on ${ref.date} to ${o.nav} on ${o.date}, beyond the ${fmtPct(maxMove)} threshold. Held for review.`;
        quarantine.push({ date: o.date, nav: o.nav, reason: 'suspicious-jump', message });
        finding({ severity: 'warning', kind: 'suspicious-jump', observationDate: o.date, message, quarantined: true });
        continue;
      }
      const gap = weekdaysBetween(ref.date, o.date) - 1;
      if (gap > thresholds.maxGapBusinessDays) {
        finding({ severity: 'info', kind: 'missing', observationDate: o.date, message: `No NAV for ${gap} weekdays between ${ref.date} and ${o.date}.`, quarantined: false });
      }
    }
    accept.push(o);
    ref = o;
  }

  // 6. Staleness of what will be the latest accepted NAV.
  const latest = accept[accept.length - 1]?.date ?? lastAccepted?.date ?? null;
  if (latest === null) {
    finding({ severity: 'warning', kind: 'stale', observationDate: null, message: 'No accepted NAV exists for this scheme yet.', quarantined: false });
  } else {
    const lag = weekdaysBetween(latest, todayIst);
    if (lag > thresholds.staleBusinessDays) {
      finding({ severity: 'warning', kind: 'stale', observationDate: latest, message: `The latest accepted NAV is from ${latest}, ${lag} weekdays ago.`, quarantined: false });
    }
  }

  return { accept, quarantine, findings, payloadValid: true };
}

// ── Run orchestration ────────────────────────────────────────────────────────

/**
 * Optional AI summary. It receives the finished structured report and may only return text.
 * Lakshya ships no implementation and no LLM dependency; a provider can be plugged in later.
 */
export interface AiSummarizer {
  summarize(report: AutomationRunReport, opts: { maxTokens: number; signal: AbortSignal }): Promise<{ text: string; tokensUsed: number }>;
}

export interface ValidateMfDataDeps {
  store: MfDataStore;
  /** Injectable fetch (tests pass fixtures; production uses global fetch). */
  fetchImpl?: typeof fetch;
  now?: () => Date;
  newRunId?: () => string;
  logger?: TaskLogger;
  summarizer?: AiSummarizer;
  /** Defaults to approved-schemes.json. */
  schemes?: ApprovedScheme[];
}

export interface ValidateMfDataOptions {
  trigger: 'schedule' | 'manual';
  signal?: AbortSignal;
  /** Whole-run budget. Default 120 s, capped at 280 s (below a 300 s serverless limit). */
  runTimeoutMs?: number;
  /** Parallel upstream requests. Default 2, max 5. */
  concurrency?: number;
  /** Retries per request on timeout/network/5xx/429. Default 1, max 2. */
  retries?: number;
  /** Per-request timeout. Default 10 s (adapter clamps to 2–15 s). */
  requestTimeoutMs?: number;
  /** When true (or resolving true), the run does nothing and reports 'skipped-disabled'. */
  killSwitch?: boolean | (() => boolean | Promise<boolean>);
  /** Lock lifetime; a crashed run's lock expires after this. Default 10 minutes. */
  lockTtlMs?: number;
  thresholds?: Partial<ValidationThresholds>;
  /** Token budget for the optional AI summary. 0 or omitted = summary skipped for budget. */
  aiBudget?: { maxTokens: number; timeoutMs?: number };
}

const clampInt = (v: number | undefined, def: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(v ?? def)));

function defaultRunId(now: Date): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${TASK_NAME}-${now.toISOString().replace(/[:.]/g, '-')}-${rand.slice(0, 8)}`;
}

async function mapPool<T>(items: T[], limit: number, signal: AbortSignal, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function runValidateMfData(deps: ValidateMfDataDeps, options: ValidateMfDataOptions): Promise<AutomationRunReport> {
  const now = deps.now ?? (() => new Date());
  const log = redactingLogger(deps.logger ?? silentTaskLogger);
  const startedAt = now();
  const runId = deps.newRunId?.() ?? defaultRunId(startedAt);
  const schemes = deps.schemes ?? loadApprovedSchemes();
  const thresholds: ValidationThresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const todayIst = istDate(startedAt);
  let upstreamRequests = 0;

  const report: AutomationRunReport = {
    runId,
    task: TASK_NAME,
    status: 'running',
    trigger: options.trigger,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    schemesConfigured: schemes.length,
    schemesChecked: 0,
    observationsAccepted: 0,
    observationsQuarantined: 0,
    findings: [],
    freshness: [],
    aiSummary: null,
    usage: { upstreamRequests: 0, aiTokens: 0 },
  };
  const finish = async (status: AutomationRunStatus) => {
    report.status = status;
    report.finishedAt = now().toISOString();
    report.usage.upstreamRequests = upstreamRequests;
    try {
      await deps.store.saveRunReport(report);
    } catch (e) {
      log.error('validate-mf-data.save-report-failed', { runId, error: e });
    }
    log.info('validate-mf-data.finished', { runId, status, accepted: report.observationsAccepted, quarantined: report.observationsQuarantined, findings: report.findings.length });
    return report;
  };

  // Kill switch.
  const killed = typeof options.killSwitch === 'function' ? await options.killSwitch() : options.killSwitch === true;
  if (killed) {
    log.warn('validate-mf-data.kill-switch', { runId });
    return finish('skipped-disabled');
  }

  // Duplicate-run lock.
  const lockTtl = clampInt(options.lockTtlMs, 600_000, 60_000, 3_600_000);
  if (!(await deps.store.acquireLock(TASK_NAME, runId, lockTtl, startedAt))) {
    log.warn('validate-mf-data.duplicate-run', { runId });
    return finish('skipped-duplicate');
  }

  const runTimeout = AbortSignal.timeout(clampInt(options.runTimeoutMs, 120_000, 1, 280_000));
  const signal = options.signal ? AbortSignal.any([options.signal, runTimeout]) : runTimeout;
  const baseFetch = deps.fetchImpl ?? fetch;
  const countingFetch: typeof fetch = (input, init) => {
    upstreamRequests++;
    return baseFetch(input, init);
  };
  const failedSchemes = new Set<number>();

  try {
    log.info('validate-mf-data.started', { runId, trigger: options.trigger, schemes: schemes.length });
    await mapPool(schemes, clampInt(options.concurrency, 2, 1, 5), signal, async (scheme) => {
      let json: unknown;
      try {
        json = await fetchNavHistoryRaw(scheme.schemeCode, {
          fetchImpl: countingFetch,
          retries: clampInt(options.retries, 1, 0, 2),
          timeoutMs: options.requestTimeoutMs ?? 10_000,
          signal,
        });
      } catch (e) {
        if (signal.aborted || (e instanceof UpstreamError && e.kind === 'cancelled')) return; // not checked
        const err = toDataError(e);
        failedSchemes.add(scheme.schemeCode);
        report.schemesChecked++;
        report.findings.push({
          schemeCode: scheme.schemeCode,
          severity: 'error',
          kind: err.code === 'INVALID_PAYLOAD' ? 'invalid-payload' : 'upstream-error',
          observationDate: null,
          message: `${err.message} Previously accepted data was kept unchanged.`,
          quarantined: false,
        });
        log.warn('validate-mf-data.upstream-error', { runId, schemeCode: scheme.schemeCode, code: err.code });
        return;
      }
      if (signal.aborted) return;

      const latest = await deps.store.getLatestObservation(scheme.schemeCode);
      const sinceDate = minusDays(latest?.date ?? todayIst, 400);
      const prior = await deps.store.getObservations(scheme.schemeCode, sinceDate);
      const assessment = assessSchemePayload(scheme, json, prior, todayIst, thresholds);
      report.schemesChecked++;
      if (!assessment.payloadValid || assessment.findings.some((f) => f.kind === 'identity-mismatch')) failedSchemes.add(scheme.schemeCode);

      const at = now().toISOString();
      const accepted = await deps.store.acceptObservations(
        assessment.accept.map((o) => ({ schemeCode: scheme.schemeCode, date: o.date, nav: o.nav, acceptedAt: at, runId })),
      );
      // A concurrent writer may have stored a different value since we read `prior`: quarantine, never overwrite.
      const conflictRecords: QuarantinedObservation[] = accepted.conflicts.map((c) => ({
        schemeCode: c.schemeCode,
        date: c.date,
        nav: c.nav,
        reason: 'duplicate',
        message: `A different NAV for ${c.date} was already stored; this value was not written.`,
        runId,
        quarantinedAt: at,
      }));
      const records: QuarantinedObservation[] = [
        ...assessment.quarantine.map((q) => ({ ...q, schemeCode: scheme.schemeCode, runId, quarantinedAt: at })),
        ...conflictRecords,
      ];
      if (records.length) await deps.store.quarantine(records);
      report.observationsAccepted += accepted.inserted;
      report.observationsQuarantined += records.length;
      report.findings.push(...assessment.findings);
      for (const c of conflictRecords) {
        report.findings.push({ schemeCode: c.schemeCode, severity: 'error', kind: 'duplicate', observationDate: c.date, message: c.message, quarantined: true });
      }
    });

    // Freshness from what is stored after this run — never from the run time.
    for (const s of schemes) {
      const latest = await deps.store.getLatestObservation(s.schemeCode);
      const state: DatasetState<true> = {
        data: latest ? true : null,
        provenance: latest
          ? {
              provider: PROVIDER_NAME,
              providerUrl: `${MFAPI_BASE}/mf/${s.schemeCode}`,
              identifier: `AMFI scheme code ${s.schemeCode}`,
              observedAt: latest.date,
              fetchedAt: latest.acceptedAt,
              coverage: null,
              plan: s.expectedPlan,
              option: s.expectedOption,
              currency: 'INR',
              units: 'INR per unit',
              classification: 'observed',
              notes: [],
            }
          : null,
        lastAttemptAt: null,
        lastError: failedSchemes.has(s.schemeCode) ? 'Validation failed in the latest run' : null,
      };
      const fs: FreshnessState = navFreshness(state, todayIst, thresholds.staleBusinessDays);
      report.freshness.push({ schemeCode: s.schemeCode, observedAt: latest?.date ?? null, state: fs });
    }
  } finally {
    await deps.store.releaseLock(TASK_NAME, runId);
  }

  let status: AutomationRunStatus;
  if (options.signal?.aborted) status = 'cancelled';
  else if (report.schemesChecked === 0 && schemes.length > 0) status = 'failed';
  else if (report.schemesChecked < schemes.length || failedSchemes.size > 0) status = failedSchemes.size === schemes.length ? 'failed' : 'partial';
  else status = 'succeeded';
  if (runTimeout.aborted && !options.signal?.aborted) {
    log.warn('validate-mf-data.timeout', { runId, checked: report.schemesChecked, configured: schemes.length });
  }

  // Optional AI summary — derived from the finished report; failure leaves the report intact.
  if (status !== 'cancelled') {
    report.status = status;
    const ai = await summarise(deps.summarizer, report, options.aiBudget, log, runId);
    report.aiSummary = ai.summary;
    report.usage.aiTokens = ai.tokens;
  }
  return finish(status);
}

type AiSummary = NonNullable<AutomationRunReport['aiSummary']>;

async function summarise(
  summarizer: AiSummarizer | undefined,
  report: AutomationRunReport,
  budget: ValidateMfDataOptions['aiBudget'],
  log: TaskLogger,
  runId: string,
): Promise<{ summary: AiSummary; tokens: number }> {
  if (!summarizer) return { summary: { status: 'disabled', text: null }, tokens: 0 };
  const maxTokens = Math.max(0, Math.floor(budget?.maxTokens ?? 0));
  if (maxTokens === 0) return { summary: { status: 'skipped-budget', text: null }, tokens: 0 };
  try {
    // The summariser gets a copy: whatever it does, it cannot alter the structured report.
    const snapshot = structuredClone(report);
    const res = await summarizer.summarize(snapshot, { maxTokens, signal: AbortSignal.timeout(clampInt(budget?.timeoutMs, 15_000, 1, 60_000)) });
    const tokens = Number.isFinite(res.tokensUsed) ? Math.max(0, res.tokensUsed) : 0;
    if (tokens > maxTokens) return { summary: { status: 'skipped-budget', text: null }, tokens };
    if (typeof res.text !== 'string' || res.text.trim() === '') return { summary: { status: 'failed', text: null }, tokens };
    return { summary: { status: 'ok', text: res.text.slice(0, 4000) }, tokens };
  } catch (e) {
    log.warn('validate-mf-data.ai-summary-failed', { runId, error: e });
    return { summary: { status: 'failed', text: null }, tokens: 0 };
  }
}
