# Source-Code Audit — `lakshya-investment-simulator.jsx`

Audited file: `lakshya-investment-simulator.jsx` (4,200 lines, 230,780 bytes, last modified 2026-05-26).
Audit date: 2026-10-17.
Repository state at audit time: no existing repository — the file was a single standalone React
component written for an artifact sandbox. There was no package manifest, build config, test suite,
or deployment configuration to preserve.

Comments in the source were treated as **claims to verify**, not as evidence.

Severity key: **S1** = produces wrong or misleading results / user-facing harm; **S2** = correctness
or trust issue under some inputs; **S3** = quality, maintainability, or UX issue.

---

## 1. Inventory of modules

| # | Module (component) | Engine function(s) | Data used | Kept in rebuild? |
|---|---|---|---|---|
| 1 | `SipCalculator` | `buildSIP` | user inputs | Yes — rewritten |
| 2 | `StepUpSipCalculator` | `buildStepUpSIP` | user inputs | Yes — rewritten |
| 3 | `LumpsumCalculator` | `buildLumpsum` | user inputs | Yes — rewritten |
| 4 | `CorpusSipCalculator` | inline loop | user inputs | Yes — rewritten |
| 5 | `SwpCalculator` | `buildSWP` | user inputs | Yes — rewritten |
| 6 | `GoalPlannerCalculator` | `requiredMonthlySIP` (**undefined**), bisection over `buildStepUpSIP` | user inputs | Yes — rewritten |
| 7 | `CashFlowCalculator` | inline arithmetic + `buildSIP` | user inputs | Yes — rewritten |
| 8 | `BacktestCalculator` | `backtestSIP`, `xirr` | `HISTORICAL_RETURNS` (annual, partly estimated) | Replaced by actual NAV backtest |
| 9 | `RollingReturnsCalculator` | inline | `HISTORICAL_RETURNS` | Yes — on real NAV series |
| 10 | `BearBoosterCalculator` | `generateMonthlySeries`, `simulateBearBooster` | **synthetic** series | Yes — relabelled + fair comparison |
| 11 | `MonteCarloCalculator` | `runMonteCarlo`, `randn` | user inputs | Yes — rewritten |
| 12 | `PortfolioCompareCalculator` | `backtestSIP` | `HISTORICAL_RETURNS` | Yes — on real NAV series |
| 13 | `TopFundsCalculator` | sort by AUM, `FundAlertBadge` | `TOP_FUNDS` (hand-typed snapshot) | Replaced by NAV-provider research |
| 14 | `AssetClassCalculator` | `amount*(1+cagr)^n` | `ASSET_CLASSES` (hand-typed) | Yes — as user-editable scenarios |
| 15 | `TaxSavingCalculator` | `calcOld`, `calcNew` | hard-coded slabs | Yes — FY-specific config |
| 16 | `AiAdvisorCalculator` | age-based heuristic | user inputs | Yes — renamed "Allocation Explorer" |
| 17 | `SourcesCalculator` | — | `CITATIONS`, `AMC_RANKINGS` | Yes — Methodology & Data Sources |
| — | `LoginScreen` / `AuthWrapper` | demo OTP, `window.storage` | — | **Removed** (see §5) |
| — | `AppCore` ticker | static `indices` array | hard-coded quotes | **Removed** (see §3.1) |
| — | `downloadTableExcel` | SheetJS `xlsx` | calculator rows | Replaced by ExcelJS + CSV |
| — | `downloadRealNAVScript` | embedded base64 Python | — | Superseded by in-site backtester |

---

## 2. Dependencies

| Package (as imported) | Notes |
|---|---|
| `react` (`useState`, `useMemo`, `useEffect`) | No version pinned; artifact runtime supplied it. |
| `xlsx` (SheetJS) | The npm registry copy of `xlsx` is the old community build (0.18.x) with published advisories (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363); current SheetJS releases are distributed only from the SheetJS CDN, not npm. **Replaced with ExcelJS.** |
| `recharts` | Retained (v3). |
| `lucide-react` | Retained. |
| Tailwind (via utility classes) | Classes such as `bg-[${COLORS.surface}]` are built with string interpolation, which Tailwind's compiler cannot see — these classes never generate CSS. Inline `style` props silently did the real work. |
| Google Fonts via CSS `@import` in a `<style>` tag | Render-blocking and incompatible with a strict CSP. Rebuild uses `next/font` (self-hosted at build time). |

