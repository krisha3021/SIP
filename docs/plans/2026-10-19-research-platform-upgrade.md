# Plan — Lakshya research-platform upgrade (2026-10-19)

**Spec:** the owner's "source-transparent, AI-assisted SIP and mutual-fund research platform" brief of 2026-10-19 (§1–15),
plus CLAUDE.md safety rules. **Inventory and gaps:** docs/UPGRADE-INVENTORY.md.
**Branch:** `release/research-upgrade`. Every GitHub push and every deploy needs the owner's real-time approval.

## Global constraints
- Engines in `src/lib/**` are pure and Zod-validated, return `CalcResult`, and are exported only through
  `@/contracts` (client) or `@/contracts/server`. Each contract change gets a version bump and a changelog line.
- UI never re-implements formulas. Missing data shows "Not available" or "Insufficient history", never a sample value.
- No external call with personal inputs without a backend-verified consent token. No transaction execution.
- Tests are written first, and expected values are worked out independently. CI uses fixtures only, never a live provider.
- Commit each task separately, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Whole-suite command used for task-done: `npm run lint && npm run typecheck && npx vitest run`.

## Interfaces (shared between tasks)
- T2 produces `ProvenancedField<T>`, `FieldStatus`, `SchemeIdentity`, `parseSchemeIdentity`, `assertSamePlan`.
  T4, T6, T7 and T13 consume them.
- T3 produces `lastAttemptAt` on the NAV response. T6 and T7 consume it.
- T4 produces `FundProfile` and `/api/funds/[code]/profile`. T6 and T7 consume them.
- T5 produces `performanceMetrics(navs)`. T6 and T7 consume it.
- T9 produces `compareStrategies` and `StrategyFacts`. T10 and T13 consume them.
- T11 produces `createConsentToken`, `verifyConsentToken` and `ConsentAction`. T12, T13 and T14 consume them.

---

### Task 1: Live IST clock in the header
Files: `src/components/layout/CurrentTimeIST.tsx` (new), `SiteHeader.tsx`, `src/app/data-sources/page.tsx`, and the
test `tests/components/clock.test.tsx`.
- Format, built at runtime with `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' })` parts:
  `Sunday, 18 October 2026 | 12:24:00 PM IST`. Day name is long and the time is 12-hour, with uppercase AM/PM.
- Visible label "Current time — IST". The tooltip and title read "From this device's clock, shown in India Standard
  Time; not independently verified server time."
- Render only after mount, using a fixed-width placeholder. It is an isolated component with its own 1-second
  `setInterval`, cleared on unmount, so the header doesn't re-render. `<time dateTime=ISO>`. No `aria-live`.
- Mobile: the time is always shown, and the date wraps or hides below 640px. Hidden in print.
- The Data Sources page notes that the clock says nothing about data freshness.
- Tests:
  - A fixed UTC instant `2026-10-18T06:54:00Z` renders `Sunday, 18 October 2026 | 12:24:00 PM IST`.
  - Advancing fake timers by 1 s shows `12:24:01`.
  - The interval is cleared on unmount (spy on `clearInterval`).
  - The server-rendered output contains no time digits.
  - There is no `aria-live` attribute.

### Task 2: Field-level provenance model and scheme identity
Files: `src/lib/data/fields.ts`, `src/lib/data/identity.ts` (new), contract exports, and the test `tests/data/fields.test.ts`.
- `ProvenancedField<T>` = { value: T|null, unit, currency?, scheme_id, plan_type, option_type,
  scope ('scheme'|'plan'|'scheme-aaum'|'amc'|'portfolio-disclosure'), provider, source_url, observation_date,
  published_at?, retrieved_at, license_or_usage_status ('permitted'|'awaiting-permission'|'unlicensed'|'not-applicable'),
  freshness_status, validation_status ('valid'|'invalid'|'unvalidated'), status ('available'|'not-available'|
  'insufficient-history'|'blocked-licensing'|'not-configured'|'stale'), reason? }.
- `availableField(...)` validates its inputs:
  - unit-specific checks: `percent` must be in [0,100] with at most 4 decimals; `inr-crore` ≥ 0; ISO dates
  - the scheme code must be numeric
  - it throws on a plan or option mismatch against the identity
