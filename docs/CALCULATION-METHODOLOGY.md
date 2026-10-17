# Calculation Methodology

Owner: Agent 2 (finance & data). Contract version 0.4.0. Last reviewed 2026-10-17.

This document states every convention the engines in `src/lib/finance/` use. The UI, the API, and the exports
show results only through these engines (`@/contracts`), so this document describes every number on the site.
Each section names the source file and the tests that pin the behaviour with independently derived expected values.

General rules:
- Engines never throw on user input. They return `CalcResult<T>`: either `ok` with `warnings`, or an error with a
  `code`, a `message`, and an optional `field`. A failed calculation never produces a stand-in number.
- Percent inputs are percent numbers (`12` = 12 %). Dates are ISO `YYYY-MM-DD`, handled in UTC.
- Monetary inputs must be between ₹0 and ₹1,000 crore (`MAX_AMOUNT = 1e10`). Horizons can be at most 1,200 months.
  Annual return assumptions must be between −50 % and +50 %, and inflation between −5 % and +30 %. Monte Carlo has its
  own limits, listed in its section.
- Results are not rounded inside the engines. Rounding happens only for display (`src/lib/format/inr.ts`).

---

## 1. Rates: nominal vs effective (`rates.ts`)

| Convention | Monthly rate from annual `a` | "12 %" means |
|---|---|---|
| `effective` (default) | `(1 + a)^(1/12) − 1` | 12.00 % a year, 0.9489 % a month |
| `nominal` | `a / 12` | 1.000 % a month, 12.68 % effective a year |

The convention is an explicit input to every projection engine and is printed in every export. The prototype mixed
the two conventions silently (AUDIT §4.3), which is why a convention must always be chosen.
Tests: `tests/finance/rates.test.ts`.

**Inflation and real values.** Inflation is always an effective annual rate. A nominal amount `V` at month `m` is
worth `V / (1 + i)^(m/12)` in today's rupees. A goal stated in today's rupees is inflated by `(1 + i)^(m/12)`.
The real rate (Fisher) is `(1 + r)/(1 + i) − 1`. It is not `r − i`.

## 2. Accumulation: SIP, step-up, lumpsum, corpus + SIP, pauses, top-ups (`sip.ts`)

Month `m` runs from 1 to `months`. The initial corpus is invested at `t = 0`. For a contribution `c_m` in month `m`:

- `timing: 'end'` (the default, ordinary annuity): `V_m = V_{m−1}·(1 + r) + c_m`
- `timing: 'begin'` (annuity due): `V_m = (V_{m−1} + c_m)·(1 + r)`

**Step-up.** Increases apply at the start of each contribution year, in months 13, 25, 37, and so on.
- `percent`: `c = base·(1 + s)^k`, where `k = floor((m − 1)/12)`.
- `amount`: `c = base + step·k`.
- The optional `maxMonthlyContribution` caps the contribution. A cap below the starting amount has no effect,
  because contributions never fall below the starting amount, and the engine warns when this happens. The engine
  also warns when the step-up takes the contribution above 10× the starting amount, or above the user's stated
  monthly budget.

**Pauses** set the regular contribution to 0 for the months in the pause, inclusive. Step-up keeps counting during
a pause. **Top-ups** are added in their month with the same timing as regular contributions.

The yearly table holds months 12, 24, and so on, plus the final month when the horizon is not a whole number of
years. Tests: `tests/finance/sip.test.ts`. These check annuity closed forms (₹10k at 1 %/month for 120 months =
₹23,00,386.89 end-timing and ₹23,23,390.76 begin-timing) and hand-worked two-month ledgers.

## 3. Goal planner / reverse SIP (`goal.ts`)

The reverse calculation uses the **same** timing and rate conventions as the forward engine, so feeding the required
contribution back into `projectAccumulation` reproduces the target. This round-trip is tested.

