# Roadmap

| Phase | Scope | Owner | Status |
|---|---|---|---|
| 1 | Audit, architecture, dependencies, pure engines, independent tests | both (baseline) | **Done** (2026-10-17) |
| 2 | Design system, navigation, public calculators on `@/contracts` | Agent 1 | **Done** (2026-10-17) |
| 3 | `/api/funds/*`, caching, rate limiting, NAV backtest UI, exports | Agent 1 (routes/UI) + Agent 2 (adapters/payloads) | **Done** (contract 0.2.x) |
| 4 | Scenario comparison, saved plans (local), retirement, cash flow, allocation, Life-stage & Risk Planner | Agent 1 + Agent 2 | **Done** (contract 0.3.0); cloud accounts deferred |
| 5 | Security headers, a11y (axe in e2e), SEO, CI, deployment docs | Agent 1 | **Done** |
| 6 | Full checks, preview review, production deploy | both | **Live** at https://sip-three-zeta.vercel.app; final polish in progress |
| 7 | Capital-gains estimator (engine, then screen) | Agent 2, then Agent 1 | Engine done (contract 0.4.0). Screen not built. |
| 8 | Research-platform upgrade: clock, provenance, profiles, compare, watchlist, Strategy Lab, permissions, opt-in AI | inline (owner-invoked) | Implemented and tested on `release/research-upgrade`. **Awaiting preview and production approval.** |

## Owner decisions still needed
Step-by-step instructions for each: [docs/owner-actions/README.md](owner-actions/README.md).

- **FY 2026-27 tax rules:** verify against the Finance Act 2026 text and review before the year is enabled (it stays disabled until then).
- **MFAPI terms:** confirm commercial use, caching and export redistribution with the maintainer.
- **Approved scheme list** for the daily data-quality task (`src/lib/automation/tasks/approved-schemes.json`, currently PPFAS Flexi Cap Direct/Regular Growth).
- **Legal and contact content:** Privacy, Terms and Disclaimer drafts are ready (docs/owner-actions/legal-drafts.md) with placeholders; About and Contact still need content.
- **Storage service for automation runs** and last-known-good NAVs (the in-memory store loses everything on a cold start; a paid service needs approval).
- **AMFI written permission** to display NAV, TER and AAUM publicly (draft: docs/owner-actions/amfi-permission-request.md). AMFI's terms of use (verified 2026-10-19) allow personal, non-commercial use only. Until permission is held, TER and AUM stay off, and NAV display on the public site is at your own risk.
- **Free LLM provider** for AI explanations: choose one, read its data-retention and training terms, then set `LLM_*` and `CONSENT_SIGNING_SECRET` in Vercel. Until then AI explanations are off.
- **Rating licence**, if third-party star ratings are wanted.
- **`CRON_SECRET` in Vercel:** set a value of at least 32 random characters for Production; until then the cron route refuses every request (401).

## Deferred
- Holdings, sector allocation, fund managers, exit load, minimums, benchmark, riskometer and inception date: no unified official feed exists. This needs a licensed structured provider, or per-AMC document parsing.
- Portfolio overlap: the formula is implemented and tested; it needs holdings data.
- Illustrative rebalancing policies and STP simulations in Strategy Lab.
- A shared nonce store for consent tokens, wiring the existing Upstash adapter (until then, replay protection is per server instance).
- The capital-gains estimator screen.
- Licensed market-quote provider for index values. Until one exists, no ticker is shown.
- Cloud accounts / sign-in. This needs a real provider, which has a cost, and owner approval.
- Admin dashboard for automation runs (needs persisted run history first).
- The dev-only `braces` advisory reached through `eslint-config-next` has no fixed release; re-check on each upgrade.
- ESLint is pinned at 9.39.5, which is end-of-life, because the plugins in `eslint-config-next@16.4` do not yet accept ESLint 10.
