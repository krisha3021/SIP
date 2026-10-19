import { consoleTaskLogger, isAuthorizedCronRequest, runValidateMfData } from '@/contracts/server';
import { getStorage } from '../../_lib/storage';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps function duration; the task is given a smaller budget below so it stops itself first.
export const maxDuration = 60;

/**
 * Runs persist in Upstash Redis when it is configured (see docs/owner-actions/storage-options.md).
 * Otherwise they stay in memory and survive only while this server instance is warm.
 */
function persistence() {
  const { kind } = getStorage();
  return kind === 'upstash-redis'
    ? ({ store: 'upstash-redis', persisted: true, note: 'Runs, accepted observations and quarantine records are stored in Upstash Redis.' } as const)
    : ({ store: 'in-memory', persisted: false, note: 'Runs are not persisted: results live only in this server instance until a storage backend is provisioned.' } as const);
}

/** Scheduled data-quality check (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Fails closed. */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const report = await runValidateMfData(
    { store: getStorage().mfDataStore, logger: consoleTaskLogger },
    { trigger: 'schedule', signal: req.signal, runTimeoutMs: 50_000, killSwitch: process.env.MF_VALIDATION_DISABLED === 'true' },
  );
  return Response.json({ ...report, persistence: persistence() }, { status: report.status === 'failed' ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
