# Lakshya

Educational Indian investment-planning and mutual-fund research website. Created by Alok Shukla.

## Status
**Live:** https://sip-three-zeta.vercel.app (Vercel production, deployed from `main`). Checked 2026-10-17: home page
returns 200, `/api/health` reports `ok`, and `/api/market-status` reports no quote provider.

What is there today:
- 12 calculators, all without sign-in: SIP, step-up SIP, lumpsum, existing corpus + SIP, goal planner, SWP, Monte Carlo,
  income tax (FY 2025-26 only), Life-stage & Risk Planner, retirement planner, household cash flow, Allocation Explorer.
- Fund research and historical NAV backtests on MFAPI.in data, with provenance and freshness. Scenario Lab, local saved
  plans, Learn, Methodology and Data Sources.
- A daily data-quality cron (`/api/cron/validate-mf-data`). It refuses every request until `CRON_SECRET` is set in
  Vercel. Its runs are not persisted until a storage service is chosen.

Still waiting on the owner: legal and contact content, FY 2026-27 tax verification, MFAPI terms, the approved scheme
list, the storage service, and `CRON_SECRET`. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Deploy
`main` deploys to production through Vercel's GitHub integration; other branches get preview URLs. The steps,
environment variables, domain setup and rollback are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start
```bash
npm ci
npm run check       # lint + typecheck + unit/component tests + production build
npm run dev         # http://localhost:3000
```
Requires Node ≥ 22.12 (developed on Node 24).

End-to-end tests (Playwright, desktop + mobile Chromium, axe accessibility checks) run against a production build:
```bash
npx playwright install chromium
npm run build && npm run test:e2e
```
The e2e server runs with `NAV_PROVIDER=none` and fund API calls are mocked in the browser, so tests never reach a live API.

Colour contrast of the design tokens is checked with `node scripts/contrast.mjs`.

## What is on the site
- **Calculators** (no login): SIP, step-up SIP, lumpsum, existing corpus + SIP (pauses, top-ups), goal planner,
  SWP/retirement, Monte Carlo (Web Worker), income-tax regime comparison (FY 2025-26; FY 2026-27 disabled until verified).
- **Fund Research**: scheme search and NAV history via MFAPI.in, with provenance and freshness; rolling returns.
- **Historical Analysis**: SIP backtest on observed NAVs with XIRR, NAV drawdown and skipped instalments.
- **Scenario Lab**, **Saved Plans** (browser-only), **Learn**, **Methodology**, **Data Sources**, legal pages
  (owner to supply content before launch).
- CSV and Excel exports, share links (non-sensitive assumptions only), print stylesheet, light/dark themes.

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): routes, components, client/server split, state, persistence.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): GitHub → Vercel, environment variables, domain, verification, rollback.
- [docs/OPERATIONS.md](docs/OPERATIONS.md): monitoring, incidents, routine tasks.
- [docs/AUDIT.md](docs/AUDIT.md): audit of the original prototype.
- [docs/CONTRACTS.md](docs/CONTRACTS.md): the website ⇄ finance contract and open items.
- [CLAUDE.md](CLAUDE.md): ownership map and safety rules.
- [docs/ROADMAP.md](docs/ROADMAP.md): phases and deferred work.

Not investment advice. Lakshya is not a SEBI-registered investment adviser or research analyst.