There was no lockfile, no TypeScript, no lint, and no tests.

---

## 3. Data provenance

### 3.1 Hard-coded index values under a LIVE label — **S1**

`AppCore` holds a constant array of six index values (NIFTY 50 24,031.70, SENSEX 76,488.96, …)
with the comment "Verified close values for May 25, 2026". The header renders a pulsing dot and the word
**LIVE**. Nothing is ever fetched.

`handleRefresh` waits 1.2 s with `setTimeout`, then calls `setLastRefresh(new Date())`. The
"updated just now" indicator therefore resets **without any upstream request**. This is a false
freshness signal.

**Rebuild:** the ticker is removed. No licensed quote provider is configured, and scraping NSE/BSE
pages is neither permitted nor reliable. `/api/market-status` reports that no quote provider is configured.
NAV freshness is reported from the observation date returned by the upstream, and a failed fetch never
moves that date.

### 3.2 `HISTORICAL_RETURNS` — mixed observed and estimated data labelled "verified" — **S1**

- 15 categories × 20 calendar years (2005–2024).
- Only `Nifty 50` carries `verified: true`. Its values (36.3, 39.8, 54.8, −51.8, 75.8, …) match
  published Nifty 50 **price-index** calendar returns. The comment calls them "Total Returns", but they exclude
  dividends. The TRI would be about 1–1.5 percentage points higher per year.
- The other 14 rows are commented as "estimated … using long-run beta relationships", or "derived from category
  averages". The UI still shows "✓ Apr 2026 verified" for the whole page and "20 years of verified market
  history" in the footer.
- Category rows such as "Mid Cap" or "Banking" are not investable instruments, and the code does not record
  which index or fund each row represents.

**Rebuild:** annual estimated series are removed from every module that describes itself as historical.
Historical analysis runs only on dated NAV observations from a configured provider, with the provenance record.

### 3.3 `TOP_FUNDS`, `AMC_RANKINGS`, `ASSET_CLASSES` — **S1**

- AUM, expense ratio, 1/3/5-year returns, holdings, and **star ratings** were typed in by hand, with sources
  such as "belong.com", "Jezz Money", and "Tickertape". The as-of dates differ (May 2026, Dec 2025, Q1 FY26).
- Several values are internally inconsistent. For example, "Nippon India Large Cap" shows a 5-year return of 27.9%,
  higher than its own mid-cap peers in the same table.
- Star ratings are a third party's proprietary data. Redistributing them needs a licence.
- `FundAlertBadge` turns these numbers into "✓ Clean", "Low rating", or "Sub-par 3yr" badges. These are
  authoritative-looking judgements based on unverified inputs.
- "Category leader", "Largest", and "Institutional favourite" are superlatives with no evidence.

**Rebuild:** removed. Fund research shows only fields the configured provider returns (scheme code, name, fund
house, category, plan/option where derivable, NAV history). AUM, ratings, holdings, and TER show "Not available".

### 3.4 Differing as-of dates — **S2**

| Dataset | Claimed as-of |
|---|---|
| `DATA_AS_OF` | "Apr 2026" |
| Index ticker | 25 May 2026 |
| `TOP_FUNDS` header | May 2026 (individual sources Dec 2025 – May 2026) |
| `AMC_RANKINGS` | Q1 FY26 (Apr–Jun 2025) |
| `HISTORICAL_RETURNS` | CY2005–CY2024 |
| PPF rate | Q1 FY26 |

The single "verified" badge hid these differences. The rebuild stores provenance (`observedAt`, `fetchedAt`,
`coverage`) for each dataset.

### 3.5 Embedded base64 Python script — **S3**

