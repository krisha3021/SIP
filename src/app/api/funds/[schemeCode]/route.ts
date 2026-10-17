import { guardFundsRequest } from '../../_lib/guard';
import { getNav, schemeCodeSchema } from '../../_lib/navService';
import { errorJson, json } from '../../_lib/server';

export const dynamic = 'force-dynamic';

/** Scheme metadata, provenance and freshness, without the NAV series. */
export async function GET(req: Request, ctx: { params: Promise<{ schemeCode: string }> }) {
  const refused = guardFundsRequest(req);
  if (refused) return refused;
  const parsed = schemeCodeSchema.safeParse((await ctx.params).schemeCode);
  if (!parsed.success) return errorJson(400, 'INVALID_SCHEME_CODE', 'Scheme code must be 1–7 digits.');
  const r = await getNav(parsed.data);
  if (!r.ok) return errorJson(r.status, r.code, r.message);
  return json(
    { ok: true, meta: r.data.meta, provenance: r.provenance, freshness: r.freshness, lastError: r.lastError, servedFrom: r.servedFrom, droppedRows: r.data.droppedRows },
    { maxAge: r.servedFrom === 'last-known-good' ? 0 : 1800 },
  );
}
