# Data Sources

Owner: Agent 2 (finance & data). Last reviewed 2026-10-17.

## Principles
- Lakshya shows only what a configured provider returned, together with its provenance (`Provenance` in
  `src/lib/data/provenance.ts`): provider, identifier, observation date, last successful fetch, coverage, plan,
  option, and classification.
- Freshness comes from the **observation date** of the data, never from the time a page loaded. A failed fetch never
  advances it (`applyFetchAttempt`).
- Lakshya never invents AUM, ratings, holdings, TER, or returns. A field the provider does not return is shown as
  **"Not available"**.
- No licensed index-quote provider is configured, so the site shows **no index ticker and no "LIVE" label**. Scraping
  NSE or BSE pages is not permitted.

## MFAPI (api.mfapi.in) — the current NAV provider

| Item | Status |
|---|---|
| What it is | An independent, third-party service that republishes AMFI NAV data. It is **not** an official AMFI or AMC service. |
| Endpoints used | `GET /mf/{schemeCode}` (full history, newest first). Also observed, not yet used: `/mf/{schemeCode}/latest` and `/mf/search?q=`. |
| Response shape | Observed on 2026-10-17: `{ meta: { fund_house, scheme_type, scheme_category, scheme_code, scheme_name, isin_growth, isin_div_reinvestment }, data: [{ date: "DD-MM-YYYY", nav: "90.88440" }], status }`. The search endpoint returns `[{ schemeCode, schemeName }]`. Validated with Zod (`navHistorySchema`). |
| Example | `/mf/122639` → "Parag Parikh Flexi Cap Fund - Direct Plan - Growth", PPFAS Mutual Fund, latest NAV 90.88440 dated 16-10-2026. This was observed live once, by hand, while writing this document. CI never calls the provider. |
| Rate limits | **Contradictory statements (read 2026-10-17).** The home page (https://www.mfapi.in/) says "No authentication, no API keys, no rate limiting". The documentation (https://www.mfapi.in/docs/) says "The API implements rate limiting to ensure fair usage. Please cache responses when appropriate". No rate-limit headers were observed. Lakshya assumes a limit exists and limits itself: a 6-hour cache, a 60-second cool-down after a failure, request de-duplication, at most 2 retries, and a concurrency of 2 in the daily task. |
| Reliability / SLA | **None published.** The home page claims "99.9% uptime" and links a status page (http://status.mfapi.in/), but there is no contractual SLA. The site says data is updated 6× daily (10:05, 14:05, 18:05, 21:05, 03:09 and 05:05 IST). Outages are handled by the last-known-good fallback (`src/lib/data/navService.ts`). On 2026-10-17 MFAPI's latest NAV for one liquid fund was one day behind AMFI's NAVAll.txt. |
| Data quality caveats | Rows can carry non-numeric NAVs such as `"N.A."`. Dates and scheme names are free text. The plan (Direct or Regular) and the option (Growth or IDCW) are not separate fields; they are inferred from the scheme name, and `Unknown` is returned rather than a guess. |
| Terms, redistribution, commercial use | **No published terms (checked 2026-10-17).** The footer shows "Privacy Policy" and "Terms of Service", but both link to `#`; `/terms` and `/privacy` return 404, and there is no `robots.txt`. The footer says "© 2025 MFapi.in. All rights reserved." No licence and no official source repository were found (GitHub search on 2026-10-17 found only third-party projects). MFAPI republishes AMFI data, so **AMFI's own terms also apply to the underlying data** (see below). **Owner action:** send the permission request in `docs/owner-actions/mfapi-permission-request.md`. |
| Contact route | The routes published on https://www.mfapi.in/ are Telegram https://t.me/mfapi_in, X/Twitter https://twitter.com/SkyRocknRoll, and LinkedIn https://www.linkedin.com/in/yuvarajl/. No email address is published. |
| Security | Server-side only. Request URLs are built from a fixed base URL plus a validated 1–7-digit scheme code, or an encoded search string of at most 80 characters. Arbitrary URLs are never proxied. |

### AMFI website terms of use (read 2026-10-17)
The source is https://www.amfiindia.com/terms-of-use, linked from the amfiindia.com footer. It applies to all AMFI website
content, including NAVAll.txt, the TER pages and the AAUM data. Summary (not legal advice):
- **Permitted use:** a "non-exclusive, personal, non-transferable, non-sublicensable, limited and revocable right to
  access, use and display this Site … for your personal and non-commercial use only". "No other use of the Site is
  authorised unless you and we have agreed otherwise in writing."
- **Prohibited:** "You may not publicly perform, publicly display, transmit, publish … or create derivative works based on
  anything available through the Site" and "You shall not store electronically any significant portion of any part of the
  Site". Linking is allowed only to the home page.
- **Consequence for Lakshya.** Showing AMFI-derived NAVs, TER or AAUM on a public website, caching them, or putting them
  in exports appears to need AMFI's **written permission**. This also applies to data obtained through MFAPI, because
  MFAPI republishes AMFI data. **Owner action (required before public launch):** send the request in
  `docs/owner-actions/amfi-permission-request.md`. Until written permission is held, the AMFI TER/AAUM adapters stay
  off (`AMFI_REUSE_APPROVED` gate; see §AMFI TER and AAUM below).

### AMFI NAVAll.txt — a candidate primary source (to evaluate)
AMFI publishes a daily file of all scheme NAVs: https://portal.amfiindia.com/spages/NAVAll.txt (the old
www.amfiindia.com/spages path redirects there). It was observed on 2026-10-17: 1.5 MB, `text/plain`, with columns
`Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date`. The
separate **Plan** and **Option** columns remove the need to infer them from names. As the industry body's own publication, it is closer to the primary
source than MFAPI. To evaluate before switching:
1. Confirm the current official URL and the terms of use with AMFI.
2. The file holds only the **latest** NAV, so history would have to be built up by Lakshya's own daily ingestion,
   using the storage below. MFAPI could still serve as the backfill source.
3. The daily task's validation (identity, duplicates, jumps, stale data) applies unchanged. Only the adapter changes.
Owner decision needed.

### Not used, and why
- Fund factsheets, star ratings, AUM, holdings, and TER from third-party sites are proprietary or unverified, and
  redistributing them needs a licence (AUDIT §3.3).
- Index levels and quotes: there is no licensed provider. The prototype's ticker held hard-coded values (AUDIT §3.1).

## Approved scheme list (daily task)
`src/lib/automation/tasks/approved-schemes.json` lists the schemes the daily task validates. Each entry gives the
scheme code, a required name substring, the fund house, and the expected plan and option, plus an optional per-scheme
jump threshold. The two shipped entries (122639 Direct-Growth and 122640 Regular-Growth, PPFAS Flexi Cap) were checked
against live MFAPI responses on 2026-10-17. The **owner approves every addition.** Only Growth options are listed,
because IDCW NAVs are not backtested.

## Daily task: "Validate configured mutual-fund data and produce a quality report"
Code: `src/lib/automation/tasks/validateMfData.ts`. Contract: `AutomationRunReport` (`@/contracts`). Tests:
`tests/data/validateMfData.test.ts`.

| Check | Severity | Action |
|---|---|---|
| Response fails the schema / malformed JSON | error `invalid-payload` | Rejected. Nothing accepted. |
| NAV ≤ 0, or dated after today (IST) | error `invalid-payload` | Quarantined |
| Row with no numeric NAV (`"N.A."`), invalid date | warning `missing` | Ignored and reported |
| Gap of more than 5 weekdays between NAVs | info `missing` | Reported |
| Identical duplicate dates | info `duplicate` | Collapsed |
| Conflicting duplicates, or provider revision of an accepted NAV | error `duplicate` | Quarantined. The stored value is kept. |
| Scheme code / name / fund house / plan / option differs from config | error `identity-mismatch` | All new rows quarantined |
| \|NAV / last accepted NAV − 1\| > 15 % (per-scheme override) | warning `suspicious-jump` | Quarantined. Later rows stay held until a person reviews them. |
| Latest accepted NAV more than 3 weekdays old (IST) | warning `stale` | Reported |
| Provider unreachable / HTTP error after retries | error `upstream-error` | Prior data kept and freshness not advanced |

The task never repairs, interpolates, or guesses a value. On the first run for a scheme it accepts the last 30 days.
After that it accepts only dates after the last accepted one. Acceptance is idempotent on (scheme, date).

**Controls:**
- Kill switch: the run reports `skipped-disabled`.
- Duplicate-run lock with expiry: the run reports `skipped-duplicate`.
- Per-run timeout: default 120 s, maximum 280 s.
- Cancellation through an `AbortSignal`: the run reports `cancelled`.
- Concurrency limit: default 2, maximum 5.
- Bounded retry: 0–2 attempts, on timeout, network errors, 5xx, and 429.
- Redacted JSON-lines logging.
- Optional AI-summary hook (`AiSummarizer`) behind a token budget. It runs only after the structured report is
  complete, receives a copy of it, and cannot change it. When it fails, `aiSummary.status` is set to `failed` and the
  report is unaffected. No LLM dependency is included.

### How Agent 1 invokes it (route + cron)
```ts
// src/app/api/cron/validate-mf-data/route.ts  (Agent 1 owns this file)
import { runValidateMfData, isAuthorizedCronRequest, consoleTaskLogger } from '@/contracts/server';
export const maxDuration = 300;            // seconds; the task stops itself at runTimeoutMs (≤ 280 s)
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const report = await runValidateMfData(
    { store: getMfDataStore() /* production MfDataStore */, logger: consoleTaskLogger },
    { trigger: 'schedule', signal: req.signal, killSwitch: process.env.MF_VALIDATION_DISABLED === 'true' },
  );
  return Response.json(report, { status: report.status === 'failed' ? 500 : 200 });
}
```
- Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. `CRON_SECRET` must be at least 32 characters, or the
  check fails closed. The secret is never logged.
- Suggested schedule: once a day after NAVs are published, for example `30 18 * * *` UTC (00:00 IST). AMCs publish
  NAVs in the evening, IST.
- Manual runs (admin) use `trigger: 'manual'` behind the admin's own authentication.

### Storage needed (proposal for Agent 1, owner approval needed if the service is paid)
`MfDataStore` (`src/lib/automation/tasks/storage.ts`) defines the semantics. `InMemoryMfDataStore` is for tests and
local runs only, because it loses everything on a cold start. The proposed relational schema:

```sql
create table nav_observation (
  scheme_code  integer not null,
  nav_date     date    not null,
  nav          numeric(18,6) not null check (nav > 0),
  accepted_at  timestamptz not null,
  run_id       text not null,
  primary key (scheme_code, nav_date)          -- idempotent accept; never UPDATE nav
);
create table nav_quarantine (
  scheme_code    integer not null,
  nav_date       date,
  nav            numeric(18,6),
  reason         text not null,                -- DataQualityFinding.kind
  message        text not null,
  run_id         text not null,
  quarantined_at timestamptz not null,
  reviewed_by    text, reviewed_at timestamptz, resolution text,   -- human review
  unique (scheme_code, nav_date, reason, nav)
);
create table automation_run (
  run_id text primary key, task text not null, status text not null,
  started_at timestamptz not null, finished_at timestamptz, report jsonb not null
);
create table automation_lock (name text primary key, owner text not null, expires_at timestamptz not null);
```
A Redis or KV store also works if it keeps the same semantics: `SET NX PX` for the lock, and a hash per scheme
written with `HSETNX` for observations. The NAV cache (`CacheStore`, `src/lib/data/cache.ts`) can share the same KV.
Its key is `nav:v1:{code}`, and the value is a `DatasetState<SchemeNavHistory>` with no expiry, because freshness is
derived from the stored provenance.