Line 786 is a 26,783-character base64 string that decodes to a 440-line `fetch_real_navs.py`. It was decoded and
reviewed in isolation and was not executed. The script:

- Fetches `https://api.mfapi.in/mf/{code}` for 8 hard-coded scheme codes.
- Collapses daily NAVs to the **last available NAV of each month**. That simulates month-end purchases. It does not
  model a chosen SIP day or a next-available-NAV rule.
- Writes Excel **formulas only**, with no cached values. Viewers that do not recalculate show blanks.
- Describes MFAPI as an "AMFI mirror". MFAPI is an independent third-party service.

**Rebuild:** superseded by the in-site NAV backtester (server-side fetch through an allowlisted adapter) with
CSV/XLSX exports that contain evaluated values.

---

## 4. Calculation inconsistencies

### 4.1 SIP contribution timing mismatch between forward and reverse SIP — **S1**

- `buildSIP`: `corpus = corpus*(1+i) + monthly`. That is an **end-of-period** contribution (ordinary annuity).
- `requiredSIP`: `FV / ([((1+r)^n − 1)/r] · (1+r))`. That is a **beginning-of-period** contribution (annuity due).

Feeding the reverse result back into the forward engine therefore misses the target by a factor of `(1+r)`. At
12%/yr nominal that is 1% of the target, or ₹3 lakh on a ₹3 crore goal.

**Rebuild:** one `timing: 'begin' | 'end'` parameter is used by forward SIP, step-up SIP, corpus+SIP, reverse SIP,
and exports. Round-trip tests enforce consistency.

### 4.2 `requiredMonthlySIP` is undefined — **S1 (crash)**

`GoalPlannerCalculator` calls `requiredMonthlySIP(...)`, but only `requiredSIP` is defined. Opening the Goal Planner
throws `ReferenceError` and unmounts the app (there is no error boundary).

### 4.3 Nominal vs effective annual rate silently mixed — **S2**

- Forward calculators use `annual/12` (nominal, monthly compounding). A "12%" input actually yields 12.68% effective per year.
- `buildLumpsum` uses `(1+annual)^y` (effective annual).
- `backtestSIP` uses `(1+annual)^(1/12) − 1` (effective → monthly).

So a lumpsum and a SIP at the same "12%" are not comparable. **Rebuild:** an explicit `rateConvention:
'nominal' | 'effective'` setting, shown in the UI, methodology, and exports.

### 4.4 Step-up SIP — **S3**

The step-up is applied after each year, which is correct for "year-on-year" increases. However:
- There is no cap. At 25% over 40 years, the monthly SIP grows by about 7,500×, with no affordability warning.
- There is no fixed-amount step-up option.

### 4.5 SWP depletion accounting — **S1**

```js
current = current * (1 + i) - withdrawal;
if (current <= 0) { exhaustedYear = y; current = 0; break; }
yearWithdrawn += withdrawal;
```

- In the depleting month, the **partial withdrawal actually available** (`current*(1+i)`) is discarded. It is
  neither added to `yearWithdrawn` nor `totalWithdrawn`.
- Depletion is reported only to the year, not the month.
- `exhaustedYear >= 90 − startAge` decides "will last" against an unstated age-90 horizon.
- A withdrawal rate ≤ 4% is labelled **"Safe (≤4%)"**. The 4% rule comes from US data with specific assumptions, and
  it is not universally safe.
- The simulation stops silently at 60 years.

### 4.6 XIRR — **S1**

```js
let lo = -0.99, hi = 5;
for (80 iterations) { if (|npv(mid)| < 0.5) return mid; if (npv(mid)*npv(lo) < 0) hi = mid; else lo = mid; }
return (lo+hi)/2;
```

- It never checks that `[lo, hi]` brackets a sign change. With no root in range, it still returns a number.
- The tolerance is an absolute ₹0.50, which is meaningless for very small or very large flows.
- Cash-flow times are `m/12` year fractions, not actual dates, so there is no day-count convention.
- It never checks that the flows contain at least one positive and one negative value.
- On failure it returns a **fabricated rate**.

