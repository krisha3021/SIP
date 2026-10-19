# Legal page drafts (owner to complete and have reviewed)

Status: **DRAFT**. These texts describe what Lakshya does today (checked 2026-10-17 against the code and the live
deployment). They are not legal advice. Before public launch, the owner must fill every placeholder and have a qualified
professional review the final text.

The live pages are `/privacy`, `/terms` and `/disclaimer`. Their text is in `src/app/privacy/page.tsx`,
`src/app/terms/page.tsx` and `src/app/disclaimer/page.tsx`. Keep this file and the pages in sync.

## How to complete
1. Fill each value in `OWNER_DETAILS` in `src/features/legal/ui/ownerDetails.tsx`. Do not invent any value; use only details
   the owner provides.
2. After the professional review, set `reviewed: true` there.
3. The banner "Draft — owner to complete and have reviewed before launch" disappears only when every value is set **and**
   `reviewed` is true. Until then, each missing value shows as `[OWNER TO SUPPLY: …]`.

| Placeholder | Used on | Notes |
|---|---|---|
| `legalName` | Privacy, Terms, Disclaimer | Individual's name or registered entity operating the site |
| `postalAddress` | Privacy | Address for notices and grievances |
| `contactEmail` | all three | Monitored mailbox |
| `grievanceOfficer` | Privacy | Name and contact, if required |
| `logRetention` | Privacy | Check the Vercel plan's log retention and state it |
| `liabilityClause` | Terms | Final liability wording, from the professional review |
| `governingLaw` | Terms | e.g. "the laws of India" — owner/counsel to confirm |
| `jurisdiction` | Terms | Courts and city |
| `effectiveDate` | all three | Date the final text takes effect |

Facts the drafts rely on (re-check them if the site changes):
- There are no accounts, no sign-in and no forms that collect contact details.
- Calculators run in the browser, and inputs are not sent to the server.
- Saved plans (`lakshya:plans:v1`) and the theme (`lakshya:theme`) are stored in localStorage only.
- Share links omit income, expenses, EMIs, dependants, earners, savings, existing holdings and tax inputs.
- Fund search text and scheme codes go to our `/api/funds/*` routes, which call MFAPI.in.
- No cookies are set, and there are no analytics, tracking or advertising scripts. Fonts are self-hosted.
- The site is hosted on Vercel, which handles request logs. The fund API keeps a per-IP rate-limit counter in memory.

---

## Privacy notice (draft)

Effective date: [OWNER TO SUPPLY: effective date].

**Who runs Lakshya.** Lakshya is operated by [OWNER TO SUPPLY: legal name or entity], [OWNER TO SUPPLY: postal address].
Contact: [OWNER TO SUPPLY: contact email]. Grievance officer: [OWNER TO SUPPLY: grievance officer name and contact].

**What happens to the information you enter.**
- **No accounts.** There is no sign-up or sign-in, and we do not ask for your name, phone number or email.
- **Calculators run in your browser.** The amounts, ages and other assumptions you type are processed on your device.
  They are not sent to our server.
- **Saved plans** and your light/dark theme choice are stored in your browser's localStorage. They never leave your
  device. You can delete them on the Saved Plans page or by clearing this site's data in your browser.
- **Share links** contain only non-sensitive assumptions, such as return rates, horizons and conventions. They never
  contain income, expenses, loan EMIs, dependants, earning members, savings, existing holdings, or income-tax inputs.
  Anyone you send a link to can read what is in it.
- **Downloads** (CSV/Excel) and printouts are created on your device and can include everything you entered. We do not
  receive a copy.
- **Fund search and NAV data.** When you search for a fund or open a scheme, your search text or scheme code is sent to our
  server, which requests public NAV data from MFAPI.in, an independent third-party service that republishes AMFI data.
  MFAPI.in receives the search text or scheme code, not who you are.

**Cookies, analytics and advertising.** Lakshya sets no cookies and includes no analytics, tracking or advertising
scripts. Fonts are served from our own domain.

