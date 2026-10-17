## What changed
<!-- One or two sentences. Link the issue if there is one. -->

## Area and owner
- [ ] Website (Agent 1): `src/app`, `src/components`, `src/features/*/ui`, tests/e2e, tests/components, manifests, CI
- [ ] Finance & data (Agent 2): `src/lib/finance`, `src/lib/data`, `src/lib/analysis`, tests/finance, tests/data
- [ ] Shared contract (`src/contracts`, `docs/CONTRACTS.md`) — version bumped: `___`, reviewed by the other agent

## Checks
- [ ] `npm run check` passes (lint, typecheck, unit + component tests, build)
- [ ] `npm run test:e2e` passes (desktop + mobile Chromium, axe)
- [ ] Checked at 375 px and desktop width, light and dark theme

## Honesty and safety
- [ ] No formulas in components: every financial number comes from an engine via `@/contracts`
- [ ] No LIVE labels, invented AUM/ratings/holdings/TER, demo OTP, or "AI"/"advice" claims; missing data shows "Not available"
- [ ] Results are labelled "Projection (assumption-based)"; conventions are shown and exported
- [ ] No secrets, `.env*` files (other than `.env.example`), or personal data committed or logged
- [ ] Tax years with `status: 'unverified'` remain disabled

## Screenshots
<!-- Before/after for UI changes, at 375 px and desktop. -->