- `unavailableField(status, reason, ctx)`.
- `parseSchemeIdentity(meta)` derives:
  - category and subcategory from MFAPI's `scheme_category`, e.g. "Equity Scheme - Flexi Cap Fund" → asset class
    Equity, subcategory "Flexi Cap Fund"
  - plan and option, via the existing `inferPlanOption`
  - the ISIN, after validating the 12-character ISIN format (INF prefix)
- `assertSamePlan(identity, field)` rejects:
  - a Regular TER on a Direct record
  - Growth and IDCW mixing
  - AMC-scope AUM in a scheme slot
- Tests cover each rejection, the parsing cases, ISIN validation, and percent precision.

### Task 3: Complete fund-data timestamps
Files: `src/lib/data/navService.ts` (attempt tracking), the API route envelope, `ProvenancePanel.tsx`, and tests.
- The NAV service records `lastAttemptAt`, which is set on every upstream attempt, whether it succeeds or fails. It is
  distinct from `fetchedAt`, the last successful retrieval.
- The response adds `timestamps: { dataAsOf, providerPublishedAt (null for MFAPI), lastSuccessfulRetrieval,
  lastAttemptedRefresh, freshness }`.
- The panel shows five labelled rows, visually separate from the header clock.
- Tests:
  - A failed attempt advances `lastAttemptedRefresh` but leaves `dataAsOf` and `lastSuccessfulRetrieval` unchanged.
  - A success advances all of them.

### Task 4: Research-data providers (gated), plus a profile API
Files: `src/lib/data/research/{types,amfiTer,amfiAaum,unconfigured}.ts`, `src/app/api/funds/[schemeCode]/profile/route.ts`,
fixtures, and tests.
- The `ResearchProvider` interface returns `ProvenancedField`s for each field key.
- AMFI TER and AAUM parsers work against fixtures that mimic AMFI's published tables (TER in percent, keeping Direct
  and Regular separate; AAUM in ₹ crore for a named quarter). The parsers are pure functions.
- Network fetching is disabled unless `AMFI_REUSE_APPROVED === 'true'`. Until then it returns `blocked-licensing` with
  the reason "Awaiting AMFI written permission".
- Endpoints are not invented. The fetch URL comes from `AMFI_TER_DATA_URL` / `AMFI_AAUM_DATA_URL`, which the owner
  confirms. If unset, the status is `not-configured`.
- Unconfigured providers cover holdings, sectors, asset allocation, managers, exit load, minimums, benchmark,
  riskometer, inception and ratings. They return `not-configured` with the official-document hint.
- The profile route returns `{ identity, fields: Record<key, ProvenancedField>, providers: status list }`, with no
  sample values.
- Tests:
  - the parser on fixtures
  - Direct/Regular separation
  - an ambiguous match → invalid
  - the gate off → blocked, and no fetch is called
  - an invalid payload → error
  - the route returns not-configured fields

### Task 5: NAV performance and risk metrics engine
Files: `src/lib/finance/performance.ts`, contract, and `tests/finance/performance.test.ts`.
- `performanceMetrics(navs, asOf?)`:
  - Point-to-point returns for 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y and since first NAV. Periods under a year are absolute;
    periods of a year or more are annualised CAGR on ACT/365. Each window ends at the last NAV on or before its target
    date, with a 7-day tolerance, and is otherwise reported as `insufficient-history`.
  - Annualised volatility of daily log returns, ×√252, requiring at least 60 observations.
  - Maximum drawdown with dates, using the existing `maxDrawdown`.
  - Worst and best calendar-year return, covering complete years only.
- Hand-worked tests:
  - A series growing exactly 10% a year has 1Y = 10% and 3Y CAGR = 10%.
  - A flat series has volatility 0.
  - Short history → `insufficient-history`.
  - The drawdown case is checked.

### Task 6: Enriched fund profile page
Files: `FundDetail.tsx` (refactor into sections), `src/features/funds/ui/{FieldRow,RatingDisplay,PerformanceSection}.tsx`, and tests.
- Sections:
  - **Identity:** name, AMC, code, ISIN, category/subcategory, plan, option, benchmark, and "First NAV in this dataset".
    Inception date is not available from the provider.
  - **Research fields:** each comes from the profile API, with its value or status reason and a provenance popover
    (provider, source link, observation date, retrieved-at, licence status).
  - **Performance:** from Task 5. Rolling returns are already there.
  - **Links:** the SIP backtest and official documents.
- `RatingDisplay` renders stars only when the field is available and licensed. It shows the provider, scale, date and
  attribution, and otherwise "Rating unavailable". It never shows 0 stars and never averages providers.