**Hosting logs.** The site is hosted on Vercel. Like most hosts, Vercel processes technical request data (such as IP
address, browser user agent, the page or API path requested and the time) to deliver the site, protect it from abuse and
help us diagnose errors. Our API applies a per-IP rate limit kept briefly in memory. Log retention follows Vercel's plan
settings: [OWNER TO SUPPLY: log retention period, from the Vercel plan]. Requests may be processed in data centres in and
outside India.

**Your rights.** Because Lakshya does not keep accounts or store what you type, there is usually no personal data of yours
on our systems beyond short-lived hosting logs. You may contact us at [OWNER TO SUPPLY: contact email] about any privacy
question, including rights you may have under applicable law such as India's Digital Personal Data Protection Act, 2023.

**Changes.** If this notice changes, the new version will be posted here with a new effective date.

---

## Terms of use (draft)

Effective date: [OWNER TO SUPPLY: effective date]. These terms are between you and [OWNER TO SUPPLY: legal name or
entity] ("we"), which operates Lakshya.

1. **What Lakshya is.** Lakshya is a free, educational website with investment calculators and mutual-fund research tools
   for India. It is not a SEBI-registered investment adviser or research analyst. Nothing on the site is investment, tax,
   legal or financial advice, a recommendation to buy, sell or hold any security or scheme, or a suitability assessment.
   Read the Disclaimer.
2. **Using the site.** You can use the site without an account. You are responsible for the assumptions you enter and for
   any decision you make. Do not try to disrupt the site, bypass its rate limits, scrape it at volume, or use its API routes
   as a data feed. We may change, suspend or withdraw any feature at any time.
3. **Results and data.** Calculator results are projections based entirely on the assumptions you enter, and actual
   results will differ. Fund NAV data comes from MFAPI.in, an independent third party that republishes AMFI data. It may
   be delayed, incomplete or wrong; we show the date of each observation and never call it live. Tax estimates cover only
   the cases and rules shown on the calculator, for financial years marked as verified. We do not guarantee that the site
   is accurate, complete, available or error-free.
4. **Your content.** Saved plans stay in your own browser. Share links contain only the non-sensitive assumptions shown
   on the page, and you choose whom to send them to.
5. **Intellectual property.** The site's design, text and code belong to [OWNER TO SUPPLY: legal name or entity].
   Lakshya was created by Alok Shukla. Third-party data remains subject to its providers' terms.
6. **Liability.** To the extent the law allows, we are not liable for any loss arising from use of, or reliance on, the
   site or its results. [OWNER TO SUPPLY: final liability wording, reviewed by a qualified professional]
7. **Governing law.** These terms are governed by [OWNER TO SUPPLY: governing law]. Courts at [OWNER TO SUPPLY:
   jurisdiction (city / courts)] have jurisdiction.
8. **Contact and changes.** Questions: [OWNER TO SUPPLY: contact email]. If these terms change, the new version will be
   posted here with a new effective date.

---

## Disclaimer (draft)

The page opens with the engine's `DISCLAIMER` constant (from `@/contracts`):

> Educational estimate only. Not investment, tax or legal advice. Past performance does not indicate future results.
> Projections depend entirely on the stated assumptions. Lakshya is not a SEBI-registered investment adviser or research
> analyst.

**Educational use only.**
- Lakshya is not registered with SEBI as an investment adviser or research analyst, and does not give personalised advice.
- No page recommends, rates or ranks any fund, product or allocation. Lakshya shows no star ratings.
- The Life-stage & Risk Planner and the Allocation Explorer are educational illustrations of a published rule. They are
  not suitability assessments. For personalised advice, consult a SEBI-registered investment adviser.

**Projections and models.**
- Projections assume constant returns unless a page says otherwise. Real returns vary, and can be negative.
- Monte Carlo percentages describe a simplified model, not the probability of a real-world outcome.
- A stress test shows one fall observed in past data. Future falls can be larger or last longer.

**Data.**
- NAV data comes from MFAPI.in, an independent third party that republishes AMFI data. It may contain errors or gaps.
  Past performance does not indicate future results.
- There is no live market data on this site.
- Tax estimates cover only the cases and rules listed on the calculator, for verified financial years.

Questions: [OWNER TO SUPPLY: contact email]. Operated by [OWNER TO SUPPLY: legal name or entity]. Effective date:
[OWNER TO SUPPLY: effective date].