- Future target = target × `(1 + i)^(months/12)` when the target is stated in today's rupees.
- No step-up: `required = (FV_target − corpus·(1+r)^n) / F`. Here `F = ((1+r)^n − 1)/r`, multiplied by `(1+r)` for
  begin-timing, or `F = n` when `r = 0`.
- Percentage step-up: the terminal value is linear in the starting amount, so `F` is the value of a ₹1 stepped stream.
- Amount step-up: `FV(s) = corpusFV + s·A + B`, where `B` is the value of the step-increment stream on its own.
- With a cap: the terminal value is piecewise-linear and monotone, so the engine uses bracketed bisection with a
  relative tolerance of 1e−6.

The engine also reports the shortfall at the user's current contribution and the additional monthly amount needed.
Tests: `tests/finance/goal.test.ts` and `phase1Fixes.test.ts`. The second file covers a fix from the Agent 2 review of 2026-10-17:
a zero current contribution now projects exactly ₹0, where a 1-paisa internal stand-in used to leak into the result.

## 4. SWP / withdrawals (`swp.ts`)

The SWP is simulated as a monthly ledger.

- `grow-then-withdraw`: the balance grows for the month, then the withdrawal is taken at month end.
- `withdraw-then-grow`: the withdrawal is taken at the start of the month, then the remainder grows.
- The withdrawal rises once a year, from month 13, by `annualIncreasePct`.
- **Depletion.** When the balance cannot cover the scheduled withdrawal, the ledger records the amount actually
  available as the final partial withdrawal and ends the plan. That month is `depletionMonth`. A balance below
  ₹0.005 counts as zero. The prototype dropped this partial amount (AUDIT §4.5).
- "Lasting" means lasting for the stated horizon (default 480 months). The engine does not label any withdrawal rate
  as "safe".
- **Real values.** The closing balance is deflated at `t = m`. The withdrawal is deflated at its payment time:
  `t = m − 1` for `withdraw-then-grow` and `t = m` for `grow-then-withdraw`. The `withdraw-then-grow` case was
  corrected in this review.

Tests: `tests/finance/swp.test.ts` (hand-worked ledgers at 1 %/month for both orderings, exact depletion, and
partial depletion) and `phase1Fixes.test.ts`.

## 5. Retirement: accumulation → withdrawal (`retirement.ts`, added in 0.2.0)

1. Accumulate from the current age to the retirement age with `projectAccumulation`, which takes
   `12 × (retirementAge − currentAge)` months. The retirement age must be greater than the current age, and the
   plan-until age must be greater than the retirement age. Otherwise the engine returns `INVALID_INPUT` and names the
   field.
2. The first withdrawal is the desired monthly income in today's rupees, inflated to the retirement date. It then
   rises once a year by `withdrawalIncreasePct`, which defaults to the inflation rate.
3. The corpus is drawn down with `simulateSwp` at the post-retirement return until the plan-until age. The default
   ordering is `withdraw-then-grow`, which is conservative because income is taken first.
4. **Required corpus** = `Σ_{m=1..N} W_m / (1 + r_post)^{t_m}`, where `t_m = m − 1` for `withdraw-then-grow` and
   `t_m = m` otherwise. Funding exactly this amount makes the SWP end at zero in its final month, and a test checks this.
5. **Gap.** When the projected corpus is below the requirement, `planGoal` gives the additional monthly contribution,
   starting now with the same step-up and conventions.

The plan-until age is a planning assumption, not a life-expectancy forecast. Tests: `tests/finance/planning.test.ts`.
These cover zero-return ledgers (₹1.2 L saved = ₹1.2 L withdrawn; ₹15k/month runs out after 8 months; ₹5k/month
more is needed), and the annuity-due PV of 1,000 at 1 %/month for 12 months = 11,367.63.

## 6. Household cash flow (`cashflow.ts`, added in 0.2.0)

- `income` = take-home income + other regular income (monthly, after tax).
- `surplus` = income − (essential + discretionary + EMIs + existing investments). The surplus **can be negative**,
  and the engine warns when it is.
