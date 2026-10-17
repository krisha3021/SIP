/**
 * Daily MF data-quality task. Every test uses deterministic fixtures and an injected fetch; nothing
 * touches the network. Expected counts are worked out by hand from the fixture calendars.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  loadApprovedSchemes,
  runValidateMfData,
  type AiSummarizer,
  type ApprovedScheme,
  type ValidateMfDataOptions,
} from '@/lib/automation/tasks/validateMfData';
import { InMemoryMfDataStore } from '@/lib/automation/tasks/storage';
import { redact, REDACTED, type TaskLogger } from '@/lib/automation/tasks/logging';
import { isAuthorizedCronRequest } from '@/lib/automation/tasks/cronAuth';
import { businessDaySeries } from '../finance/fixtures';

const PPFAS: ApprovedScheme = {
  schemeCode: 122639,
  nameContains: 'Parag Parikh Flexi Cap Fund',
  fundHouse: 'PPFAS Mutual Fund',
  expectedPlan: 'Direct',
  expectedOption: 'Growth',
};
const OTHER: ApprovedScheme = { schemeCode: 100001, nameContains: 'Example Index Fund', expectedPlan: 'Direct', expectedOption: 'Growth' };

const toDdMmYyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
type Row = { date: string; nav: string };
const rowsFrom = (from: string, to: string, navFn: (iso: string, i: number) => number = (_d, i) => 100 + i * 0.1): Row[] =>
  businessDaySeries(from, to, navFn)
    .map((p) => ({ date: toDdMmYyyy(p.date), nav: p.nav.toFixed(4) }))
    .reverse(); // MFAPI lists newest first

const payload = (code: number, name: string, data: Row[], fundHouse = 'PPFAS Mutual Fund') => ({
  meta: { fund_house: fundHouse, scheme_type: 'Open Ended Schemes', scheme_category: 'Equity Scheme - Flexi Cap Fund', scheme_code: code, scheme_name: name, isin_growth: null, isin_div_reinvestment: null },
  data,
  status: 'SUCCESS',
});
const ppfasPayload = (data: Row[], name = 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth') => payload(122639, name, data);

/** Fetch stub routing by scheme code; a value of Error is thrown, a function is called. */
function stubFetch(routes: Record<number, unknown>) {
  return vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const code = Number(/\/mf\/(\d+)/.exec(String(url))?.[1]);
    const r = routes[code];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return (r as () => Promise<Response>)();
    if (r === undefined) return new Response('', { status: 404 });
    return new Response(JSON.stringify(r), { status: 200 });
  });
}

// Saturday 17 Oct 2026, 08:30 IST. The latest weekday NAV is Friday 16 Oct.
const NOW = '2026-10-17T03:00:00Z';
const fixedNow = (iso = NOW) => () => new Date(iso);
let seq = 0;
const ids = () => `run-${++seq}`;

const run = (store: InMemoryMfDataStore, fetchImpl: typeof fetch, opts: Partial<ValidateMfDataOptions> = {}, extra: { schemes?: ApprovedScheme[]; now?: () => Date; summarizer?: AiSummarizer; logger?: TaskLogger } = {}) =>
  runValidateMfData(
    { store, fetchImpl, now: extra.now ?? fixedNow(), newRunId: ids, schemes: extra.schemes ?? [PPFAS], summarizer: extra.summarizer, logger: extra.logger },
    { trigger: 'manual', retries: 0, ...opts },
  );

describe('approved scheme configuration', () => {
  it('the shipped list is valid and Growth-only', () => {
    const schemes = loadApprovedSchemes();
    expect(schemes.length).toBeGreaterThan(0);
    expect(schemes.every((s) => s.expectedOption === 'Growth')).toBe(true);
  });
  it('rejects duplicates and malformed entries', () => {
    expect(() => loadApprovedSchemes({ version: 1, schemes: [PPFAS, PPFAS] })).toThrow();
    expect(() => loadApprovedSchemes({ version: 1, schemes: [{ schemeCode: 'abc' }] })).toThrow();
  });
});

