# Architecture (website — Agent 1)

Status: Phase 2 implementation plan, written 2026-10-17. Finance and data engines are owned by Agent 2 and are
consumed only through `@/contracts` (see `docs/CONTRACTS.md`).

## Principles
- **One source of financial truth.** Components call engines and render the fields they return. No component
  computes gains, real values, rates, percentages of a corpus, or anything else financial.
- **Honest states.** Engine `ok: false` shows an error state, never a substitute number. Engine `warnings` are always
  rendered. Every projection is labelled "Projection (assumption-based)".
- **Public by default.** No login, no OTP, no account wall. Saved plans are local to the browser.
- **No live-market claims.** There is no quote ticker. NAV data shows its provider, observation date, fetch time and
  freshness from `navFreshness()`.

## Routes
| Route | Kind | Notes |
|---|---|---|
| `/` | static | Positioning, entry points, honesty notes |
| `/calculators` | static + client filter | Searchable directory built from `features/calculators/ui/registry.ts` |
| `/calculators/[slug]` | dynamic (reads `searchParams` for share links) | `sip`, `step-up-sip`, `lumpsum`, `corpus-sip`, `goal-planner`, `swp`, `monte-carlo`, `income-tax` |
| `/goals` | static | Goals & Retirement hub (goal planner, SWP, Monte Carlo) |
| `/funds`, `/funds/[schemeCode]` | client data | Mutual Fund Research: search, NAV history, provenance, rolling returns |
| `/historical` | client data | SIP backtest on observed NAVs (`backtestSipOnNav`) |
| `/scenario-lab` | client | Up to 3 accumulation scenarios side by side (each runs `projectAccumulation`) |
| `/saved` | client | Saved plans from `localStorage` |
| `/learn` | static | Short explainers on conventions and limits |
| `/methodology`, `/data-sources` | static | Methodology & Data Sources |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | static | Legal/contact pages carry "owner to supply before launch" notices |
| `/api/health` | dynamic | Liveness (Phase 1) |
| `/api/market-status` | dynamic | Reports that no licensed quote provider is configured |
| `/api/funds/search?q=` | dynamic | Validated query → MFAPI search |
| `/api/funds/[schemeCode]` | dynamic | Scheme metadata + provenance + freshness |
| `/api/funds/[schemeCode]/nav` | dynamic | Full NAV series + provenance + freshness |

## Source layout
```
src/app/                    routes, layouts, API route handlers
src/app/api/_lib/           server-only helpers: TTL cache + in-flight dedupe, rate limiter, envelopes, IST date
src/components/layout/      SiteHeader (desktop nav + mobile drawer), SiteFooter, Breadcrumbs, PageHeader, ThemeToggle
src/components/ui/          Button, Card, NumberField (input + slider), Choice (radio group), Notice, KpiCard,
                            Money, DataTable, Tabs, Badge
src/components/calculator/  CalculatorLayout, ConventionFields, ResultHeader, Warnings, ExportBar, ShareButton,
                            SavePlanButton, GrowthChart, ScheduleTable, MethodNote
src/features/calculators/ui/ registry, field state hook, share-link codec, report mapping, one component per calculator,
                            Monte Carlo Web Worker
src/features/funds/ui/      search, scheme detail, provenance panel, NAV chart, rolling returns
src/features/historical/ui/ NAV SIP backtest screen
src/features/scenarios/ui/  scenario lab
src/features/plans/ui/      safe localStorage wrapper, saved-plan list
```

## Client/server split
- Pages are server components that render static chrome (header, breadcrumbs, explanatory copy). Interactive
  calculators are client components, because every result depends on in-browser input.
- Engines are pure and synchronous, so calculators run them in `useMemo`. Monte Carlo runs in a Web Worker
  (`mc.worker.ts`) and falls back to the main thread only if `Worker` is unavailable, with a visible note.
- Fund data is fetched client-side from our own `/api/funds/*` routes. The routes are the only code that talks to the
  provider (through Agent 2's `src/lib/data/mfapi.ts` adapter, which builds URLs from a fixed base and validated input
  — never an open proxy). This keeps provider access server-side and lets e2e tests mock `/api/funds/*` so CI never hits
  a live API.

## State
- Calculator inputs are held as **raw strings** so invalid text is never silently coerced. A field that does not parse
  shows "Enter a number" and the engine is not called. Parsed values go to the engine; the engine's `CalcError.field`
  is mapped back to the matching input (`aria-invalid`, `aria-describedby`).
- Initial state comes from defaults or a share link (`?` query of non-sensitive assumptions only; the tax calculator
  shares only the financial year and age band, never income).

## Persistence
- `features/plans/ui/storage.ts` wraps `localStorage` in try/catch (private mode, quota, disabled storage) and validates
  stored JSON with Zod before use. Nothing is sent to a server.
- Cloud accounts are deferred (`docs/ROADMAP.md`); they need a real auth provider and owner approval.

## Exports
- CSV and XLSX use `reportToCsv` / `reportToXlsx` from `@/contracts`. The export module is loaded on click, and ExcelJS
  is loaded lazily inside `reportToXlsx`. The `Report` objects are assembled in
  `features/calculators/ui/reports.ts` by mapping engine output fields one-to-one (no arithmetic). Agent 2 owns the
  payload content; until Agent 2 ships report builders, this mapping is the interim implementation (see Open items in
  `docs/CONTRACTS.md`).
- Print: a print stylesheet hides navigation and controls and prints assumptions, results, warnings and disclaimer.

## Design system
- Tokens are CSS custom properties in `globals.css` (light default, dark via `prefers-color-scheme` or an explicit
  `data-theme` set by the theme toggle). Tailwind v4 `@theme inline` maps them to utilities.
- Forest-green primary on warm-neutral surfaces. Contrast ratios are measured by `scripts/contrast.mjs` and recorded in
  `globals.css`.
- Fonts via `next/font` (self-hosted at build; CSP stays `'self'`). Tabular numerals everywhere numbers appear.
- Visible focus rings, skip link, `prefers-reduced-motion` respected (chart animation disabled too).

## Testing
- Component tests (Vitest + Testing Library, jsdom per file) in `tests/components/`.
- Playwright e2e in `tests/e2e/` against `next start` (desktop + mobile Chromium) with `@axe-core/playwright`.
  `/api/funds/*` is mocked with `page.route`; CI sets `NAV_PROVIDER=none` so the server never calls a live API.
