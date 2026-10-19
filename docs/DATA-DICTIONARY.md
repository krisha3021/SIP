# Data Dictionary & Field-Level Provenance Model

Version: contract 0.5.0 (2026-10-19). Code: `src/lib/data/fields.ts`, `src/lib/data/identity.ts`,
`src/lib/data/research/*`, `src/lib/data/provenance.ts`.

## 1. The `ProvenancedField` record
Every financial value on a fund page is one of these. An unavailable field has `value: null`, a `status` and a
`reason`. A placeholder value is never filled in.

| Property | Meaning |
|---|---|
| `value` | The value, or `null` |
| `unit` | `percent` (0–100, never a 0–1 fraction; at most 4 decimals) · `inr` · `inr-crore` · `inr-per-unit` · `count` · `date` (ISO) · `text` · `rating` |
| `currency` | `INR` for money units |
| `scheme_id` | AMFI scheme code (positive integer) |
| `plan_type` / `option_type` | `Direct`/`Regular`/`Unknown` and `Growth`/`IDCW`/`Unknown` |
| `scope` | `plan` (one plan and option) · `scheme` (whole scheme) · `scheme-aaum` (scheme quarterly average AUM, both plans) · `amc` (fund-house-wide) · `portfolio-disclosure` (as of a disclosure date) |
| `provider` | Who supplied the value |
| `source_url` | Where it came from |
| `observation_date` | The date the value refers to (TER effective date, AAUM period end, NAV date) |
| `published_at` | The provider's publication time, if it supplies one |
| `retrieved_at` | When Lakshya fetched it successfully |
| `license_or_usage_status` | `permitted` · `awaiting-permission` · `unlicensed` · `not-applicable` |
| `freshness_status` | `latest-nav` · `historical` · `stale` · `unavailable` … |
| `validation_status` | `valid` · `invalid` · `unvalidated` |
| `status` | `available` · `not-available` · `insufficient-history` · `blocked-licensing` · `not-configured` · `stale` |

**Guards** (`assertSamePlan`, `availableField`):
- They reject a field for another scheme.
- They reject a Regular-plan field on a Direct record, and Growth/IDCW mixing, for plan-scoped fields.
- They reject AMC-wide AUM in a scheme-AUM slot.
- They reject percents outside 0–100 or above source precision, negative money, and non-ISO dates.

## 2. Scheme identity (`SchemeIdentity`)
| Field | Source | Rule |
|---|---|---|
| `schemeId` | MFAPI `scheme_code` | Numeric |
| `schemeName`, `amc` | MFAPI `scheme_name`, `fund_house` | As published |
| `assetClass`, `subcategory` | MFAPI `scheme_category`, e.g. "Equity Scheme - Flexi Cap Fund" | Split on "Scheme -". Null if the pattern doesn't match. |
| `planType`, `optionType` | Parsed from the name suffix (`inferPlanOption`) | `Unknown`, never a guess |
| `isin`, `isinStatus` | MFAPI `isin_growth` / `isin_div_reinvestment` | ISO 6166 check digit verified; an invalid ISIN is not shown |

## 3. Research fields (`RESEARCH_FIELD_KEYS`)
| Key | Label | Unit / scope | Proper source | Status (2026-10-19) |
|---|---|---|---|---|
| `ter` | Total expense ratio | percent / plan | AMFI TER disclosure | **Blocked**: awaiting AMFI written permission (`AMFI_REUSE_APPROVED`) |
| `aaum` | Scheme average AUM | inr-crore / scheme-aaum | AMFI AAUM | **Blocked**, same reason. Labelled "average AUM for <quarter>", never "current" |
| `exitLoad`, `minInvestment`, `minSip` | — | text, inr / plan | SID/KIM | Not configured |
| `riskometer`, `benchmark` | — | text / scheme | SID, factsheet, monthly riskometer | Not configured |
| `inceptionDate` | — | date / plan | SID | Not configured. "First NAV in this dataset" is shown separately and is **not** the inception date. |
| `fundManagers`, `managerTenure` | — | text / scheme | SID, factsheet | Not configured |
| `holdings`, `sectorAllocation`, `assetAllocation`, `portfolioDisclosureDate` | — | portfolio-disclosure | AMC monthly portfolio files | Not configured (no unified feed). The official link is shown. |
| `rating` | Third-party rating | rating / plan | Licensed rating provider | Not configured. Shows "Rating unavailable", never zero stars. |

## 4. NAV dataset timestamps (`datasetTimestamps`)
| Field | Meaning |
|---|---|
| `dataAsOf` | Newest NAV date |
| `providerPublishedAt` | Provider's publication time. MFAPI does not supply one, so it is shown as "Not supplied by this provider". |
| `lastSuccessfulRetrieval` | Last successful upstream fetch. Never advanced by a failure. |
| `lastAttemptedRefresh` | Last upstream attempt, whether or not it succeeded |
| `freshness` | From the observation date only (`navFreshness`), never from page-load time |

The header clock ("Current time — IST") is the device clock. It is shown apart from all of these and implies nothing
about how fresh the data is.

## 5. Derived metrics (computed by Lakshya from NAVs)
| Metric | Engine | Definition |
|---|---|---|
| Point-to-point returns (1M–10Y, since first NAV) | `performanceMetrics` | Absolute under one year; ACT/365 CAGR from one year. A window is used only with a NAV within 7 days of its start; otherwise "Insufficient history". |
| Volatility | `performanceMetrics` | Sample SD of daily log returns × √252. Needs at least 60 returns. |
| Max drawdown | `performanceMetrics` | On the NAV itself, with peak, trough and recovery dates |
| Calendar-year returns | `performanceMetrics` | Complete years only |
| SIP XIRR | `backtestScheme` + `xirr` | Actual dated cash flows, ACT/365F |
| Rolling returns | `rollingReturnsForScheme` | See CALCULATION-METHODOLOGY §13 |
| Holdings overlap | `holdingsOverlap` | Σ min(weight A, weight B) over common ISINs. Unavailable without data or when disclosures are more than 31 days apart; "partial" below 95% coverage. |