- `savings rate` = (existing investments + surplus) / income. A negative surplus lowers it and can push it below
  zero. The prototype ignored a negative surplus (AUDIT §4.12). It is `null` when income is zero.
- Emergency-fund target = **user-chosen** months (1–36, no default) × a **user-chosen** basis. The basis is either
  `essential` (essential + EMIs) or `total` (all expenses + EMIs). The engine reports the gap, the coverage %, the
  months covered, and the months of surplus needed to close the gap, assuming no return.
- The engine assumes no return unless the caller passes an explicit `surplusProjection`, which runs through
  `projectAccumulation` with its own stated return, timing, and convention.

Tests: `planning.test.ts`, worked by hand (for example ₹1 L income → ₹15k surplus, 25 % savings rate, ₹3.6 L target,
18 months to close the gap).

## 7. Scenario comparison (`scenarios.ts`, added in 0.2.0)

Up to three labelled `projectAccumulation` inputs are returned in one payload. Labels must be unique. Differences are
measured against scenario 1. Year-end values are aligned by year, and a scenario's cell is `null` after its horizon
ends. Partial final years appear only in each scenario's summary. When timing or rate conventions differ between
scenarios, `conventionsDiffer` is set and a warning explains that part of the difference comes from the convention.
`horizonsDiffer` is set when the horizons differ.

## 8. Allocation Explorer (`allocation.ts`, added in 0.2.0)

This is an **educational rule of thumb, not advice, not a recommendation, not a suitability assessment, and not AI.**
Every parameter is visible and editable:

1. equity = `ageRuleConstant` (default 100) − age
2. \+ an adjustment for the self-described comfort level: cautious −15, balanced 0, comfortable +15
3. clamp the result to [`minEquityPct` 0, `maxEquityPct` 90]
4. if the horizon is under `shortHorizonYears` (3), cap equity at `shortHorizonMaxEquityPct` (20)
5. gold = min(`goldPct` 10, 100 − equity); debt = the remainder

The result includes a step-by-step trace. Every result carries `ALLOCATION_NOTICE`, which the UI must display. An
optional blended return is the weighted mean of returns **the user entered**. It is labelled as an assumption, and
the engine never supplies return numbers itself.

## 9. Monte Carlo (`monteCarlo.ts`)

- Inputs: E is the expected **arithmetic** annual return. σ is the annual volatility of log returns.
- Calibration: `μ = ln(1 + E) − σ²/2`. Monthly log returns are i.i.d. `Normal(μ/12, σ²/12)`, so
  `E[annual growth] = e^{μ + σ²/2} = 1 + E` exactly. The **median** annual growth is `e^μ < 1 + E`. That is why the
  median path sits below the deterministic "expected" path whenever σ > 0. The model output reports this median rate.
- Contributions follow the same `timing` convention as the deterministic engine. Step-up is yearly.
- Success means the terminal value reaches the user's goal, nominal or inflated from today's rupees. The prototype's
  arbitrary "2.5× invested" rule is gone (AUDIT §4.7).
- The PRNG is a seeded Mulberry32 with Box–Muller. The same input and seed give identical output on every platform.
  Percentiles use linear interpolation (Hyndman–Fan type 7).
- **Web Worker hook (0.2.0).** `createMonteCarloSession` and `runMonteCarloChunked(input, { chunkSize, onProgress,
  signal, yieldControl })` simulate paths in fixed order from one generator. Any chunk size therefore gives a result
  bit-for-bit identical to `runMonteCarlo`, and a test covers chunk sizes 1, 37, 250, and 10,000. Aborting resolves
  with `CANCELLED` at the next chunk boundary.
- Domain: 1–60 years, E between −20 % and 30 %, σ between 0 % and 60 %, and 100–10,000 paths.
- **Limitations:** no fat tails, volatility clustering, autocorrelation, mean reversion, regime change, sequence-of-
  contribution behaviour, fees, or taxes. The probabilities describe the model. They are not a forecast.