describe('validate-mf-data: happy path and idempotency', () => {
  it('first run accepts the last 30 days and reports fresh data', async () => {
    const store = new InMemoryMfDataStore();
    const fetchImpl = stubFetch({ 122639: ppfasPayload(rowsFrom('2026-08-03', '2026-10-16')) });
    const report = await run(store, fetchImpl);
    // Weekdays 16 Sep – 16 Oct 2026: 3 + 5 + 5 + 5 + 5 = 23
    expect(report.status).toBe('succeeded');
    expect(report.observationsAccepted).toBe(23);
    expect(report.observationsQuarantined).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.freshness).toEqual([{ schemeCode: 122639, observedAt: '2026-10-16', state: 'latest-nav' }]);
    expect(report.usage.upstreamRequests).toBe(1);
    expect(report.aiSummary).toEqual({ status: 'disabled', text: null });
    expect(store.runReports).toHaveLength(1);
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://api.mfapi.in/mf/122639');
  });

  it('re-running on the same data accepts nothing new and writes no duplicates', async () => {
    const store = new InMemoryMfDataStore();
    const fetchImpl = stubFetch({ 122639: ppfasPayload(rowsFrom('2026-08-03', '2026-10-16')) });
    await run(store, fetchImpl);
    const before = (await store.getObservations(122639)).length;
    const second = await run(store, fetchImpl);
    expect(second.status).toBe('succeeded');
    expect(second.observationsAccepted).toBe(0);
    expect((await store.getObservations(122639)).length).toBe(before);
    expect(store.quarantined.size).toBe(0);
  });

  it('a later run accepts only observations after the last accepted date', async () => {
    const store = new InMemoryMfDataStore();
    await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-08-03', '2026-10-16')) }));
    const next = await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-08-03', '2026-10-19')) }), {}, { now: fixedNow('2026-10-20T03:00:00Z') });
    expect(next.observationsAccepted).toBe(1);
    expect(next.freshness[0]).toMatchObject({ observedAt: '2026-10-19', state: 'latest-nav' });
  });
});

describe('validate-mf-data: provider problems', () => {
  it('provider outage: error finding, stored data and freshness unchanged, bounded retries', async () => {
    const store = new InMemoryMfDataStore();
    await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-08-03', '2026-10-14')) }), {}, { now: fixedNow('2026-10-15T03:00:00Z') });
    const stored = await store.getObservations(122639);

    const down = stubFetch({ 122639: new TypeError('fetch failed') });
    const report = await run(store, down, { retries: 2 });
    expect(report.status).toBe('failed');
    expect(report.findings).toMatchObject([{ kind: 'upstream-error', severity: 'error', quarantined: false }]);
    expect(down).toHaveBeenCalledTimes(3);
    expect(report.usage.upstreamRequests).toBe(3);
    expect(await store.getObservations(122639)).toEqual(stored);
    expect(report.freshness[0]!.observedAt).toBe('2026-10-14'); // not advanced by the failed fetch
    expect(report.freshness[0]!.state).toBe('stale');
  });

  it('one failing scheme out of two makes the run partial', async () => {
    const store = new InMemoryMfDataStore();
    const fetchImpl = stubFetch({ 122639: ppfasPayload(rowsFrom('2026-09-01', '2026-10-16')), 100001: new Response('x', { status: 503 }) });
    fetchImpl.mockImplementation(async (url) =>
      String(url).includes('100001') ? new Response('busy', { status: 503 }) : new Response(JSON.stringify(ppfasPayload(rowsFrom('2026-09-01', '2026-10-16'))), { status: 200 }),
    );
    const report = await run(store, fetchImpl, {}, { schemes: [PPFAS, OTHER] });
    expect(report.status).toBe('partial');
    expect(report.schemesChecked).toBe(2);
    expect(report.findings.filter((f) => f.kind === 'upstream-error').map((f) => f.schemeCode)).toEqual([100001]);
    expect(report.observationsAccepted).toBeGreaterThan(0);
  });

  it('rejects an invalid payload and malformed JSON without accepting anything', async () => {
    const store = new InMemoryMfDataStore();
    const a = await run(store, stubFetch({ 122639: { status: 'SUCCESS', rows: [] } }));
    expect(a.status).toBe('failed');
    expect(a.findings).toMatchObject([{ kind: 'invalid-payload', severity: 'error' }]);
    const b = await run(store, stubFetch({ 122639: async () => new Response('<html>maintenance</html>', { status: 200 }) }));
    expect(b.findings).toMatchObject([{ kind: 'invalid-payload' }]);
    expect(store.observations.size).toBe(0);
  });

  it('flags stale data from the observation date (5 weekdays since Fri 9 Oct)', async () => {
    const store = new InMemoryMfDataStore();
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-09-01', '2026-10-09')) }));
    expect(report.findings).toMatchObject([{ kind: 'stale', severity: 'warning', observationDate: '2026-10-09' }]);
    expect(report.freshness[0]).toMatchObject({ observedAt: '2026-10-09', state: 'stale' });
  });
});