### 4.7 Monte Carlo — **S1**

- Uses `Math.random()`, so it is not reproducible. The "Re-simulate" seed only forces a recompute.
- It draws one normal *annual* return per year and divides by 12. Within-year volatility is ignored, and
  `expected + σ·Z` lets an annual return fall below −100% at high σ.
- **Success is defined as reaching 2.5 × total invested.** That is arbitrary and unrelated to any user goal.
- There is no distinction between arithmetic mean and log-drift. The median outcome is biased high when σ is large.
- It runs 500 paths synchronously on the main thread on every slider change.

### 4.8 Drawdown distorted by contributions — **S1**

`backtestSIP` computes `maxDD` from the running **corpus**, which rises with every contribution. New money masks
market falls, so the reported "Max DD" understates the true drawdown. **Rebuild:** drawdown is computed on the NAV
series (or on a unitised portfolio value).

### 4.9 Bear-market booster attributes extra capital to "skill" — **S1**

- The market path is **synthetic**: an LCG with Box–Muller noise plus three scripted crashes at months 36, 120,
  and 192. The UI does not say this anywhere.
- The booster invests more money (up to 4× SIP). "Extra Wealth" and "×n on extra invested" credit all of the
  additional corpus to the strategy.
- The unused variable `efficiencyGain` hints that a fair comparison was intended but never shown.

**Rebuild:** report the total invested, XIRR, the additional capital, and a **comparable-capital baseline** (the
same total extra capital invested on a fixed schedule) for each strategy. The synthetic label is mandatory, and a
real-NAV mode is available.

### 4.10 Rolling returns on annual estimates — **S2**

These use calendar-year compounding of partly estimated numbers. Only 16–18 overlapping windows exist, and "Best
window" values come from estimates. **Rebuild:** daily or monthly NAV-based rolling CAGR.

### 4.11 Tax planning tied to an older year — **S1**

- The footnote says "FY 2024-25". The new-regime slabs (3/7/10/12/15 L, rebate ≤ ₹7 L) are the **FY 2024-25**
  slabs. Budget 2025 changed them from FY 2025-26 onwards (4/8/12/16/20/24 L, rebate up to ₹12 L taxable income).
  Today is FY 2026-27, so the calculator presents a superseded regime as current.
- The old regime omits the s.87A rebate (₹12,500 up to ₹5 L taxable income).
- There is no marginal relief at the rebate boundary, and no surcharge.
- The 80D limit is fixed at ₹25,000, with no senior-citizen or parents limit.
- There are no source links.

**Rebuild:** a financial-year-keyed config with source URLs and a `verified` flag. A year whose rules have not been
verified against authoritative text is **disabled**, not guessed. Capital-gains estimation is a separate module.

### 4.12 Cash-flow planner — **S3**

- `savingsRate` adds the surplus to the SIP but ignores a negative surplus, so overspending is hidden.
- The emergency fund target is fixed at 6× expenses.
- The projected wealth from surplus assumes a fixed 12% return that the user cannot see or change.

### 4.13 "AI Advisor" — **S1 (misleading positioning)**

- It is a deterministic `100 − age` equity heuristic with ±15 risk adjustment, 10% gold, and a fixed 60%
  expense ratio for the retirement corpus. No AI or model is involved.
- The menu labels it "Personalized recommendations", and the default landing tab is `advisor`.
- An age-based heuristic is not a suitability assessment. Presenting it as advice risks implying regulated
  investment advice.

**Rebuild:** renamed **Allocation Explorer**. Every assumption is visible and editable, and the module says that it
is educational and not advice.

### 4.14 Formatting — **S3**

- `fmtINR` uses "K" for thousands, which is not an Indian convention, and `toFixed` causes rounding loss. There is
  no way to see the full value.
- `fmtPct` throws on `NaN`/`undefined` (`n.toFixed`).
- Ratios such as `last.gains / last.invested` divide by zero when the duration is 0. The UI prevents that today,
  but the engines do not.

### 4.15 Input handling — **S2**

