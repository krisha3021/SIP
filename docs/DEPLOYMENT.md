# Deployment (GitHub → Vercel)

Status: **not deployed**. Every step below that touches an external account (GitHub, Vercel, DNS registrar) needs the
owner's explicit approval and is performed by the owner or with the owner present. Nothing here requires a paid plan.

## 1. Model
- Source of truth: the GitHub repository. `main` is production.
- Vercel's native Git integration builds every push:
  - Push/merge to `main` → **Production** deployment.
  - Any other branch / pull request → **Preview** deployment with its own URL.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit + component tests, the contrast check, the build, and
  Playwright e2e (desktop + mobile Chromium with axe). Protect `main` so a PR needs CI to pass before merging.

## 2. One-time setup (owner)
1. Push the repository to GitHub (private is fine).
2. In Vercel: **Add New → Project → Import** the GitHub repository. Framework preset: Next.js. Root directory: repo root.
   Build command and output are detected (`next build`). Node.js version: 24.x (Project Settings → General).
3. Set environment variables (below), then deploy.
4. In GitHub: Settings → Branches → protect `main`: require PRs, require the `check` and `e2e` status checks.

## 3. Environment variables
All are optional; the calculators work with none. Never commit real values; `.env.example` lists them.

| Variable | Production | Preview | Development (`.env.local`) | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | leave unset | `http://localhost:3000` | Canonical URLs, sitemap. Public. |
| `NAV_PROVIDER` | `mfapi` | `mfapi` or `none` | `mfapi` | `none` turns fund features off (routes return 503). |
| `NAV_FETCH_TIMEOUT_MS` | `8000` | `8000` | `8000` | Clamped server-side to 2000–15000. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | unset for now | unset | unset | Shared cache is a deferred owner decision (may be paid). |
| `CRON_SECRET` | unset until Agent 2's automation ships | unset | unset | Secret; server-only. |

`VERCEL_ENV` is set by Vercel automatically. When it is not `production`, the root layout emits `noindex, nofollow` and
`robots.txt` disallows everything, so preview URLs are not indexed.

## 4. Domain and DNS (owner)
1. Vercel → Project → Settings → Domains → add `example.in` and `www.example.in` (choose one as primary; redirect the other).
2. At the registrar, create the records Vercel shows (typically an `A` record for the apex and a `CNAME` for `www`).
3. Wait for Vercel to verify and issue TLS certificates. Then set `NEXT_PUBLIC_SITE_URL` for Production and redeploy.

## 5. Verify a deployment
Run on the Preview URL before merging, and on Production after:
- `GET /api/health` → `{"status":"ok", ...}` with `Cache-Control: no-store`.
- `GET /api/market-status` → `quoteProvider: null`.
- Response headers include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`.
- Preview HTML contains `<meta name="robots" content="noindex, nofollow">`; Production does not.
- Open `/calculators/sip` at 375 px and desktop; CSV and Excel downloads work.
- `/funds` search returns results and a scheme page shows provider, observation date and freshness.
- Optionally run the e2e suite against the URL: `PLAYWRIGHT_BASE_URL` is not wired yet; run locally with `next start`.

## 6. Rollback
- Vercel → Deployments → pick the last good Production deployment → **Promote to Production** (instant, no rebuild).
- Then revert the bad commit on `main` through a PR so Git and Production agree again.
- Data: the site stores nothing server-side today (saved plans are in users' browsers), so a rollback has no data migration.

## 7. Before public launch (owner decisions)
- Legal pages: supply About, Contact, Privacy, Terms and Disclaimer text (pages show "Owner to supply before launch").
- Confirm MFAPI's terms for commercial use and redistribution.
- Decide on a shared cache / last-known-good store (Upstash or similar) — may cost money.
- Verify FY 2026-27 tax rules against the Finance Act before enabling that year (Agent 2 + owner review).
