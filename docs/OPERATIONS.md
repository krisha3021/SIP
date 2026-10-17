# Operations

## What runs where
| Piece | Where | State |
|---|---|---|
| Pages and calculators | Static/SSR on Vercel; calculations run in the browser | None server-side |
| Monte Carlo | Browser Web Worker | None |
| `/api/funds/*` | Vercel Functions (Node.js) | Agent 2's `createNavService` with a per-instance `InMemoryCacheStore` (6 h fresh, 60 s failure cooldown, de-duplication, last-known-good); 60 min search cache |
| Rate limiting | Same functions | Per-instance fixed window: 60 requests/min per client IP across `/api/funds/*` |
| Saved plans, theme | User's browser `localStorage` | Never sent to the server |
| `/api/cron/validate-mf-data` | Vercel Cron, daily 02:30 UTC | In-memory `MfDataStore` — runs are **not persisted** until storage is provisioned |

Per-instance state resets on cold start and is not shared between instances. That is acceptable at current scale; a shared
store (owner decision, possibly paid) would make caching and rate limits global.

## Health and monitoring
- `GET /api/health` — liveness and configuration presence (never secret values).
- `GET /api/market-status` — confirms no quote provider is configured.
- Vercel → Project → Logs shows function logs. Route handlers do not log request bodies, IPs or secrets.
- Watch for: rising 5xx/504 on `/api/funds/*` (provider down or slow), 429s (rate limit too tight or abuse).

## Incident playbook
| Symptom | Likely cause | Action |
|---|---|---|
| Fund pages show "could not be loaded" / 502 / 504 | MFAPI down or slow | Nothing to fix locally. Cached schemes keep serving the last good copy, labelled "Cached". If prolonged, set `NAV_PROVIDER=none` in Vercel and redeploy to show a clear disabled state. |
| NAVs marked "Stale" | Provider has not published new NAVs (holidays, outage) | Expected behaviour; freshness comes from observation dates. Check mfapi.in. |
| Many 429 responses | Abuse or a shared IP (office/NAT) | Consider raising the limit in `src/app/api/_lib/guard.ts` or adding Vercel Firewall rules (owner approval if paid). |
| Build fails on Vercel but CI passed | Node version or env mismatch | Check Project Settings → Node.js 24.x; compare env vars with `.env.example`. |
| A bad release | — | See DEPLOYMENT.md §6 (promote previous deployment, then revert). |

## Routine tasks
- **Dependencies:** versions are pinned exactly. Upgrade in a PR; run `npm run check` and `npm run test:e2e`. Re-check the
  advisories noted in `docs/ROADMAP.md`.
- **Tax years:** each new financial year is added by Agent 2 as `status: 'unverified'` (disabled in the UI). Enabling it
  needs a primary-source check and owner review.
- **Contrast:** after changing colour tokens in `src/app/globals.css`, run `node scripts/contrast.mjs` (CI runs it too).
- **Accessibility:** the e2e suite runs axe (WCAG 2.2 AA tags) on every core route on desktop and mobile.

## Secrets
- Only `.env.example` is committed. Real values live in Vercel's environment settings.
- Server-only variables (`CRON_SECRET`, `UPSTASH_*`) must never be prefixed `NEXT_PUBLIC_`.

## Deferred (not built)
- Cloud accounts / sign-in (needs a real auth provider, owner approval).
- Admin dashboard for `AutomationRunReport` — needs persisted run history first.
- Shared cache and run-history storage.