describe('validate-mf-data: quarantine (never repair or guess)', () => {
  it('collapses identical duplicates but quarantines conflicting ones', async () => {
    const store = new InMemoryMfDataStore();
    const rows = rowsFrom('2026-10-01', '2026-10-16');
    rows.push({ date: '15-10-2026', nav: rows.find((r) => r.date === '15-10-2026')!.nav }); // identical duplicate
    rows.push({ date: '14-10-2026', nav: '999.0000' }); // conflicting duplicate
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rows) }));
    expect(report.findings.find((f) => f.kind === 'duplicate' && f.observationDate === '2026-10-15')).toMatchObject({ severity: 'info', quarantined: false });
    expect(report.findings.find((f) => f.kind === 'duplicate' && f.observationDate === '2026-10-14')).toMatchObject({ severity: 'error', quarantined: true });
    const stored = await store.getObservations(122639);
    expect(stored.some((o) => o.date === '2026-10-14')).toBe(false);
    expect(stored.filter((o) => o.date === '2026-10-15')).toHaveLength(1);
    expect([...store.quarantined.values()].filter((q) => q.date === '2026-10-14')).toHaveLength(2);
  });

  it('quarantines non-positive and future-dated NAVs and reports rows without a NAV', async () => {
    const store = new InMemoryMfDataStore();
    const rows = rowsFrom('2026-10-01', '2026-10-15');
    rows.unshift({ date: '19-10-2026', nav: '120.0000' }, { date: '16-10-2026', nav: '0' });
    rows.push({ date: '13-10-2026', nav: 'N.A.' });
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rows) }));
    const kinds = report.findings.map((f) => [f.kind, f.observationDate, f.quarantined]);
    expect(kinds).toContainEqual(['invalid-payload', '2026-10-16', true]);
    expect(kinds).toContainEqual(['invalid-payload', '2026-10-19', true]);
    expect(kinds).toContainEqual(['missing', '2026-10-13', false]);
    expect(report.observationsQuarantined).toBe(2);
  });

  it('holds a suspicious jump and everything after it until reviewed', async () => {
    const store = new InMemoryMfDataStore();
    const rows = rowsFrom('2026-10-01', '2026-10-14', () => 110);
    rows.unshift({ date: '16-10-2026', nav: '141.0000' }, { date: '15-10-2026', nav: '140.0000' }); // +27.3% vs 110
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rows) }));
    const jumps = report.findings.filter((f) => f.kind === 'suspicious-jump');
    expect(jumps.map((f) => f.observationDate)).toEqual(['2026-10-15', '2026-10-16']);
    expect(jumps.every((f) => f.quarantined)).toBe(true);
    expect((await store.getLatestObservation(122639))?.date).toBe('2026-10-14');
    expect(report.status).toBe('succeeded'); // the run worked; the data needs review
  });

  it('respects a per-scheme jump threshold', async () => {
    const store = new InMemoryMfDataStore();
    const rows = rowsFrom('2026-10-01', '2026-10-15', () => 100);
    rows.unshift({ date: '16-10-2026', nav: '103.0000' });
    const strict = await run(store, stubFetch({ 122639: ppfasPayload(rows) }), {}, { schemes: [{ ...PPFAS, maxDailyMovePct: 2 }] });
    expect(strict.findings.map((f) => f.kind)).toContain('suspicious-jump');
  });

  it('a provider revision of an accepted NAV is quarantined and the stored value kept', async () => {
    const store = new InMemoryMfDataStore();
    await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-10-01', '2026-10-16')) }));
    const original = (await store.getObservations(122639)).find((o) => o.date === '2026-10-14')!.nav;
    const revised = rowsFrom('2026-10-01', '2026-10-16').map((r) => (r.date === '14-10-2026' ? { ...r, nav: '77.7000' } : r));
    const report = await run(store, stubFetch({ 122639: ppfasPayload(revised) }));
    expect(report.findings).toMatchObject([{ kind: 'duplicate', observationDate: '2026-10-14', quarantined: true }]);
    expect((await store.getObservations(122639)).find((o) => o.date === '2026-10-14')!.nav).toBe(original);
    // Idempotent quarantine: a third identical run does not add a second record.
    const size = store.quarantined.size;
    await run(store, stubFetch({ 122639: ppfasPayload(revised) }));
    expect(store.quarantined.size).toBe(size);
  });

  it('identity mismatch (option): nothing accepted, new rows quarantined', async () => {
    const store = new InMemoryMfDataStore();
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rowsFrom('2026-10-01', '2026-10-16'), 'Parag Parikh Flexi Cap Fund - Direct Plan - IDCW') }));
    expect(report.status).toBe('failed');
    expect(report.findings.find((f) => f.kind === 'identity-mismatch')?.message).toMatch(/option reads as IDCW, expected Growth/);
    expect(report.observationsAccepted).toBe(0);
    expect(report.observationsQuarantined).toBe(12); // weekdays 1–16 Oct
  });

  it('identity mismatch (scheme code and fund house)', async () => {
    const store = new InMemoryMfDataStore();
    const wrong = { ...ppfasPayload(rowsFrom('2026-10-01', '2026-10-16')), meta: { ...ppfasPayload([]).meta, scheme_code: 122640, fund_house: 'Other MF' } };
    const report = await run(store, stubFetch({ 122639: wrong }));
    const msg = report.findings.find((f) => f.kind === 'identity-mismatch')!.message;
    expect(msg).toMatch(/scheme code 122640/);
    expect(msg).toMatch(/fund house/);
  });

  it('reports gaps longer than five weekdays', async () => {
    const store = new InMemoryMfDataStore();
    const rows = [...rowsFrom('2026-10-12', '2026-10-16'), ...rowsFrom('2026-09-21', '2026-10-01')];
    const report = await run(store, stubFetch({ 122639: ppfasPayload(rows) }));
    // 1 Oct (Thu) → 12 Oct (Mon): 2, 5, 6, 7, 8, 9 Oct are 6 weekdays without a NAV.
    expect(report.findings).toMatchObject([{ kind: 'missing', severity: 'info', observationDate: '2026-10-12' }]);
  });
});

