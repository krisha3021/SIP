# Owner action: proposed approved-scheme list for the daily data-quality task

**Status:** proposal. `src/lib/automation/tasks/approved-schemes.json` is **unchanged** until the owner approves.
Prepared and verified on 2026-10-17 by Agent 2.

## Selection rule (neutral, reproducible, not performance-based)
1. **Source:** AMFI's daily NAV file, https://portal.amfiindia.com/spages/NAVAll.txt (Last-Modified Sat, 17 Oct 2026
   14:54 GMT). It is used privately to make the selection; nothing from it is published.
2. **Eligible rows:** `Plan = "Direct Plan"`, `Option` is Growth (`Growth`, `Growth Option`, `(Growth)` or `Growth
   Plan`), and the NAV is dated within 5 days of the newest date in the file, so the scheme is active.
3. **Categories:** AMFI's own category headers. AMFI currently publishes two naming styles side by side, for example
   "Debt Scheme - Short Duration Fund" and "Income/Debt Oriented Schemes - Short Term Fund", and both are included.
   - The Nifty 50 index row is limited to AMFI index-fund categories whose name contains "Nifty 50". Next 50,
     equal-weight, factor and other variants are excluded.
   - The gold row is limited to domestic fund-of-funds whose name contains "Gold" and not "Silver", "Multi" or "Asset".
4. **Pick:** within each category, the eligible scheme with the **lowest AMFI scheme code**. This is a fixed, verifiable
   tie-breaker that roughly follows code registration order. It **ignores returns, ratings, AUM and expense ratios**,
   and it is not a judgement of quality or suitability.
5. **Live check on MFAPI:** each code was fetched from `https://api.mfapi.in/mf/<code>` on 2026-10-17. For every pick:
   - the scheme name states "Direct Plan" and Growth;
   - the ISIN matches AMFI's file;
   - the fund house is recorded;
   - the start and end of the history are noted.

**Disclosure:** the lowest-code rule concentrates picks in AMCs that registered Direct-plan codes early. The counts are
Canara Robeco Mutual Fund 5, Franklin Templeton Mutual Fund 3, Quantum Mutual Fund 3, Nippon India Mutual Fund 1, Bandhan Mutual Fund 1. If the owner prefers a spread across AMCs, one documented
alternative is "lowest code, at most one scheme per AMC, categories processed in the order listed". That is the owner's
choice, and this proposal does not apply it.

**Liquid / short-duration / corporate-bond funds** are Specified Mutual Funds for capital-gains purposes (s.50AA). That
does not affect NAV validation or Growth-option backtests.

## Proposed schemes (13), all Direct Plan, Growth option

| Category | AMFI code | Name at MFAPI | Fund house | ISIN (growth) | First NAV at MFAPI | Latest NAV at MFAPI | Eligible schemes in category |
|---|---|---|---|---|---|---|---|
| Large Cap | 118269 | Canara Robeco Large Cap Fund - Direct Plan - GROWTH OPTION | Canara Robeco Mutual Fund | INF760K01FR2 | 02-01-2013 | 16-10-2026 | 33 |
| Flexi Cap | 118275 | Canara Robeco Flexi Cap Fund - Direct Plan - GROWTH OPTION | Canara Robeco Mutual Fund | INF760K01EF0 | 02-01-2013 | 16-10-2026 | 44 |
| Large & Mid Cap | 118278 | Canara Robeco Large and Mid Cap Fund - Direct Plan - GROWTH OPTION | Canara Robeco Mutual Fund | INF760K01EI4 | 02-01-2013 | 16-10-2026 | 35 |
| Multi Cap | 118650 | Nippon India Multi Cap Fund - Direct Plan - Growth Option | Nippon India Mutual Fund | INF204K01XF9 | 02-01-2013 | 16-10-2026 | 31 |
| Mid Cap | 118533 | Franklin India Mid Cap Fund - Direct Plan - Growth | Franklin Templeton Mutual Fund | INF090I01FH9 | 01-01-2013 | 16-10-2026 | 32 |
| Small Cap | 118525 | Franklin India Small Cap Fund - Direct Plan - Growth | Franklin Templeton Mutual Fund | INF090I01IQ4 | 01-01-2013 | 16-10-2026 | 35 |
| ELSS | 111549 | Quantum ELSS Tax Saver Fund - Direct Plan - Growth Option | Quantum Mutual Fund | INF082J01069 | 31-12-2008 | 16-10-2026 | 37 |
| Index fund - Nifty 50 | 118482 | BANDHAN Nifty 50 Index Fund - Direct Plan - Growth | Bandhan Mutual Fund | INF194K012A8 | 02-01-2013 | 16-10-2026 | 24 |
| Aggressive Hybrid | 118272 | Canara Robeco Aggressive Hybrid Fund - Direct Plan - GROWTH OPTION | Canara Robeco Mutual Fund | INF760K01EZ8 | 02-01-2013 | 16-10-2026 | 31 |
| Liquid | 103734 | Quantum Liquid Fund - Direct Plan - Growth Option | Quantum Mutual Fund | INF082J01127 | 09-04-2006 | 15-10-2026 | 42 |
| Short Duration | 118320 | Canara Robeco Short Term Fund - Direct Plan - GROWTH OPTION | Canara Robeco Mutual Fund | INF760K01DX5 | 02-01-2013 | 16-10-2026 | 24 |
| Corporate Bond | 118569 | Franklin India Corporate Bond Fund - Direct Plan - Growth | Franklin Templeton Mutual Fund | INF090I01FW8 | 01-01-2013 | 16-10-2026 | 20 |
| Gold fund of funds | 115132 | Quantum Gold ETF FOF - Direct Plan - Growth Option | Quantum Mutual Fund | INF082J01150 | 25-05-2011 | 16-10-2026 | 22 |