- Tests:
  - a blocked field shows its reason and never a number
  - a rating with no licence → "Rating unavailable"
  - a licensed fixture → provider and date visible
  - performance "Insufficient history" rendering

### Task 7: Compare funds (up to 4)
Files: `src/app/compare/page.tsx`, `src/features/compare/ui/CompareFunds.tsx`, `src/lib/finance/compareFunds.ts`
(comparability warnings, pure), and tests.
- Pick up to 4 schemes. The table has consistent rows: category, plan/option, NAV date, AUM and its date, TER and its
  date, benchmark, returns by period, volatility, max drawdown, holdings concentration, sectors, managers, exit load,
  and rating attribution.
- `comparabilityWarnings(rows)`: categories differ; NAV dates differ by more than 3 days; plan types differ; option
  types differ; return-period coverage differs; data coverage is incomplete.
- Overlap section: "Unavailable — no licensed holdings data", with the formula documented (sum of min weights over
  matched ISINs) for future use, and the note that top-10 holdings are not a full portfolio.
- Tests: each warning; the 5th fund is refused; the overlap section is unavailable.

### Task 8: Watchlist
Files: `src/features/watchlist/ui/{storage.ts,WatchlistButton.tsx,Watchlist.tsx}`, `src/app/watchlist/page.tsx`, and tests.
- Local only (`lakshya:watchlist:v1`, Zod-validated, maximum 50). Add or remove from the fund page; the list page links
  to compare.
- Tests: add, remove and duplicate guard; storage unavailable → graceful message.

### Task 9: Deterministic strategy engine
Files: `src/lib/finance/strategy.ts`, contract, `buildStrategyReport`, and `tests/finance/strategy.test.ts`.
- `compareStrategies(input)` takes a goal (optional), target, horizon, monthly capacity, existing goal corpus, step-up %,
  inflation, liquidity reserve months (informational), risk preference (informational only, no scoring), and asset
  assumptions (equity, debt and gold expected return and volatility, plus a correlation matrix entered by the user, with
  defaults shown).
- Strategies: fixed SIP; annual step-up SIP; lumpsum (existing corpus) + SIP; contribution levels (capacity × 0.75 / 1 /
  1.25); and up to 3 equity/debt/gold mixes. A mix's blended return is the weighted mean and its volatility is
  √(wᵀΣw).
