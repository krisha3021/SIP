# Research-Platform Upgrade — Verified Inventory & Gap Analysis

Inspected 2026-10-19 on branch `release/research-upgrade`. It is `main` @ ad0a353 plus the merged, unpushed agent work:
capital gains, FY 2026-27 tax preparation, MFAPI/AMFI terms, scheme proposal, polish, legal drafts and the storage adapter.
Baseline checks on that branch: lint ✓, typecheck ✓, 350/350 unit tests ✓, build ✓, e2e 121 passed / 1 skipped
(desktop-only skip-link test).

## Actual stack (from the code, not the URL)
- **Framework:** Next.js 16.4.1 (App Router, Turbopack) with React 19.3, TypeScript 5.9 strict, Tailwind v4, Recharts 3,
  Zod 4, ExcelJS, Vitest 4, Playwright, and `server-only`.
- **Rendering:** server components for pages. Client components for calculators, charts and fund screens.
- **Workers:** Monte Carlo runs in a Web Worker (`mc.worker.ts`).
- **Data:**
  - A server-side MFAPI adapter (`src/lib/data/mfapi.ts`) with a NAV service providing cache, request dedupe and
    last-known-good (`navService.ts`), plus provenance and freshness (`provenance.ts`).
  - API routes: `/api/funds/search`, `/api/funds/[code]`, `/api/funds/[code]/nav`, `/api/market-status`,
    `/api/health` and `/api/cron/validate-mf-data`.
- **Persistence:** browser `localStorage` only, through `features/plans/ui/storage.ts`. An Upstash Redis adapter
  (`src/app/api/_lib/storage`) switches on only when its environment variables exist, which they currently don't.
- **Deployment:** Vercel (native GitHub integration). Production is https://sip-three-zeta.vercel.app. A daily cron is
  set in `vercel.json` and needs `CRON_SECRET`.

## Feature matrix

| Feature | Existing implementation (verified) | Verified gap | Proposed change | Dependencies |
|---|---|---|---|---|
| SIP calculator | `/calculators/sip` uses the `projectAccumulation` engine. It offers begin/end timing and nominal/effective rates. The live value was checked against the closed form on 2026-10-17. | None functional | Keep | — |
| Goal planner | `/calculators/goal-planner` uses `planGoal`, with forward/reverse round-trip tests | None functional | Reuse inside Strategy Lab | — |
| Uncertainty simulator | `/calculators/monte-carlo`: seeded lognormal model, Web Worker, progress and cancel, user-defined goal | None functional | Reuse its p10 result as the downside view in Strategy Lab | — |
| Fund search & NAV history | `/funds` and `/funds/[code]`: MFAPI search, NAV chart, provenance panel, rolling returns, and "Not available" for AUM, TER, holdings, ratings and manager | No field-level provenance. Identity fields such as category and subcategory aren't parsed. No point-to-point returns or risk metrics. No "last attempted refresh" timestamp. | Field-level provenance model, an enriched profile, a performance engine and the full timestamp set | AMFI written permission for TER and AAUM |
| SIP backtesting | `/historical` uses `backtestScheme`. It applies the next-available-NAV rule, guards against inception and refuses IDCW. | None functional | Link to it from the fund profile | — |
| Methodology | `/methodology`, `docs/CALCULATION-METHODOLOGY.md` §1–17 | No Strategy Lab, consent or AI sections | Add those sections | — |
| Saved plans | `/saved`. Local only, with `savePlan`/`deletePlan`. | Deleting doesn't ask for confirmation, and nothing records changes | A confirm dialog plus a local audit log | — |
| Header clock | None. The owner asked for one on 2026-10-17, but it was not built. | Missing | `CurrentTimeIST` component | — |
| Fund comparison | None | Missing | `/compare`, up to 4 funds, with comparability warnings | Holdings data for overlap |
| Watchlist | None | Missing | `localStorage` watchlist and a `/watchlist` page | — |
| Strategy Lab | Scenario Lab compares 3 accumulation scenarios | No allocation mixes, lumpsum + SIP template, downside layer or explanation layer | `compareStrategies` engine and a `/strategy-lab` page | — |
| AI explanations | None | Missing | An OpenAI-compatible adapter (free tier), opt-in and grounded, with a deterministic fallback | LLM API key (owner) |
| Permissions | None. The site sends nothing personal off-device today. | Missing | HMAC consent tokens bound to action and payload, a dialog, and a Privacy & Permissions page | `CONSENT_SIGNING_SECRET` (owner) |
| Ratings | Shown as "Not available" | No licence | Attributed rating component, hard-gated by a licence flag. It shows "Rating unavailable" when the gate is off. | Rating-provider licence |
| Transactions | None | Must stay off | A permanently disabled endpoint plus a test that it refuses | Regulatory prerequisites |

## Data-provider and licensing dependency table

| Field(s) | Proper source | Status 2026-10-19 | What the app does |
|---|---|---|---|
| NAV history and latest NAV | AMFI, via MFAPI (third-party mirror) | **Live, but licence unclear.** AMFI's terms (read 2026-10-17 and re-verified 2026-10-19) allow "personal and non-commercial use only" and forbid public display without written agreement. | Shown with provenance. **Owner decision:** obtain AMFI's written permission (draft in `docs/owner-actions/amfi-permission-request.md`) or take the pages down. |
| TER (Direct/Regular) | AMFI "TER of MF Schemes"; AMC disclosures | **Blocked** until AMFI gives written permission | Adapter built and gated off by `AMFI_REUSE_APPROVED`. The UI shows "Not available — awaiting data permission". |
| Scheme AUM (quarterly average) | AMFI AAUM disclosure; AMC disclosures | **Blocked**, same reason | Adapter built and gated off, with scope `scheme-aaum` |
| Holdings, sector and asset allocation, disclosure date | AMC monthly portfolio files; a licensed aggregator | **Blocked.** No unified official feed exists, and no licensed provider is configured. | `HoldingsProvider` interface, disabled, plus an official-documents link |
| Fund managers and tenure; exit load; minimum investment; benchmark; riskometer; inception date | SID, KIM and factsheets; a licensed aggregator | **Blocked**, no provider | Provider interface, disabled. Each field shows "Not available". |
| Third-party star ratings | Value Research or Morningstar, under licence | **Blocked.** These are proprietary ratings, and no licence is held. | Component that requires `RATINGS_PROVIDER` plus `RATINGS_DISPLAY_LICENSED=true`. It never averages providers and never shows zero stars. |
| AI explanations | Any OpenAI-compatible endpoint (e.g. Groq; Gemini's OpenAI-compatible endpoint; OpenRouter `:free` models) | **Awaiting credentials.** Free tiers' data terms vary: some providers' free tiers may use prompts for training. | Off unless `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` are set. The consent dialog shows the provider and the owner-entered `LLM_DATA_RETENTION_NOTE`. |

Sources consulted for the free-LLM landscape (third-party summaries, to be verified on each provider's own pages before
selection): [OpenRouter — Free LLM APIs compared](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/),
[eesel — Groq pricing 2026](https://eesel.ai/blog/groq-pricing), [Google AI forum — free vs paid tier](https://discuss.ai.google.dev/t/clarification-on-gemini-api-free-tier-vs-paid-tier-after-billing-activation/96995),
[OpenRouter support](https://openrouter.ai/support).

## Status legend used in the completion report
- **Implemented and tested.**
- **Implemented but awaiting credentials.** The code and tests exist; the feature turns on once the environment variables are set.
- **Blocked by licensing or access.** An adapter or interface exists but is disabled, and the UI is honest about it.
- **Proposed for a future release.**
