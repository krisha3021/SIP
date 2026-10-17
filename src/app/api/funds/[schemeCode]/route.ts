import { guardFundsRequest } from '../../_lib/guard';
import { getNav, navEnvelope, schemeCodeSchema } from '../../_lib/navService';
import { errorJson, json } from '../../_lib/server';

export const dynamic = 'force-dynamic';

/** Scheme metadata, provenance and freshness, without the NAV series. */
export async function GET(req: Request, ctx: { params: Promise<{ schemeCode: string }> }) {
  const refused = guardFundsRequest(req);
  if (refused) return refused;
  const code = (await ctx.params).schemeCode;
  if (!schemeCodeSchema.safeParse(code).success) return errorJson(400, 'INVALID_SCHEME_CODE', 'Scheme code must be 1–7 digits.');
  const r = await getNav(code);
  if (!r.ok) return errorJson(r.status, r.code, r.message);
  return json(navEnvelope(r.result, false), { maxAge: r.result.source === 'last-known-good' ? 0 : 1800 });
}