describe('validate-mf-data: run controls', () => {
  it('kill switch: no fetch, no writes, skipped-disabled', async () => {
    const store = new InMemoryMfDataStore();
    const fetchImpl = stubFetch({});
    const report = await run(store, fetchImpl, { killSwitch: async () => true });
    expect(report.status).toBe('skipped-disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.observations.size).toBe(0);
  });

  it('duplicate-run lock: a second concurrent run is skipped', async () => {
    const store = new InMemoryMfDataStore();
    await store.acquireLock('validate-mf-data', 'someone-else', 600_000, new Date(NOW));
    const fetchImpl = stubFetch({});
    const report = await run(store, fetchImpl);
    expect(report.status).toBe('skipped-duplicate');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancellation stops the run, accepts nothing, and releases the lock', async () => {
    const store = new InMemoryMfDataStore();
    const ac = new AbortController();
    const hanging = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          setTimeout(() => ac.abort(), 5);
        }),
    );
    const report = await run(store, hanging, { signal: ac.signal });
    expect(report.status).toBe('cancelled');
    expect(report.observationsAccepted).toBe(0);
    expect(report.aiSummary).toBeNull();
    expect(await store.acquireLock('validate-mf-data', 'next', 1_000, new Date(NOW))).toBe(true);
  });

  it('per-run timeout: unfinished schemes are not checked and the run fails', async () => {
    const store = new InMemoryMfDataStore();
    const hanging = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('t'), { name: 'TimeoutError' })))),
    );
    const report = await run(store, hanging, { runTimeoutMs: 30 });
    expect(report.status).toBe('failed');
    expect(report.schemesChecked).toBe(0);
  });

  it('never exceeds the concurrency limit', async () => {
    const store = new InMemoryMfDataStore();
    const schemes = [1, 2, 3, 4, 5].map((n) => ({ ...OTHER, schemeCode: 100000 + n }));
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const code = Number(/\/mf\/(\d+)/.exec(String(url))![1]);
      return new Response(JSON.stringify(payload(code, 'Example Index Fund - Direct Plan - Growth', rowsFrom('2026-10-01', '2026-10-16'), 'Example MF')), { status: 200 });
    });
    const report = await run(store, fetchImpl, { concurrency: 2 }, { schemes });
    expect(report.status).toBe('succeeded');
    expect(peak).toBe(2);
  });
});

