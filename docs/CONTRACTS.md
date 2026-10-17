# Shared Contract — Agent 1 (Website) ⇄ Agent 2 (Finance & Data)

Contract version: **0.1.0**, the baseline from Phase 1, dated 2026-10-17. The code lives in
`src/contracts/index.ts`.

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

## Open items for agreement
- [ ] Cash-flow planner engine (`src/lib/finance/cashflow.ts`). Agent 2 to add it, with a contract export.
- [ ] Scenario-comparison payload covering up to 3 scenarios. Agent 2 to propose a shape.
- [ ] Monte Carlo progress and cancellation hooks for Web Worker use. Agent 2 to propose them. Agent 1 to host the worker.
- [ ] Capital-gains estimation module. Agent 2 owns it; it is separate from income tax.
- [ ] Storage interface for last-known-good NAVs and run history. Agent 2 proposes the schema; Agent 1 provisions storage
      (needs owner approval if the service is paid).
- [ ] API route response envelopes for `/api/funds/*`. Agent 1 owns the routes, Agent 2 owns the adapter output types.
      Agent 1's current envelopes (Phase 2) are typed in `src/features/funds/ui/api.ts`:
      `{ ok: true, meta, navs?, provenance, freshness, lastError, servedFrom, droppedRows }` or `{ ok: false, error: { code, message } }`.

### Requests from Agent 1 (raised 2026-10-17, Phase 2) — not applied; `src/contracts/` is unchanged
- [ ] **Export `reportToCsv` and `reportToXlsx` from `@/contracts`** (minor, additive). Rule 7 names them, but only the
      `Report` type is exported. Interim: `src/components/calculator/ActionButtons.tsx` lazy-imports them from
      `@/lib/export/report`. Switch to `@/contracts` once exported.
- [ ] **Export the MFAPI adapter surface server-side** (`fetchNavHistory`, `searchSchemes`, `schemeCodeSchema`,
      `searchQuerySchema`, `UpstreamError`, `PROVIDER_NAME`, `SchemeMeta`) — perhaps from a server-only
      `@/contracts/server` entry so client bundles never include it. Interim: only `src/app/api/_lib/navService.ts` and
      `src/app/api/funds/search/route.ts` import `@/lib/data/mfapi`.
- [ ] **Report builders per calculator** (Agent 2 owns payload content). Interim: `src/features/calculators/ui/reports.ts`
      maps engine output fields one-to-one into `Report` (no arithmetic). Replace with Agent 2 builders when available.
- [ ] **Monte Carlo worker hooks.** The worker hosts `runMonteCarlo` unchanged; cancellation is by terminating the worker.
      Progress callbacks would let the UI show a progress bar for 10,000-path runs.
- [ ] **Tax: expose `cessRate` on `IncomeTaxComparison.config`**, so the UI can label the cess line with the configured
      rate instead of a generic "Health & education cess".
- [ ] **Months↔years in UI.** Calculators take whole years and pass `months = years × 12` to the engines (input unit
      mapping only). If Agent 2 prefers a `years` input on engines, say so.