Tests: `monteCarlo.test.ts` (σ = 0 matches the deterministic engine, the sample mean is close to the analytical
expectation, the seed reproduces results) and `monteCarloChunked.test.ts`.

## 10. XIRR (`xirr.ts`)

- NPV(r) = Σ aᵢ / (1 + r)^{dᵢ/365}, where dᵢ is the number of days from the **earliest** flow. The day count is
  Actual/365 Fixed, the same convention spreadsheet XIRR functions use.
- The engine scans a fixed grid over (−99.99 %, +100,000 %) for sign changes. It then bisects each bracket until the
  relative width is below 1e−12, and accepts a root only if |NPV|/Σ|aᵢ| < 1e−7.
- The engine returns `NO_ROOT` when there is no sign change, or no inflow or outflow. It returns
  `INSUFFICIENT_DATA` when there are fewer than two flows or all flows fall on one date. It returns
  `NOT_CONVERGED` when a bracketed root cannot be confirmed. It **never** returns an unconverged estimate.
- **Root ambiguity.** When flows change sign more than once, several rates can solve NPV = 0. The engine lists all the
  roots it brackets, reports the one nearest 0 %, sets `multipleRootsPossible`, and warns. A tangent (double) root
  without a sign change cannot be detected by bracketing, and this is a known limitation.

Tests: `xirr.test.ts`, which checks against closed-form two-flow rates and a published spreadsheet XIRR example.

## 11. NAV backtest (`navBacktest.ts`, `navSeries.ts`)

- **Cleaning.** Observations with invalid dates, or NAVs that are non-finite or ≤ 0, are dropped and counted.
  Duplicate dates are collapsed. When duplicates conflict, the last value wins and a warning is raised. The engine
  never interpolates or extrapolates a NAV.
- **Allocation rule.** Each instalment is scheduled on `sipDay`. A day past the end of a month is clamped to that
  month's last day, so 31 becomes 28 or 29 February. The instalment is allotted at the **first NAV on or after** the
  scheduled date, provided that NAV falls within `maxLagDays` (default 7). Otherwise the instalment is skipped and
  reported with its reason (`NO_NAV_WITHIN_LAG`, or `AFTER_END_DATE` when the next NAV falls after the valuation
  date). The optional `transactionCostPct`, such as stamp duty, reduces the amount converted to units. The expense
  ratio is already in the NAV and is not deducted again. Units can be rounded down to 3 or 4 decimals.
- **Inception guard.** A start date before the first observation returns `START_BEFORE_INCEPTION`.
- **Valuation / stale valuation.** The portfolio is valued at the last NAV on or before the end date. When that NAV is
  more than 7 days older than the end date, the engine warns and names the actual valuation date.
- XIRR is computed on dated flows: outflows on allotment dates and the valuation on the valuation date.
- **Plan/option eligibility (0.2.0, `src/lib/data/eligibility.ts`).** The engine runs only on **Growth** options. IDCW
  NAVs drop on every payout, and Lakshya has no distribution history to add those payouts back, so the engine returns
  `UNSUPPORTED` with that explanation. An unidentified option is also refused. An unknown plan (Direct or Regular)
  is allowed with a warning.
- Simulated allotment dates are an approximation. Real allotment also depends on cut-off times, payment realisation,
  and RTA processing.

## 12. Drawdown and TWR (`drawdown.ts`)

Drawdown is measured on the **NAV/price series**, or on a unitised time-weighted index. It is never measured on a
balance that contributions push upward (AUDIT §4.8). `maxDrawdown` returns the peak, the trough, and the first recovery
index, or `null` if the peak is never regained. `timeWeightedIndex` chains `(V_t − C_t)/V_{t−1}`, where `C_t` is
the external flow that arrived at the end of period t.

## 13. Rolling returns (`rolling.ts`)

