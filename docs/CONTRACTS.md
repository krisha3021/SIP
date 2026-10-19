# Shared Contract — Agent 1 (Website) ⇄ Agent 2 (Finance & Data)

Contract version: **0.5.0** (additive, 2026-10-19; baseline 0.1.0 from Phase 1). The code lives in
`src/contracts/index.ts` (safe for client and server) and `src/contracts/server.ts` (server-only: data services and
automation; never import it from a client component).

The UI, API routes, charts, and exports must import financial engines and types **only** from
`@/contracts`. Presentation code never re-implements a formula. This includes "simple" values such as gains or
real value: render the fields the engine returns.

## Rules
1. Every engine returns `CalcResult<T>`: `{ ok: true, value, warnings }` or `{ ok: false, error: { code, message, field? } }`.
   The UI must render `warnings`, and must show the error state for `ok: false`. It must never substitute a number.
2. Conventions are explicit inputs. `timing: 'begin' | 'end'` (default `'end'`) and
   `rateConvention: 'nominal' | 'effective'` (default `'effective'`). The UI must display the chosen convention next to
   results, and exports must include it.
3. Percentages are passed as **percent numbers**: `12` means 12%. Engine outputs whose names end in `Pct` are also percent
   numbers. `xirr().rate` and `navMaxDrawdown`-style decimal fields are documented in their JSDoc.
4. Dates are ISO `YYYY-MM-DD` strings handled in UTC. Timestamps are ISO-8601 with a `Z` suffix.
5. Data shown from a provider must carry a `Provenance` record. Freshness comes from `navFreshness()`, never from the
   time a page loaded.
6. Classification labels shown to users map to these display labels:
   `observed` → "Historical data" or "Latest available NAV", `synthetic` → "Synthetic simulation",
   `cached` → "Cached — last updated …", and a projection is labelled "Projection (assumption-based)".
7. Exports are built from `Report`. Agent 2 owns the payload content. Agent 1 owns the visual templates and file delivery.
   All user text goes through `sanitiseCell` (already applied inside `reportToCsv` and `reportToXlsx`).
8. `AutomationRunReport` is the source of truth for the admin dashboard. `aiSummary` is optional and derived.

## Change process
- Propose a change in a PR that touches `src/contracts/` and this file, and bump `CONTRACT_VERSION`.
  - Patch: docs only.
  - Minor: additive.
  - Major: breaking.
- The other agent reviews the PR. Breaking changes need consumers updated in the same PR, or a deprecation period.
- Dependency additions and changes to the database schema are proposed by Agent 2 and applied by Agent 1, because
  Agent 1 owns the manifests and migrations.

## Changelog
### 0.5.0 — 2026-10-19 (research-platform upgrade, additive; branch `release/research-upgrade`)
- `@/contracts`: `ProvenancedField` and its builders `availableField` / `unavailableField`, plus the `assertSamePlan` guard (scheme, plan, option, scope), and the `SchemeIdentity` type.
- `@/contracts/server`: `parseSchemeIdentity` and `isValidIsin`.
- `@/contracts`: `datasetTimestamps` / `DatasetTimestamps` (data as of, provider publication, last success, last attempt, freshness). The NAV envelope gains `timestamps`.
- Research data: `RESEARCH_FIELD_KEYS`, `ResearchFieldKey`, `ProviderStatus` and `FundProfile` in `@/contracts`; `buildFundProfile` and the AMFI TER/AAUM adapter (gated off by `AMFI_REUSE_APPROVED` and owner-confirmed `AMFI_*_DATA_URL`s) in `@/contracts/server`. New route: `GET /api/funds/[code]/profile`.
- `performanceMetrics(navs, asOf?)` in `@/contracts`: point-to-point returns (absolute under 1 year, ACT/365 CAGR from 1 year), volatility of daily log returns × √252 (≥ 60 returns), NAV max drawdown with dates, and complete calendar years.
- `comparabilityWarnings(rows)` (2–4 funds: category, NAV date, plan, option, return periods, coverage) and `holdingsOverlap(a, b)` (Σ min weight over common ISINs; unavailable without data or with disclosures more than 31 days apart; partial below 95% coverage), plus `MAX_COMPARE`. New page: `/compare`.
- Strategy Lab: `compareStrategies`, `blendedAssumptions` (Σ wᵢEᵢ; √(wᵀΣw)), the defaults (assumptions, editable), `StrategyResult` and its `facts` (the only numbers explanations may use), and `buildStrategyReport` with `STRATEGY_NOTICE`. The outcome type is exported as `StrategyLabOutcome` to avoid clashing with the booster's `StrategyOutcome`.
- `explainStrategies`, `formatFact` and `EXPLANATION_NOTICE` (a deterministic explanation built only from facts), plus `checkGrounding` / `extractNumberTokens` (every ₹ or % figure must match a fact; citations must exist; guarantee and product-pick wording is rejected). New page: `/strategy-lab`.
- `assertSamePlan` checks plan and option only for plan-scoped fields. Scheme-wide fields (`scheme`, `scheme-aaum`, `portfolio-disclosure`) may carry `Unknown` plan/option.

