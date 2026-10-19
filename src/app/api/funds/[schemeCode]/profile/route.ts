import { buildFundProfile, parseSchemeIdentity } from '@/contracts/server';
import { guardFundsRequest } from '../../../_lib/guard';
import { getNav, schemeCodeSchema } from '../../../_lib/navService';
import { errorJson, fetchTimeoutMs, json } from '../../../_lib/server';

export const dynamic = 'force-dynamic';

/**
 * Research profile: normalised identity plus every research field with field-level provenance.
 * Fields with no authorised source are returned as explicit unavailable fields — never sample values.
 */
export async function GET(req: Request, ctx: { params: Promise<{ schemeCode: string }> }) {
  const refused = guardFundsRequest(req);
  if (refused) return refused;
  const code = (await ctx.params).schemeCode;
  if (!schemeCodeSchema.safeParse(code).success) return errorJson(400, 'INVALID_SCHEME_CODE', 'Scheme code must be 1–7 digits.');
  const nav = await getNav(code);
  if (!nav.ok) return errorJson(nav.status, nav.code, nav.message);
  const identity = parseSchemeIdentity(nav.result.state.data.meta);
  const profile = await buildFundProfile(identity, { env: process.env, fetchImpl: fetch, now: () => new Date(), timeoutMs: fetchTimeoutMs() }, req.signal);
  return json({ ok: true as const, ...profile }, { maxAge: 1800 });
}