Each window starts on the first observation of a calendar month. It ends on the last observation on or before
start + N years. A window whose end observation is more than `toleranceDays` (7) before the target date is dropped,
never interpolated. CAGR = `(NAV_end/NAV_start)^(365/days) − 1`. The statistics are min, median, max, positive share,
and count. Data-cleaning warnings are passed through (a fix in this review).

## 14. Booster attribution (`booster.ts`)

The engine compares three strategies on the same series and schedule:
- **base**: a level SIP.
- **booster**: the SIP × a multiplier when the NAV is below its running peak by the rule threshold. The peak uses
  observations up to the allotment date only, with no look-ahead. It includes history before the start date, because
  an investor can see that history.
- **comparable**: the base SIP plus the booster's total extra capital spread evenly. This isolates timing from simply
  investing more money. It knows the total in advance, so it is an attribution device, not a strategy.
`timingEffect` = booster − comparable. `totalDifferenceVsBase` includes the effect of the extra money. When the series
is synthetic, the report says "Synthetic simulation".

## 15. Income tax (`tax/`)

- **Scope.** Resident individuals, comparing the old and new regimes. The engine covers slab tax, the standard
  deduction (salary only), 80C, 80CCD(1B), and 80D (self and parents, with senior limits), the s.87A rebate including
  new-regime marginal relief, and 4 % cess.
- **Exclusions.** These are listed in `config.ts` and printed in exports: surcharge (incomes above ₹50 lakh are
  refused), special-rate income (capital gains and similar), other deductions and exemptions, non-resident, HUF and
  corporate taxpayers, and the rounding of total income under s.288A. Capital gains on mutual-fund redemptions are estimated separately (§18).
- **Verification process.** Each financial year has a `status`. Only `verified` years produce estimates. To verify a
  year: (1) check slabs, rebate, standard deduction and limits against the primary text (the Finance Act and the
  Income Tax Department pages); (2) record the sources and who checked them, and when, in `verification`;
  (3) get owner review; (4) add tests with hand-computed liabilities at the slab boundaries.
  **FY 2025-26** is verified (2026-10-17). **FY 2026-27** was checked against the primary texts on 2026-10-17: the
  Finance Act, 2026 (No. 4 of 2026; eGazette) and the Income-tax Act, 2025 as amended by it. The references are
  s.202(1) slabs, s.156 rebate, s.19(1) standard deduction, ss.123, 124(3) and 126 limits, First Schedule Part I-B
  Paragraphs A and F, and s.3(15) cess. All values are unchanged from FY 2025-26. The year carries
  `pendingOwnerApproval: true` and stays `unverified` (disabled). **Owner action:** review `verificationEvidence` in
  `tax/config.ts`, then set `status: 'verified'` and `pendingOwnerApproval: false`.

## 16. Report payloads (`src/lib/export/reportBuilders.ts`, added in 0.2.0)

There is one builder per calculator. Builders arrange the values the engine returned and **never recalculate**.
Inputs are re-parsed only to show resolved defaults. Every report carries assumptions, conventions, provenance (for
historical data), the summary, the tables, the methodology label (Projection / Historical data / Synthetic
simulation), engine warnings, the disclaimer, and the attribution. All text passes through the formula-injection
guard.

## 17. Life-stage & Risk Planner (`lifeStage.ts`, `lifeStageConfig.ts`, `lifeStageStress.ts`; added in 0.3.0)

**Mandatory notice.** The UI must show this text with every result. The constant is `LIFE_STAGE_NOTICE`:

> Educational illustration only. This is not a suitability assessment, not investment advice, and not a recommendation
> of any product, fund or allocation. Lakshya is not registered with SEBI as an investment adviser or research analyst.
> The scores and ranges come from a fixed, published rule applied to the answers you gave; they do not consider your full
> financial situation and do not predict returns. For personalised advice, consult a SEBI-registered investment adviser.