### 0.4.0 — 2026-10-17 (Agent 2, additive; branch `agent-2/capital-gains`)
- Adds a capital-gains estimate for mutual-fund redemptions to `@/contracts`. It is separate from income tax.
  - `estimateCapitalGains(input)` and `capitalGainsInputSchema`.
    - Per-lot FIFO slices, each with its holding period, term and treatment.
    - Treatments: s.111A, s.112A, s.50AA at slab, other STCG at slab, and s.112.
    - Net gain, taxable amount, rate and tax per treatment.
    - The s.112A exemption used, cess, and total tax.
    - Every rule applied, each with its source URL and verification date.
    - The list of exclusions.
  - `CAPITAL_GAINS_NOTICE`. **The UI must display it** with every result.
  - Fund-type selector content: `FUND_TYPES` and `FUND_TYPE_EXPLANATIONS`.
  - The allowed marginal rates: `SLAB_RATES_PCT`.
  - Rule configuration: `CAPITAL_GAINS_YEARS` and `SUPPORTED_CAPITAL_GAINS_YEARS`.
  - Report payload: `buildCapitalGainsReport(input, result, ctx)`.
  - Error handling:
    - FY 2026-27 returns `UNVERIFIED_RULES`.
    - Other financial years return `UNSUPPORTED`.
    - Exchange-listed non-equity units return `UNVERIFIED_RULES`.
    - Equity units bought before 1 Feb 2018 without the 31-Jan-2018 NAV return `INVALID_INPUT`.
    - A slab-taxed gain without a slab rate returns `INVALID_INPUT` (field `marginalSlabRatePct`).
- `IncomeTaxComparison.config` gains `cessRate` (decimal, e.g. `0.04`). This resolves Agent 1's request.
- Months↔years mapping: resolved, see Open items.

### 0.3.0 — 2026-10-17 (Agent 2, additive; branch `agent-2/life-stage-planner`)
- Adds the Life-stage & Risk Planner to `@/contracts`:
  - `planLifeStageRisk(input, config?)` and `lifeStageInputSchema`. The planner returns separate capacity and
    tolerance scores with per-factor points, the profile (the lower of the two scores), prerequisite flags,
    asset-class min–max ranges, a year-by-year glide path, and an optional PFRDA reference curve.
  - `LIFE_STAGE_NOTICE`. **The UI must display it** with every result.
  - `LIFE_STAGE_CONFIG`, `lifeStageConfigSchema` and the `LifeStageConfig` type. This is the single editable table
    of weights, thresholds and ranges; an edited copy is validated before use.
  - `PFRDA_AUTO_CHOICE_REFERENCE`, quoted from pfrda.org.in and verified on 2026-10-17.
  - `stressTestRange(range, { equity, debt?, gold? }, { window?, amount? })`. It works only on `NavPoint[]` series
    that the caller supplies, and contains no built-in crash figures.
  - `buildLifeStageReport(input, result, ctx)` and `deriveRange`.
  - Types: `AssetRange`, `PctRange`, `FactorScore`, `ScoreBreakdown`, `PrerequisiteFlag`, `GlidePathRow`, `ProfileId`,
    `StressTestResult`, and the enums `INCOME_STABILITY`, `EXPERIENCE`, `LOSS_REACTION`, `PROFILE_IDS`,
    `PROFILE_LABELS`.
