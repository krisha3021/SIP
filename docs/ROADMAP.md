# Roadmap

| Phase | Scope | Owner | Status |
|---|---|---|---|
| 1 | Audit, architecture, dependencies, pure engines, independent tests | both (baseline) | **Done** (2026-10-17) |
| 2 | Design system, navigation, public calculators on `@/contracts` | Agent 1 | Not started |
| 3 | `/api/funds/*`, caching, rate limiting, NAV backtest UI, exports | Agent 1 (routes/UI) + Agent 2 (adapters/payloads) | Adapter done; routes pending |
| 4 | Scenario comparison, saved plans (local), optional cloud accounts | Agent 1 + Agent 2 (comparison engine) | Not started |
| 5 | Security headers review, a11y audit, SEO, CI, deployment docs | Agent 1 | Headers + CI drafted |
| 6 | Full checks, preview review, launch report | both | Not started |

## Deferred / needs owner decision
- FY 2026-27 tax rules: disabled until verified against the Finance Act 2026 text.
- Capital-gains estimator (separate module).
- Licensed market-quote provider for index values. Until one exists, no ticker is shown.
- Cloud accounts / phone OTP. This needs a real provider, which has a cost, and owner approval.
- Shared cache / database for last-known-good NAVs and automation run history. This needs owner approval if the service is paid.
- MFAPI commercial-use and redistribution terms must be confirmed with its maintainer before public launch.
- The dev-only `braces` advisory reached through `eslint-config-next` has no fixed release; re-check on each upgrade.
- ESLint is pinned at 9.39.5, which is end-of-life, because the plugins in `eslint-config-next@16.4` do not yet accept ESLint 10.
