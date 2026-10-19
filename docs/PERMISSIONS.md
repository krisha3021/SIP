# Permissions & Consent

Code: `src/lib/security/{actions,consent,canonical}.ts`, `src/app/api/consent/route.ts`,
`src/components/permissions/PermissionDialog.tsx`, `src/features/permissions/ui/*`,
`src/app/api/ai/explain/route.ts`, `src/app/api/transactions/route.ts`.

## Categories
Each action belongs to one or more of these categories, and the dialog states each one separately:
- Read public information
- Use your data
- Save changes
- Communicate externally
- Execute a financial transaction

## Actions in this release
| Action | Categories | Enforcement | Status |
|---|---|---|---|
| Read public NAV data | read-public | none (no personal data) | On |
| AI explanation of Strategy Lab results | use-personal-data, communicate-externally | **Server token** | On only when `CONSENT_SIGNING_SECRET` and `LLM_*` are set |
| Delete or replace a saved plan; clear local data | save-changes | Local confirmation plus a local audit entry | On (browser only) |
| Cloud sync, external notifications, connect an account, upload a statement, paid data provider | — | Server token | **Not available** |
| Execute an investment transaction | execute-transaction | — | **Permanently disabled.** `/api/transactions` always returns 403 `EXECUTION_DISABLED`. |

## Dialog contract
- The dialog shows:
  - the exact action
  - its categories
  - the data involved, as the exact items that will be used or sent
  - the destination or provider
  - the purpose
  - the cost
  - the retention terms
  - how to cancel or revoke
  - whether persistent state changes
- It has two buttons, "Approve this action" and "Cancel". **Cancel has focus by default.** Nothing is preselected,
  and there is no "approve all".
- Each decision is recorded in a local audit log (`lakshya:audit:v1`). The log holds the time, action, destination
  and outcome, never the data itself.

## Server enforcement (external actions)
1. When the person approves, the browser computes `sha256(canonicalJson({ facts }))` using Web Crypto
   (`canonical.ts`). It calls `POST /api/consent` with `{ action, payloadHash, disclosureVersion }`.
2. The server checks that the action is enabled and server-enforced, and that the AI provider is configured.
3. It then issues `base64url(claims).base64url(HMAC-SHA256(secret, claims))`.
   - `claims` holds the action, the payload hash, the disclosure version, a random nonce, and an expiry 5 minutes ahead.
4. `POST /api/ai/explain` recomputes the hash from the body it **actually received**. It verifies the signature,
   action, hash, disclosure version and expiry, and that the nonce has not been used. Any mismatch returns
   `403 CONSENT_*`, and nothing is sent.

**What this guarantees:** Lakshya's code cannot send a payload other than the one shown in the dialog, reuse an
approval, or act on approval given to different wording.

**What it does not guarantee:**
- It does not distinguish a human click from a script the person runs in their own browser. No accounts exist.
- The nonce store is in memory **per server instance**. Until a shared store is wired, a token could be replayed once on
  a different serverless instance within its 5 minutes. A shared store adapter (Upstash) exists; wiring it to the
  nonce store is a follow-up.

## AI data minimisation
- Only the computed facts are sent: id, label, value and unit for each.
- Inputs as typed, names, contact details and free text are not sent.
- The system prompt holds every instruction. The facts travel as a JSON *user* message and are treated as data.
- The output is shown only if:
  - every ₹ or % figure matches a fact
  - every cited id exists
  - there is no guarantee or product-pick wording
  Otherwise the deterministic explanation stays and a reason is shown.
- Logs record counts and status only, never values.

## Revocation
A person can cancel any request, and can stop using AI at any time. Clearing the audit log, watchlist or saved plans is
available on `/privacy-permissions`. **Revoking future access cannot recall data already sent to an external service.**
The provider's own retention terms apply; its retention note is shown before approval.
