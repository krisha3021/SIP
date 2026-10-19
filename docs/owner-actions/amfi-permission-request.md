# Owner action: ask AMFI for written permission to reuse NAV, TER and AAUM data

**Status:** draft. **Not sent.** Only the owner (Alok Shukla) should send it.

**Why it is needed:** AMFI's Terms of Use (https://www.amfiindia.com/terms-of-use, read 2026-10-17) say:
- permitted use is "for your personal and non-commercial use only";
- "You may not publicly … display, transmit, publish … or create derivative works";
- "You shall not store electronically any significant portion of any part of the Site";
- "No other use … is authorised unless you and we have agreed otherwise in writing".

Lakshya would publicly display NAVs, TER and average AUM. MFAPI's NAVs are AMFI data too.

**Until written permission arrives:**
- The AMFI TER and AAUM adapters stay disabled (`AMFI_REUSE_APPROVED` gate).
- Public display of MFAPI NAV data should be treated as pending as well.

**Contact route:** use the "Contact Us" page on https://www.amfiindia.com/. Check it for a current email address or
postal address before sending.

---

**Subject:** Request for written permission to display AMFI NAV, TER and average AUM data on an educational website

Dear Sir/Madam,

I am Alok Shukla, the developer of **Lakshya**, a free, educational website that helps Indian investors understand
mutual-fund investing through calculators and historical NAV analysis. Lakshya does not sell, distribute or recommend
schemes, and is not a SEBI-registered intermediary.

Your Terms of Use allow personal, non-commercial use and ask for written agreement for any other use. I request
written permission to:

1. **Display** scheme NAVs (from NAVAll.txt and NAV history), the Total Expense Ratio of Direct and Regular plans with
   its effective date, and scheme-wise average AUM with its reporting quarter, on public pages of Lakshya. Each item
   would show "Source: AMFI" and its date, and the site would never present a value as current when it is not.
2. **Store** these values server-side for caching and data-quality checks. The cache would be refreshed from AMFI and
   never altered or estimated.
3. **Include** these values in CSV/XLSX downloads of a user's own calculation, with the source and date.

I will follow any attribution, frequency or scope conditions you set, and will stop any use you do not permit. Please
let me know if a different arrangement or licence is required.

Yours faithfully,
Alok Shukla
Lakshya — <site URL> · <contact email>