Notes:
- Quantum ELSS (from 2008), Quantum Liquid (from 2006) and Quantum Gold ETF FOF (from 2011) have NAV history from
  before January 2013, when separate Direct plans began. MFAPI files that earlier history under these Direct-plan
  codes. Lakshya has not verified how the pre-2013 NAVs relate to the Direct plan, so check this before relying on them.
- On 2026-10-17, MFAPI's latest NAV for Quantum Liquid Fund (15-10-2026) was behind AMFI's file, which already had
  NAVs dated Sunday 18-10-2026 for liquid funds. The daily task's stale check counts weekdays, so this lag is reported
  only if it exceeds the grace period.
- The two schemes already in the list (122639, 122640, PPFAS Flexi Cap Direct and Regular Growth) are
  kept. The Regular plan stays because it lets the task check Regular-plan identity too.

## Ready-to-apply configuration (for after approval)
Replace the `schemes` array in `approved-schemes.json` with the existing two entries plus the entries below. The
test `tests/data/approvedSchemesProposal.test.ts` checks that this block passes the same validation as the live config.

```json
{
  "version": 1,
  "schemes": [
    {
      "schemeCode": 118269,
      "nameContains": "Canara Robeco Large Cap Fund",
      "fundHouse": "Canara Robeco Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118275,
      "nameContains": "Canara Robeco Flexi Cap Fund",
      "fundHouse": "Canara Robeco Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118278,
      "nameContains": "Canara Robeco Large and Mid Cap Fund",
      "fundHouse": "Canara Robeco Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118650,
      "nameContains": "Nippon India Multi Cap Fund",
      "fundHouse": "Nippon India Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118533,
      "nameContains": "Franklin India Mid Cap Fund",
      "fundHouse": "Franklin Templeton Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118525,
      "nameContains": "Franklin India Small Cap Fund",
      "fundHouse": "Franklin Templeton Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 111549,
      "nameContains": "Quantum ELSS Tax Saver Fund",
      "fundHouse": "Quantum Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118482,
      "nameContains": "BANDHAN Nifty 50 Index Fund",
      "fundHouse": "Bandhan Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118272,
      "nameContains": "Canara Robeco Aggressive Hybrid Fund",
      "fundHouse": "Canara Robeco Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 103734,
      "nameContains": "Quantum Liquid Fund",
      "fundHouse": "Quantum Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118320,
      "nameContains": "Canara Robeco Short Term Fund",
      "fundHouse": "Canara Robeco Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 118569,
      "nameContains": "Franklin India Corporate Bond Fund",
      "fundHouse": "Franklin Templeton Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    },
    {
      "schemeCode": 115132,
      "nameContains": "Quantum Gold ETF FOF",
      "fundHouse": "Quantum Mutual Fund",
      "expectedPlan": "Direct",
      "expectedOption": "Growth"
    }
  ]
}
```

## What the owner must do
1. Review the rule and the list above. Optionally choose the one-per-AMC alternative.
2. Reply "approved", or give changes. Agent 2 then updates `approved-schemes.json` in a separate commit.
3. Public display of this data also depends on AMFI's and MFAPI's permissions. See `amfi-permission-request.md` and
   `mfapi-permission-request.md`.