The planner names no funds or products. It predicts no returns, does not describe anything as "best" or "optimal",
and is not AI. It uses no proprietary third-party method. Every weight, threshold and table is in
`lifeStageConfig.ts` (`LIFE_STAGE_CONFIG`, version `lakshya-life-stage-2026-10-17`). These are **Lakshya's own
documented educational rule**, not a regulator's or a firm's. A caller can pass an edited copy. That copy is
validated first: the weights of each score must sum to 100, ranges must have min ≤ max, and every profile must have
exactly one band. An invalid table is rejected and never used.

**Risk capacity** is objective, scored 0–100, and is the sum of five factors:

| Factor | Input | Points |
|---|---|---|
| Horizon (max 30) | years | ≥15: 30 · ≥8: 23 · ≥5: 15 · ≥3: 8 · <3: 0 |
| Dependants per earner (max 20) | dependants ÷ earners | 0: 20 · ≤1: 15 · ≤2: 10 · ≤3: 5 · more: 0 · no earners: 0 |
| Income stability (max 20) | answer | salaried-stable 20 · salaried-variable 12 · self-employed 10 · irregular 0 |
| EMI ÷ income (max 15) | % | 0: 15 · ≤20: 12 · ≤35: 7 · ≤50: 3 · more: 0 · no income: 0 |
| Emergency cover (max 15) | months held ÷ **user's own** target | ≥1: 15 · ≥0.5: 8 · >0: 3 · 0: 0 |

**Risk tolerance** is subjective, scored 0–100, and comes from two answers. The first is the reaction to a 20% fall:
sell all 0, sell some 20, hold 50, invest more 70 (max 70). The second is investing experience: none 0, under 3
years 12, 3–10 years 22, over 10 years 30 (max 30). Each factor is returned with its points, its maximum, and a
plain-language explanation.

**Profile.** The overall score is `min(capacity, tolerance)`. Bands: ≥85 high growth, ≥65 growth-oriented,
≥45 balanced, ≥25 moderately conservative, otherwise conservative. Using the lower of the two scores is Lakshya's
documented rule. It applies the conservative choice whenever ability and willingness disagree. We looked for a
public primary source (for example, CFA Institute material) that states this rule in those words and could not
verify one, so no source is cited.

**Prerequisites** are evaluated before any range:
- Emergency fund below the user's target: flag only by default.
- EMIs above 40% of income: flag only.
- No earning member: equity capped at 20% in today's range.
- Horizon under 3 years: equity capped at 10% in today's range.
- Essentials plus EMIs above income: flag only.

All the caps are in the config, and a `null` cap means the condition is flagged but no cap is applied. When several
caps apply, the tightest one is used.

**Ranges.** Each profile has an editable equity range and gold range (min–max %). Debt is the remainder:
`[max(0, 100 − equity.max − gold.max), 100 − equity.min − gold.min]`. The output is a range, not a point and not a
target.

**Glide path.** The glide path has one row per age, from the current age to the plan-until age. That age defaults to
retirement + 15 and is capped at 110. Each row caps the equity maximum by years to retirement: ≥15 years no extra
cap, ≥10 years 70%, ≥5 years 55%, ≥1 year 40%, and from the retirement age onwards 30%. The equity minimum is capped
at the same level. Because the cap never rises with age, the equity range never widens and the debt minimum never
falls. Tests check this monotonicity. Today's range is the first row of the glide path with the prerequisite caps
then applied. The glide path itself carries no prerequisite caps, because those describe today's situation.

