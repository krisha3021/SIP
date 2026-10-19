# Storage for automation runs and last-known-good NAVs

Status: **owner decision needed.** Nothing has been provisioned, and no account was created. Until storage is set up, the
site works as it does today: per-instance memory, lost on a cold start.

## What needs storing
- **Last-known-good NAV histories.** Agent 2's `CacheStore` interface: `get`/`set`/`delete` on JSON values with an
  optional TTL. Each scheme is roughly 50–300 KB of JSON, and only schemes that visitors open are stored.
- **Automation data.** Agent 2's `MfDataStore`: accepted NAV observations (never overwritten), quarantine records, a run
  lock, and run reports, for the daily `/api/cron/validate-mf-data` job (currently 2 approved schemes).

Both are small key-value workloads. Neither needs SQL joins.

## Options compared (free tiers; read on 2026-10-17)

| | Upstash Redis | Neon Postgres | Supabase Postgres |
|---|---|---|---|
| On Vercel Marketplace | Yes (`vercel install upstash`) | Yes (`vercel install neon`) | Yes (`vercel install supabase`) |
| Free storage | 250 MB | 1 GB per project (20 GB total) | 500 MB database |
| Free usage | 500K commands/month; 10 GB bandwidth/month; max request 10 MB | 100 CU-hours/project; 5 GB egress/project; scales to zero after 5 min idle | 5 GB egress (+5 GB cached); 2 active projects |
| Inactivity | — | Cold start after scale-to-zero | **Paused after 1 week of inactivity** |
| After the free tier | Pay-as-you-go: $0.20 per 100K commands; storage $0.25/GB (first 1 GB free); bandwidth free to 200 GB, then $0.03/GB | Launch: $0.106 per CU-hour, $0.35 per GB-month | Pro from $25/month |
| India region | Mumbai (ap-south-1) appears in an Upstash status incident (2026-05-14), but the pages read do not list it. **Confirm in the console's region picker.** | No Mumbai. Nearest is Singapore (`aws-ap-southeast-1`). | Mumbai (`ap-south-1`) listed |
| Fits our interfaces | Directly (key-value, `SET NX PX` locks, `HSETNX` for never-overwrite) | Needs a schema and a driver | Needs a schema and a driver |

Sources, read on 2026-10-17:
- Vercel, Storage overview (page last updated 2026-09-03): https://vercel.com/docs/storage. Marketplace providers
  include Neon, Upstash and Supabase, and Vercel injects credentials as environment variables.
- Upstash Redis pricing: https://upstash.com/pricing/redis. That page lists "Max Databases" as 1 on Free, while its FAQ
  says up to 10 free databases; this does not matter here, because one is enough.
- Neon pricing: https://neon.com/pricing. Neon regions: https://neon.com/docs/introduction/regions.
- Supabase pricing: https://supabase.com/pricing. Supabase regions: https://supabase.com/docs/guides/platform/regions.

Prices and limits change. Re-check these pages before you decide.

## Recommendation: Upstash Redis (free tier)
- It matches what we store (JSON by key, TTLs, atomic locks) with no schema or migrations.
- Free usage covers this site's expected scale. Reads go to an in-memory tier first, so Redis is touched only on a cache
  miss in a fresh instance. One daily cron run uses well under 100 commands.
- It never pauses for inactivity (Supabase's free plan pauses after a week, which would break the daily job).
- `.env.example` and `/api/health` already used Upstash variable names.

Watch-outs:
- NAV histories have no TTL (they are last-known-good copies), so storage grows by about 50–300 KB for each distinct
  scheme opened. 250 MB holds roughly a thousand schemes. If it nears the limit, set an eviction policy in the Upstash
  console, or ask us to add a TTL.
- Data location: pick the region nearest Vercel's function region. Vercel functions default to `iad1` (US East) unless
  the project's region is changed; logs from the live site showed the `bom1` (Mumbai) edge, which is the CDN, not
  necessarily the function region. Check Project → Settings → Functions → Region.

## What is already implemented (switches on automatically)
- `src/app/api/_lib/storage/upstash.ts`: `UpstashCacheStore`, `TieredCacheStore` (memory, then Redis) and
  `UpstashMfDataStore`. They use Upstash's REST API with `fetch`, and need no new npm dependency.
- `src/app/api/_lib/storage/index.ts`: `getStorage()` uses Upstash **only when both** `UPSTASH_REDIS_REST_URL` (https)
  and `UPSTASH_REDIS_REST_TOKEN` are set. It also accepts the `KV_REST_API_URL` / `KV_REST_API_TOKEN` names some
  integrations inject. Otherwise it uses the existing in-memory stores.
  - Keys are prefixed by Vercel environment (`lakshya:production:…`, `lakshya:preview:…`), so previews never touch
    production data.
  - If Redis is unreachable, the NAV cache carries on in memory. The cron job's run then fails and reports it.
- The NAV routes and the cron route use `getStorage()`. The cron response says
  `persistence: { store: "upstash-redis", persisted: true }` once storage is active. `/api/health` reports
  `sharedCacheConfigured`.
- No interface change to Agent 2's `src/lib` was needed. Tests in `tests/api/storage.test.ts` check that the semantics
  match the in-memory stores.

## Owner steps (free tier, no card needed for Upstash Free at the time of reading)
1. In Vercel, open the project, then **Storage → Create Database → Upstash (Redis)**, or **Marketplace → Upstash**.
   Choose the **Free** plan and the region nearest the project's function region. Connect it to the project, with all
   environments or Production only, as you prefer.
2. Check **Project → Settings → Environment Variables**. Vercel should now list the Upstash URL and token, as either
   `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Both pairs work.
   Never prefix them with `NEXT_PUBLIC_`.
3. Redeploy production.
4. Verify:
   - `GET /api/health` shows `"sharedCacheConfigured": true`.
   - With `CRON_SECRET` set, run
     `curl -H "Authorization: Bearer $CRON_SECRET" https://sip-three-zeta.vercel.app/api/cron/validate-mf-data` and
     check that the response says `"persisted": true`.
5. To switch it off, remove the variables and redeploy. The site falls back to in-memory storage.
