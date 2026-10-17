# Owner actions

Everything left for the site owner, in one place. Each item has exact steps. None of them can be done by the
agents, because each needs the owner's own account, details or approval. Live site: https://sip-three-zeta.vercel.app.

| # | Action | Blocks | Status |
|---|---|---|---|
| 1 | Set `CRON_SECRET` in Vercel | Daily data-quality job (returns 401 until set) | To do |
| 2 | Choose and connect storage | Persisted run history and last-known-good NAVs | To do: Upstash Free recommended |
| 3 | Approve FY 2026-27 tax rules | Enabling FY 2026-27 in the tax calculator | To do |
| 4 | Get MFAPI permission | Public launch (display, caching, exports of NAV data) | To do |
| 5 | Approve the scheme list | Which schemes the daily job validates | To do |
| 6 | Complete the legal pages | Public launch (Privacy, Terms, Disclaimer, About, Contact) | Drafts ready |

---

## 1. Set `CRON_SECRET` in Vercel
1. Generate a secret of at least 32 random characters on your own computer:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. In Vercel, go to **Project → Settings → Environment Variables → Add**. Name: `CRON_SECRET`. Value: the secret.
   Environment: **Production** only. Save it, and do not share it or commit it anywhere.
3. Optionally, add `MF_VALIDATION_DISABLED` = `false` (set `true` later to pause the job without a deploy).
4. **Deployments → latest Production → Redeploy.** Vercel Cron then calls `/api/cron/validate-mf-data` once a day at
   02:30 UTC (08:00 IST), as set in `vercel.json`.
5. Check it works:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://sip-three-zeta.vercel.app/api/cron/validate-mf-data
   ```
   This should print `401`. Then run it with the header:
   `curl -H "Authorization: Bearer <secret>" https://sip-three-zeta.vercel.app/api/cron/validate-mf-data`.
   It should return JSON with `"task": "validate-mf-data"`.

## 2. Choose and connect storage
Read [storage-options.md](storage-options.md), which compares the free tiers with dates and sources. The recommended
option is Upstash Redis Free. The adapter is already built and switches on by itself.
1. In Vercel, go to **Storage → Create Database → Upstash (Redis)**. Choose the **Free** plan and the region nearest your
   function region, and connect it to this project.
2. Redeploy. `GET /api/health` should then show `"sharedCacheConfigured": true`.
3. To undo it, remove the Upstash environment variables and redeploy.

## 3. Approve FY 2026-27 tax rules
FY 2026-27 is listed but **disabled** in the tax calculator until it is verified.
1. Ask Agent 2 (finance & data) to verify the FY 2026-27 slabs, rebate, standard deductions and limits against the
   Finance Act 2026 text and the Income Tax Department pages. Agent 2 records sources and the date in
   `src/lib/finance/tax/config.ts`.
2. Review the comparison yourself, or with a tax professional.
3. Only then reply "approve FY 2026-27 tax rules". Agent 2 changes `status` to `'verified'` in a PR with tests, and the
   year becomes selectable.

## 4. Get MFAPI permission
MFAPI.in is an independent third-party mirror of AMFI NAV data. Its terms for commercial use, caching and redistribution
are not confirmed (see `docs/DATA-SOURCES.md`).
1. Contact the MFAPI maintainer through the contact route shown on https://www.mfapi.in.
2. Describe the use: a free educational site that shows NAV history with attribution, caches responses for up to 6 hours,
   and lets users download CSV/Excel files of the NAVs they look at.
3. Ask whether display, caching and redistribution in user exports are permitted, and whether there are rate limits or
   an attribution requirement.
4. Save the reply. If permission is refused or unclear, set `NAV_PROVIDER=none` in Vercel and redeploy. Fund pages then
   say the data is turned off. Alternatively, ask Agent 2 to switch to AMFI's own NAV files.

## 5. Approve the scheme list
The daily job validates the schemes in `src/lib/automation/tasks/approved-schemes.json`. Today that is PPFAS Flexi Cap
Fund Direct Growth (122639) and Regular Growth (122640), checked against MFAPI on 2026-10-17.
1. Decide which schemes to monitor. Growth options only; IDCW options are not validated.
2. Send the list (scheme name and AMFI scheme code) to Agent 2, who checks each identity against the provider and updates
   the file.
3. Reply "approve scheme list" once you have reviewed the change.

## 6. Complete the legal pages
The drafts for Privacy, Terms and Disclaimer describe what the site really does:
[legal-drafts.md](legal-drafts.md).
1. Fill every value in `OWNER_DETAILS` in `src/features/legal/ui/ownerDetails.tsx`: legal name or entity, postal
   address, contact email, grievance officer, log retention, liability wording, governing law, jurisdiction and
   effective date. Use only real details.
2. Have a qualified professional review the three texts.
3. Set `reviewed: true`. The "Draft — owner to complete and have reviewed before launch" banner then disappears.
4. Supply the About and Contact text too. Those pages still show "Owner to supply before launch".

---

Optional:
- **Custom domain:** see `docs/DEPLOYMENT.md` §4.
- **Branch protection:** require the CI `check` and `e2e` jobs on `main` (`docs/DEPLOYMENT.md` §2).