**Optional PFRDA reference curve** (`includePfrdaReference: true`). This is the equity share by age of PFRDA's NPS
Auto Choice life-cycle funds: LC75 High (15E/55Y), LC50 Moderate (10E/55Y), LC25 Low (5E/55Y), and LC Aggressive
(35E/55Y). The values are quoted from the "Asset Allocation in Auto Choice" table at
https://pfrda.org.in/intermediaries/registered-intermediaries/pension-funds and were **verified on 2026-10-17**
against a live copy of that page. The published table runs from "up to 35 years" through 55. After 55, Lakshya
holds the age-55 value constant, which follows the "…/55Y" fund names; this is not a row of PFRDA's table. The curve
is shown for comparison only. It is one product's rule, not a recommendation. Re-verify it whenever PFRDA revises
the scheme structure (the funds were last renamed by PFRDA circular in 2025).

**Stress test** (`stressTestRange`). It finds the largest peak-to-trough fall in an equity NAV or index series
**supplied by the caller**. An optional window can restrict the search. Debt and gold series, when supplied, are
measured over the same dates, using the last observation on or before the peak and the trough. Without a usable
series, an asset is assumed unchanged; it is listed in `assumedUnchanged` and a warning is raised. The test applies
the result to two mixes: equity at the range minimum and at the maximum, gold at the midpoint of its range, and debt
taking the remainder. It reports the percentage change and, optionally, the change in rupees. There are no
hard-coded crash figures. The result describes one observed past fall, not a forecast.

**Supported domain.** Ages 18–100, with retirement strictly after the current age (early retirement is allowed).
The plan-until age goes up to 110. Up to 20 dependants and 20 earners. The emergency-fund target is 1–36 months and
the horizon 0–60 years. Tests: `tests/finance/lifeStage.test.ts`. These cover hand-added factor scores, every table
boundary, band edges (85 → high growth, 78 → growth), retirement ≤ current age and other invalid inputs, the
prerequisite flags and caps, glide-path rows derived by hand, monotonicity, determinism, edited and invalid configs,
the PFRDA mapping, the notice and forbidden wording, the stress test, and the report payload.

## 18. Capital gains on mutual-fund redemptions (`tax/capitalGains.ts`, `tax/capitalGainsConfig.ts`; added in 0.4.0)

**Mandatory notice.** The UI must show this text with every result. The constant is `CAPITAL_GAINS_NOTICE`:

> Educational estimate only, for resident individuals redeeming Indian mutual-fund units. It is not tax advice. It applies
> only the rules listed, each checked against the source shown, and leaves out surcharge, loss set-off and carry-forward, the
> basic-exemption adjustment, the s.87A rebate and the other items listed. Your actual tax depends on your full return. Check
> with a qualified tax professional or the Income Tax Department before filing. Lakshya is not registered with SEBI as an
> investment adviser.

This module is separate from income tax. Gains taxed at slab rates use the **marginal slab rate the user enters**, which
must be one of 0, 5, 10, 15, 20, 25 or 30 %. The module never computes income tax itself.

**Rules encoded for FY 2025-26.** Each rule was read from a live copy of the source on 2026-10-17. Every result lists the
rules it used, with their URLs.

| Rule | Encoded value | Primary source |
|---|---|---|
| Equity-oriented fund units: long-term if held **more than 12 months** | 12 | incometaxindia.gov.in — Tax on long-term capital gains |
| Other units: long-term if held **more than 24 months** (36 before 23-07-2024) | 24 | same |
| STCG on equity-oriented units, s.111A (transaction chargeable to STT) | 20 % (15 % before 23-07-2024) | incometaxindia.gov.in — Tax on short-term capital gains |
| LTCG on equity-oriented units, s.112A, above the annual exemption | 12.5 % above ₹1,25,000 (10 % before 23-07-2024) | Tax on long-term capital gains |
| Grandfathering, units acquired before 1-2-2018 | cost = max(actual, min(FMV 31-1-2018, sale value)); for unlisted units FMV = NAV on 31-1-2018 | Tax on long-term capital gains |
| STT on the sale of equity-oriented units to the Mutual Fund | 0.001 % (seller), so the STT condition is met | Finance (No. 2) Act 2004, s.98 (incometaxindia.gov.in) |
| Specified Mutual Fund units acquired on or after 1-4-2023 | deemed STCG, slab rate, any holding period | Income-tax Act s.50AA (incometaxindia.gov.in) |
| Other LTCG, s.112 | 12.5 %, **no indexation** for transfers on or after 23-07-2024 | Tax on long-term capital gains |
| Other STCG (not s.111A) | slab rate ("normal rate") | Tax on short-term capital gains |
| Health and education cess | 4 % of tax | the verified FY 2025-26 income-tax config |