- Nothing existing changed.

### 0.2.1 — 2026-10-17 (Agent 1, owner-approved; re-exports only, no logic change)
- `@/contracts` re-exports `reportToCsv` and `reportToXlsx`, so exports import only from the contract.
- `@/contracts/server` starts with `import 'server-only'` (package `server-only@0.0.1` added), so importing it from a
  client component fails the build.
- `@/contracts/server` re-exports `searchSchemes`, `searchQuerySchema`, `schemeCodeSchema` and `PROVIDER_NAME` from the
  MFAPI adapter, so API routes no longer import `@/lib/data/*` directly.
- `@/contracts` also re-exports `checkBacktestEligibility`, `backtestScheme`, `rollingReturnsForScheme` (and the
  `SchemeMeta` / `SchemeNavHistory` types). `eligibility.ts` imports the adapter for types only, so this pulls no
  server code into the browser; the historical screens use them on the history returned by `/api/funds/[code]/nav`.
- Still open for Agent 2: expose `cessRate` on `IncomeTaxComparison.config`; confirm the UI's whole-years →
  `months = years × 12` input mapping (or add a `years` input).

### 0.2.0 — 2026-10-17 (Agent 2, additive; branch `agent-2/finance-data`)
- `CalcErrorCode` gains `'CANCELLED'`. `AutomationRunStatus` gains `'skipped-disabled'` (the kill switch was on).
  Consumers that `switch` exhaustively on these unions need one new case each.
- New engines in `@/contracts`: `planCashFlow`, `compareScenarios` (max 3, `MAX_SCENARIOS`), `planRetirement`,
  `exploreAllocation` (with `ALLOCATION_NOTICE`, which the UI must display with every result), and
  `runMonteCarloChunked` / `createMonteCarloSession` (the Web Worker hook: `onProgress`, `AbortSignal`, injectable
  yield; results are identical to `runMonteCarlo`).
- Report builders in `@/contracts`: `build{Accumulation,Goal,Swp,MonteCarlo,NavBacktest,Rolling,Booster,IncomeTax,
  CashFlow,Scenario,Retirement,Allocation}Report(…, { generatedAt, warnings })`. `Report` gains an optional
  `warnings: string[]`, rendered by `reportToCsv` and `reportToXlsx`. Exports must use these builders and never
  recalculate.
- New entry point `@/contracts/server`: `createNavService` (cache → de-duplication → last-known-good, with
  `NavServiceResult.source`, `.error: DataError` and `.freshness`), `InMemoryCacheStore` / the `CacheStore`
  interface, `RequestDeduper`, `DataError` and `DATA_ERROR_HTTP_STATUS` (suggested HTTP mapping),
  `backtestScheme` / `rollingReturnsForScheme` / `checkBacktestEligibility` (IDCW and unknown options →
  `UNSUPPORTED`), `runValidateMfData`, `MfDataStore` / `InMemoryMfDataStore`, `isAuthorizedCronRequest`,
  `consoleTaskLogger`, and `AiSummarizer` (interface only).
- Behaviour fixes inside existing engines. Signatures are unchanged.
  - `inferPlanOption` no longer reads option words that are part of a fund's own name, such as "Growth Fund" or
    "Dividend Yield". Bonus options are now reported as `Unknown`.
  - SWP `realWithdrawal` for `withdraw-then-grow` now deflates at the payment time (m − 1).
  - `planGoal.projectedWithCurrent` no longer includes a 1-paisa internal stand-in.
  - `rollingReturns` now passes through data-cleaning warnings.
  - `projectAccumulation` now warns when a step-up cap is below the starting amount.
  - The MFAPI adapter accepts `signal` and adds the `UpstreamError` kind `'cancelled'`; a cancelled request is
    never retried.

## Open items for agreement
- [x] Cash-flow planner engine. Done in 0.2.0 (`planCashFlow`).
- [x] Scenario-comparison payload covering up to 3 scenarios. Done in 0.2.0 (`compareScenarios`).
- [x] Monte Carlo progress and cancellation hooks. Done in 0.2.0. **Agent 1** hosts the Web Worker: call
      `runMonteCarloChunked(input, { onProgress: (d, t) => postMessage(...), signal })` and abort the controller on a
      cancel message.
