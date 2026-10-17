import { PROVIDER_NAME } from '@/lib/data/mfapi';
import { guardFundsRequest } from '../../_lib/guard';
import { search, searchQuerySchema } from '../../_lib/navService';
import { errorJson, json } from '../../_lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const refused = guardFundsRequest(req);
  if (refused) return refused;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const parsed = searchQuerySchema.safeParse(q);
  if (!parsed.success) return errorJson(400, 'INVALID_QUERY', parsed.error.issues[0]?.message ?? 'Invalid search');
  const r = await search(parsed.data);
  if (!r.ok) return errorJson(r.status, r.code, r.message);
  return json({ ok: true, query: parsed.data, provider: PROVIDER_NAME, results: r.results }, { maxAge: 3600 });
}