describe('validate-mf-data: optional AI summary', () => {
  const data = () => stubFetch({ 122639: ppfasPayload(rowsFrom('2026-09-01', '2026-10-16')) });
  const strip = (r: Awaited<ReturnType<typeof run>>) => ({ ...r, runId: '', aiSummary: null, usage: { ...r.usage, aiTokens: 0 } });

  it('a failing summariser leaves the structured report intact', async () => {
    const baseline = await run(new InMemoryMfDataStore(), data());
    const summarizer: AiSummarizer = { summarize: vi.fn().mockRejectedValue(new Error('model unavailable')) };
    const withAi = await run(new InMemoryMfDataStore(), data(), { aiBudget: { maxTokens: 500 } }, { summarizer });
    expect(withAi.aiSummary).toEqual({ status: 'failed', text: null });
    expect(strip(withAi)).toEqual(strip(baseline));
  });

  it('records a successful summary and its token use, and cannot be altered by the summariser', async () => {
    const summarizer: AiSummarizer = {
      summarize: async (r) => {
        r.findings.push({ schemeCode: 1, severity: 'error', kind: 'stale', observationDate: null, message: 'injected', quarantined: false });
        r.status = 'failed';
        return { text: 'All configured schemes validated.', tokensUsed: 120 };
      },
    };
    const report = await run(new InMemoryMfDataStore(), data(), { aiBudget: { maxTokens: 500 } }, { summarizer });
    expect(report.aiSummary).toEqual({ status: 'ok', text: 'All configured schemes validated.' });
    expect(report.usage.aiTokens).toBe(120);
    expect(report.status).toBe('succeeded');
    expect(report.findings).toEqual([]);
  });

  it('respects the budget', async () => {
    const summarize = vi.fn().mockResolvedValue({ text: 'x', tokensUsed: 900 });
    const noBudget = await run(new InMemoryMfDataStore(), data(), {}, { summarizer: { summarize } });
    expect(noBudget.aiSummary?.status).toBe('skipped-budget');
    expect(summarize).not.toHaveBeenCalled();
    const over = await run(new InMemoryMfDataStore(), data(), { aiBudget: { maxTokens: 500 } }, { summarizer: { summarize } });
    expect(over.aiSummary).toEqual({ status: 'skipped-budget', text: null });
  });
});

describe('redacted logging and cron authorisation', () => {
  it('redacts secrets in keys, bearer tokens and URL query strings', () => {
    const out = redact({
      apiKey: 'k-123',
      nested: { Authorization: 'Bearer abc', note: 'called https://api.example.test/x?key=s3cret with Bearer tok.en-1' },
      error: new Error('Bearer zzz failed'),
    }) as { apiKey: string; nested: { Authorization: string; note: string }; error: { message: string } };
    expect(out.apiKey).toBe(REDACTED);
    expect(out.nested.Authorization).toBe(REDACTED);
    expect(out.nested.note).toBe(`called https://api.example.test/x?[query redacted] with Bearer ${REDACTED}`);
    expect(out.error.message).toBe(`Bearer ${REDACTED} failed`);
  });

  it('the task logs through redaction', async () => {
    const lines: string[] = [];
    const logger: TaskLogger = { info: (e, f) => lines.push(JSON.stringify([e, f])), warn: (e, f) => lines.push(JSON.stringify([e, f])), error: (e, f) => lines.push(JSON.stringify([e, f])) };
    const summarizer: AiSummarizer = { summarize: async () => Promise.reject(new Error('401 for Bearer sk-live-SECRET at https://llm.test/v1?api_key=SECRET')) };
    await run(new InMemoryMfDataStore(), stubFetch({ 122639: ppfasPayload(rowsFrom('2026-10-01', '2026-10-16')) }), { aiBudget: { maxTokens: 10 } }, { summarizer, logger });
    expect(lines.join('\n')).not.toMatch(/SECRET/);
    expect(lines.some((l) => l.includes('ai-summary-failed'))).toBe(true);
  });

  it('accepts only the exact bearer secret and fails closed without one', () => {
    const secret = 'x'.repeat(40);
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${secret}y`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(`bearer ${secret}`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(null, secret)).toBe(false);
    expect(isAuthorizedCronRequest('Bearer short', 'short')).toBe(false);
    expect(isAuthorizedCronRequest('Bearer ', undefined)).toBe(false);
  });
});