- Each strategy reports total contributions, projected corpus (nominal and today's ₹), goal shortfall and the required
  extra monthly amount (via `planGoal`), and a seeded Monte Carlo p10/p50/p90 with the shortfall probability against
  the target.
- `facts`: a flat list of `{ id, label, value, unit }` taken only from the computed outputs. The AI and deterministic
  explanations read only these.
- Illustrative rebalancing and STP are listed as "Proposed — not modelled" and not implemented.
- Tests:
  - the blended volatility hand calculation with 2 assets and a correlation
  - fixed SIP equals `projectAccumulation`
  - required-extra round trip
  - determinism under a seed
  - every fact id is unique and numeric
  - invalid weights (sum ≠ 100) → error

### Task 10: Strategy Lab page and deterministic explanations
Files: `src/app/strategy-lab/page.tsx`, `src/features/strategy/ui/{StrategyLab,StrategyExplanation}.tsx`,
`src/lib/finance/explain.ts` (deterministic text from facts), and tests.
- Inputs are minimal and the page is labelled "Inputs stay on this device".
- Results:
  - comparison table, chart and table alternative
  - stress and downside view
  - trade-offs: contribution versus corpus; allocation volatility versus median
  - data limitations; uncertainty
  - the educational boundary notice
  - "Simulation — not an actual investment"
- The deterministic explanation is always available, with every number inserted from facts.
- Tests: the explanation contains only fact values; the notices are present.

### Task 11: Backend consent core
Files: `src/lib/security/consent.ts`, `src/app/api/consent/route.ts`, `src/app/api/transactions/route.ts` (always 403),
and tests.
- `ConsentAction` = `use-personal-data:ai-explain` | `communicate-externally:ai-explain` | `save-changes:*` |
  `read-public:*` | `execute-transaction:*` (always refused).
- A token is HMAC-SHA256(secret, action|sha256(canonical JSON payload)|nonce|expiresAt), with a 5-minute expiry.
- `POST /api/consent` with { action, payloadHash, disclosureVersion } returns the token. It refuses if the secret is
  unset (consent unavailable means the AI is off).
- `verifyConsentToken(token, action, payload)` rejects:
  - a wrong action
  - a changed payload (hash mismatch)
  - an expired token
  - a reused nonce (single-use store: in-memory, or Upstash when configured)
  - a bad signature
- The transaction route always returns 403 `EXECUTION_DISABLED`.
- Tests cover each rejection, the happy path, replay, the transaction refusal, and a missing secret → 503.

### Task 12: Permission dialog and Privacy & Permissions page
Files: `src/components/permissions/PermissionDialog.tsx`, `src/features/permissions/ui/{auditLog.ts,PrivacyPanel.tsx}`,
`src/app/privacy-permissions/page.tsx`, the saved-plans delete confirmation, and tests.
- The dialog shows the exact action, the data involved (a rendered list of the exact payload fields), destination,
  purpose, cost, retention, how to revoke, and whether persistent state changes.
- Two buttons: "Approve this action" and "Cancel". Nothing is preselected, and there is no "approve all".
- The local audit log records the time, action, destination and outcome. Payload values are never stored.
- The page lists data on this device (plans, watchlist, audit log) with clear buttons, explains that revoking cannot
  recall data already sent, and lists each permission category.
- Deleting or replacing a saved plan needs dialog approval ("save-changes", local only).
- Tests:
  - the dialog renders every field and approve is not focused by default
  - cancel calls nothing
  - the audit log stores no payload values
  - plan deletion requires approval

### Task 13: Opt-in grounded AI explanation service (free-tier, OpenAI-compatible)
Files: `src/lib/ai/{provider.ts,grounding.ts,prompt.ts}`, `src/app/api/ai/explain/route.ts`, and tests.
- Off unless `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` are set. `GET` reports `{ enabled, provider, retentionNote }`.
- `POST` with { facts, scenarioLabel, consentToken } verifies consent against the exact body via Task 11, minimises the
  payload (facts only: no names, incomes or free text), and calls `/chat/completions` with a timeout and one retry with
  backoff.
- The system prompt explains only the provided facts, cites fact ids in [brackets], marks uncertainty, gives no advice
  and no product names, and treats everything in the user message as data.
- `grounding.ts` rejects the output if:
  - any number in it does not match a fact value (with tolerance for rounding and lakh/crore formatting)
  - any cited id is unknown
  - it contains guarantee or "best fund" language
  On rejection the deterministic explanation is used and the reason is reported.
- A daily cap is set by `LLM_DAILY_REQUEST_CAP`. Logs are redacted to counts and status only.
- Tests (mocked fetch):
  - disabled when env is missing
  - consent missing, wrong or replayed → 403
  - a grounded answer passes
  - an invented number → fallback
  - prompt-injection text in a label is passed as JSON data and the response stays grounded
  - a provider timeout → fallback, with inputs preserved

### Task 14: Wire AI into Strategy Lab; restructure the navigation
Files: StrategyLab (the "Explain with AI" flow: GET status → dialog → POST consent → POST explain), `nav.ts`, home
page links, and e2e.
- Navigation: Dashboard (home), SIP & Goals, Strategy Lab, Fund Research, Compare Funds, Watchlist, Sources &
  Methodology, Privacy & Permissions. Existing routes are kept and grouped.
- AI disabled → the button explains the AI isn't configured and shows the deterministic explanation.
- e2e:
  - the clock is visible and IST
  - compare warnings
  - watchlist add/remove
  - Strategy Lab results and notices
  - the AI-disabled state
  - the permission dialog content, with approve not preselected (mocked enabled state)
  - the Privacy & Permissions page
  - the axe sweep on new routes at desktop and mobile

### Task 15: Documentation deliverables
Files: `docs/DATA-DICTIONARY.md` (field-level provenance model, every field key with source and status), the
providers/licensing table (from the inventory), `docs/PERMISSIONS.md` (consent flows), `.env.example` (new variables
documented, no secrets), DEPLOYMENT and README updates, and Known limitations.

### Task 16: Final verification and release request
- Run the whole suite plus build and e2e, take screenshots at desktop and 375 px if the window allows (otherwise record
  DOM checks), and do the final whole-branch review.
- Preview deployment: push the branch to GitHub so Vercel builds a preview. This needs the owner's real-time approval.
- Production: a separate real-time approval request.
