# Owner action: ask MFAPI for permission to display, cache and export NAV data

**Status:** draft. **Not sent.** Only the owner (Alok Shukla) should send it, from their own account.

**Why it is needed (checked 2026-10-17):**
- mfapi.in publishes no terms of service or licence. Its footer "Terms of Service" link points to `#`.
- The footer says "© 2025 MFapi.in. All rights reserved."
- The home page says "no rate limiting", but the documentation says the API "implements rate limiting".
- See docs/DATA-SOURCES.md §MFAPI for the full findings.

**Published contact routes** (no email address is listed):
- Telegram: https://t.me/mfapi_in
- X/Twitter: https://twitter.com/SkyRocknRoll
- LinkedIn: https://www.linkedin.com/in/yuvarajl/

**Also needed:** MFAPI republishes AMFI data, so AMFI's own permission is needed as well. See
`amfi-permission-request.md`. MFAPI's permission alone does not cover AMFI's rights.

---

**Subject:** Permission request: displaying and caching MFAPI NAV data on an educational site (Lakshya)

Hello,

My name is Alok Shukla. I am building **Lakshya**, a free, educational website for Indian investors. It offers SIP and
goal calculators, and historical NAV analysis such as backtests and rolling returns. It is not a broker or adviser and
does not sell or recommend products. I would like to use MFAPI and want to be sure I do so on terms you are happy with.

May I have your permission for the following?

1. **Display.** Show NAV values and scheme names fetched from `api.mfapi.in` on public pages, with a visible credit
   ("NAV data via MFAPI.in, republishing AMFI data") and a link to mfapi.in.
2. **Caching.** Keep a server-side copy of each scheme's NAV history for up to about 6 hours, plus a last-known-good
   copy used only when your API is unavailable. The copy is always shown with its observation date and never labelled
   as live.
3. **Exports.** Let users download their own calculation results as CSV/XLSX, including the NAV rows used in that
   calculation.
4. **A daily validation job.** Run one scheduled job a day that requests about 15 schemes, at a concurrency of 2 with at
   most 2 retries.

Could you also tell me:
- whether there is a rate limit, and what it is, so that I can stay well within it;
- how you would like MFAPI to be credited;
- whether any of the above is not permitted, or needs a different arrangement, for example a paid or commercial
  licence.

I will not use the data commercially without asking you first, and I will stop any use you are not comfortable with.

Thank you for running MFAPI.

Alok Shukla
Lakshya — <site URL> · <contact email>
