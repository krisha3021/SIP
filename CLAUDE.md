# Lakshya — working rules for Claude Code sessions

Lakshya is an educational Indian investment-planning and mutual-fund research website (Next.js App Router,
TypeScript, Tailwind v4, Recharts, Zod, Vitest, Playwright, ExcelJS). Brand attribution "Created by Alok Shukla"
must be retained. Read `docs/AUDIT.md` (what was wrong with the prototype) and `docs/CONTRACTS.md` before editing.

## Two-agent ownership (do not cross without coordination)
| Area | Owner |
|---|---|
| `src/app/`, `src/components/`, `src/features/*/ui/`, `src/lib/auth/`, `tests/e2e/`, `tests/components/` | **Agent 1 — website** (branch `agent-1/web-platform`) |
| `package.json`, `package-lock.json`, `next.config.ts`, CI (`.github/`), `vercel.json`, env templates, DB migrations | **Agent 1** (Agent 2 proposes changes) |
| `src/lib/finance/`, `src/lib/data/`, `src/lib/analysis/`, `src/lib/automation/tasks/`, `src/lib/export/report.ts` payload content, `tests/finance/`, `tests/data/`, `docs/CALCULATION-METHODOLOGY.md`, `docs/DATA-SOURCES.md` | **Agent 2 — finance & data** (branch `agent-2/finance-data`) |
| `src/contracts/`, `docs/CONTRACTS.md` | **Shared**. Change only by reviewed PR, with a version bump. |

- One source of financial truth: UI, API, charts, and exports call engines via `@/contracts`. Never re-implement formulas in components.
- Never change investment assumptions, defaults, or tax rules outside Agent 2's area.

## Commands
- `npm ci`: reproducible install.
- `npm run dev`: start the local dev server.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.
- `npm run check`: runs lint, typecheck, unit tests, and build.

## Non-negotiable safety rules
- No fake LIVE labels, no refresh that only changes a timestamp, no invented AUM, ratings, holdings, or TER. Missing data shows "Not available".
- No demo OTP or arbitrary-code login. No `window.storage`. Calculators must work without login.
- Freshness comes only from provider observation dates. A failed fetch never advances freshness.
- Never call an age heuristic "AI" or "advice". Never claim SEBI registration.
- Tax years with `status: 'unverified'` stay disabled. Marking a year verified requires checking a primary source and getting owner review.
- Tests use independently established expected values and deterministic fixtures, and never hit live APIs in CI.
- Secrets stay server-side and out of logs. `.env*` files other than `.env.example` must never be committed.
- Do not push, merge to the production branch, deploy, buy services, or change external accounts without explicit owner approval.
- Owner rule (2026-10-17): every GitHub push and every production deploy needs the owner's real-time "yes" at that moment. Earlier approvals do not carry over.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