**Specified Mutual Fund definition.** The definition depends on the date. Before 1-4-2026, it is a fund with at most
35 % of its proceeds in domestic equity. From 1-4-2026, as substituted by the Finance (No. 2) Act 2024, it is a fund
with more than 65 % in debt and money-market instruments, or a fund with 65 % or more in such funds. The user chooses the
fund type; `FUND_TYPE_EXPLANATIONS` explains each type, and the AMC's statement shows the classification. Lakshya does not
classify schemes itself.

**Method.**
1. **FIFO.** The oldest lot is matched first, which is what the registrars (RTAs: CAMS and KFintech) apply to
   redemptions. Lots with the same date keep the order in which they were entered.
2. **Holding period.** "More than N months" means the redemption date falls *after* the date N calendar months after
   purchase. A day past the end of the month is clamped, so 29 Feb + 12 months is 28 Feb. Holding exactly 12 months is
   therefore short-term. This is how Lakshya reads "more than"; edge days can be argued, so check them against your AMC
   statement.
3. **Classification of each slice.**
   - Equity-oriented: long → s.112A, short → s.111A.
   - Specified, acquired on or after 1-4-2023 → s.50AA at slab rate.
   - Specified, acquired earlier, or other: long → s.112, short → slab rate.
4. **Grandfathered cost.** This applies to equity units acquired before 1-2-2018. The NAV on 31-1-2018 must be
   supplied; without it the module returns `INVALID_INPUT` and never approximates the value.
5. **Netting.** Gains are netted within each treatment, for this redemption only. A net loss is taxed at zero, with a
   warning. Set-off across treatments and carry-forward are not modelled.
6. **s.112A exemption.** Available = max(0, ₹1,25,000 − s.112A LTCG already realised this year). The amount used is
   min(available, net s.112A gain).
7. **Tax.** Tax is the taxable amount × the rate for each component. Cess is 4 % of their sum. The result is not rounded.

**Disabled paths. These are never estimated.**
- **FY 2026-27** returns `UNVERIFIED_RULES`. That year falls under the Income-tax Act 2025 and the Finance Act 2026,
  which have not been checked.
- **Other financial years** return `UNSUPPORTED`. FY 2024-25 is split by the 23-07-2024 change and is not encoded.
- **Exchange-listed units of non-equity funds** (for example some ETFs) return `UNVERIFIED_RULES`. Their holding
  period could not be confirmed from a primary-source page.

**Exclusions.** These are listed in the config and printed in exports:
- surcharge;
- STT and stamp-duty amounts;
- loss set-off and carry-forward;
- the unexhausted basic-exemption adjustment and the s.87A rebate;
- non-residents, TDS, HUFs;
- IDCW, switches, bonus units and segregated portfolios;
- ELSS lock-in (a warning only);
- grandfathering without the FMV;
- rounding under ss.288A and 288B;
- listed non-equity units.

Tests: `tests/finance/capitalGains.test.ts`. The cases are worked by hand: FIFO across a long lot and a short lot
(total ₹19,370), the exemption already used elsewhere, input-order independence, and the Income Tax Department's own
grandfathering illustration (gain ₹1,40,000 → taxable ₹15,000 → ₹1,875 + cess). The tests also cover the three
branches of the grandfathering rule; the 12- and 24-month boundaries, including 29 Feb; s.50AA before and after
1-4-2023; slab versus s.112; losses; ELSS; total-cost input; the disabled paths and invalid inputs; and sources on
every rule.