- [ ] Capital-gains estimation module. Agent 2 owns it; it is separate from income tax. Not started.
- [x] Storage interface for last-known-good NAVs and run history. Proposed: `CacheStore`, `MfDataStore`, and the SQL
      schema in docs/DATA-SOURCES.md §Storage. **Agent 1** provisions the store (owner approval needed if it is paid).
- [ ] API route response envelopes for `/api/funds/*`. Agent 1 owns the routes. Proposal: return
      `NavServiceResult` (state + source + error + freshness) as-is, mapping `error.code` through
      `DATA_ERROR_HTTP_STATUS` only when there is no data at all.
      Agent 1's current envelopes (Phase 2) are typed in `src/features/funds/ui/api.ts`:
      `{ ok: true, meta, navs?, provenance, freshness, lastError, servedFrom, droppedRows }` or `{ ok: false, error: { code, message } }`.
      To agree: reconcile these with `NavServiceResult` during integration.
- [ ] Cron route for `validate-mf-data` (Agent 1). See docs/DATA-SOURCES.md §"How Agent 1 invokes it".
- [ ] Dependency proposal (Agent 1 to decide): add `server-only` so that importing `@/contracts/server` from a
      client component fails the build.

### Requests from Agent 1 (raised 2026-10-17, Phase 2, against 0.1.0)
Status notes in *italics* were added when the branches were merged (2026-10-17). They record what 0.2.0 already provides.
- [ ] **Export `reportToCsv` and `reportToXlsx` from `@/contracts`** (minor, additive). Rule 7 names them, but only the
      `Report` type is exported. Interim: `src/components/calculator/ActionButtons.tsx` lazy-imports them from
      `@/lib/export/report`. Switch to `@/contracts` once exported.
      *Still open in 0.2.0: `reportToCsv` and `reportToXlsx` are not exported from `@/contracts`.*
- [ ] **Export the MFAPI adapter surface server-side** (`fetchNavHistory`, `searchSchemes`, `schemeCodeSchema`,
      `searchQuerySchema`, `UpstreamError`, `PROVIDER_NAME`, `SchemeMeta`) — perhaps from a server-only
      `@/contracts/server` entry so client bundles never include it. Interim: only `src/app/api/_lib/navService.ts` and
      `src/app/api/funds/search/route.ts` import `@/lib/data/mfapi`.
      *0.2.0 adds `@/contracts/server` with `createNavService` (cache, dedupe, last-known-good) and the `SchemeMeta`
      type. The raw adapter functions are not exported. Integration: replace `src/app/api/_lib/navService.ts` with
      `createNavService` rather than keep two implementations.*
- [ ] **Report builders per calculator** (Agent 2 owns payload content). Interim: `src/features/calculators/ui/reports.ts`
      maps engine output fields one-to-one into `Report` (no arithmetic). Replace with Agent 2 builders when available.
      *Provided in 0.2.0: `build*Report` builders for all 12 calculators are exported from `@/contracts`.*
- [ ] **Monte Carlo worker hooks.** The worker hosts `runMonteCarlo` unchanged; cancellation is by terminating the worker.
      Progress callbacks would let the UI show a progress bar for 10,000-path runs.
      *Provided in 0.2.0: `runMonteCarloChunked` / `createMonteCarloSession` with `onProgress` and `signal`.*
- [x] **Tax: expose `cessRate` on `IncomeTaxComparison.config`**, so the UI can label the cess line with the configured
      rate instead of a generic "Health & education cess".
      *Done in 0.4.0: `result.config.cessRate` (decimal; FY 2025-26 = 0.04).*
- [x] **Months↔years in UI.** Calculators take whole years and pass `months = years × 12` to the engines (input unit
      mapping only). If Agent 2 prefers a `years` input on engines, say so.
      *Resolved (Agent 2, 0.4.0): `months = years × 12` is acceptable and exact. Every engine counts whole months, applies
      step-ups and withdrawal increases at months 13, 25, …, and deflates by `months / 12` years, so whole years map
      to whole months with no rounding. Keep the engines month-based so that a later "years and months" input needs no
      contract change. No `years` input will be added. Only Monte Carlo (`years`) and retirement (ages) take years
      natively.*