- `NumberInput`: `parseFloat(e.target.value) || 0` silently turns invalid input into 0.
- `Slider` clamps values without telling the user.

---

## 5. Authentication and storage — **S1**

- `LoginScreen` accepts **any 10-digit mobile number and any 6-digit OTP**. "Sending OTP…" is a `setTimeout`, and
  no SMS is ever sent. The screen also shows "OTP sent to +91 …", which is a false statement.
- The session (mobile number plus timestamp) is written to `window.storage`, an API that exists only in the
  artifact sandbox. In an ordinary browser, `window.storage` is `undefined`, the optional chaining silently skips it,
  and login never persists.
- Calculators are gated behind this fake login. "Continue as guest" exists, but the gate is the first screen users see.

**Rebuild:** login removed. All calculators are public. Saved plans live in `localStorage` (non-sensitive, local
only), behind a storage wrapper that degrades safely. Cloud accounts are deferred (`docs/ROADMAP.md`) and will
require a real provider with server-side verification.

---

## 6. Accessibility and responsive layout

- Text inputs have no `id` or `htmlFor` link to their `<label>`. The slider's value button has no accessible name
  beyond the formatted number.
- Charts have no text summary or table alternative.
- Colour alone carries meaning (green/rose KPI accents, flag badges).
- Several faint text tokens fail contrast on white: `textFaint #8e8e85` on `#ffffff` measures 3.30:1, below
  the 4.5:1 AA minimum for body text.
- There is no `prefers-reduced-motion` handling (fade-up, pulse, spin).
- The primary button text colour is `#0a0a0a` on a dark-green gradient (`#073d24`→`#0f4c30`), measured at 1.6–2.0:1, which fails contrast.
- There are no visible focus styles (`outline-none` on inputs).
- Emoji icons have no text alternatives.
- There is no dark mode.

## 7. Security, licensing, deployment, operations

- No CSP or security headers. Fonts were loaded with an inline `@import`.
- Excel export writes user-influenced strings without guarding against formula injection (`=`, `+`, `-`, `@`).
- The `xlsx` npm package has known advisories (see §2).
- Third-party ratings, holdings, and factsheet figures were redistributed without a licence.
- There was no build, CI, environment configuration, health endpoint, or error boundary.
- The "11 verified data sources" claim, "India's most advanced", and "Built with verified data · NSE · AMFI · RBI ·
  Value Research" are unsupported marketing claims.
- The attribution "Created by Alok Shukla" is **retained**.

## 8. Disposition summary

| Issue | Resolution | Phase |
|---|---|---|
| Fake LIVE ticker / refresh | Removed; provenance-based freshness | 1 (engine), 3 (API) |
| Estimated history labelled verified | Removed; NAV-based history only | 3 |
| Fund ratings / AUM / holdings | Removed; "Not available" | 3 |
| Forward/reverse SIP timing | Unified `timing` convention + tests | **1 ✔** |
| Undefined `requiredMonthlySIP` | Fixed; closed-form + tested | **1 ✔** |
| Nominal/effective mixing | Explicit `rateConvention` + tests | **1 ✔** |
| SWP partial withdrawal | Monthly ledger with final partial + tests | **1 ✔** |
| XIRR fabrication | Bracketed Brent/bisection, typed failure + tests | **1 ✔** |
| Monte Carlo | Seeded PRNG, monthly lognormal, user goal + tests | **1 ✔** |
| Drawdown with contributions | NAV/unitised drawdown + tests | **1 ✔** |
| Booster attribution | Comparable-capital baseline + tests | **1 ✔** |
| Tax slabs | FY-keyed config with verification flag + tests | **1 ✔** (UI in 2) |
| AI Advisor naming | Allocation Explorer | 2 |
| Demo OTP / `window.storage` | Removed; local-only saved plans | 2 / 4 |
| Python script | Superseded by NAV backtest engine (+ API in 3) | **1 ✔** engine |
| Formula injection | Export sanitiser + tests | **1 ✔** |
| Accessibility | Design system rebuild | 2 / 5 |
