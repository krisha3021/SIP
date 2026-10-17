import { InMemoryMfDataStore, consoleTaskLogger, isAuthorizedCronRequest, runValidateMfData } from '@/contracts/server';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps function duration; the task is given a smaller budget below so it stops itself first.
export const maxDuration = 60;

/**
 * Run storage is IN-MEMORY ONLY until a storage backend is provisioned (owner approval needed if paid).
 * Accepted observations, quarantine records and run history survive only while this server instance is warm.
 */
const store = new InMemoryMfDataStore();

const PERSISTENCE = {
  store: 'in-memory',
  persisted: false,
  note: 'Runs are not persisted: results live only in this server instance until a storage backend is provisioned.',
} as const;

/** Scheduled data-quality check (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Fails closed. */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const report = await runValidateMfData(
    { store, logger: consoleTaskLogger },
    { trigger: 'schedule', signal: req.signal, runTimeoutMs: 50_000, killSwitch: process.env.MF_VALIDATION_DISABLED === 'true' },
  );
  return Response.json({ ...report, persistence: PERSISTENCE }, { status: report.status === 'failed' ? 500 : 200, headers: { 'Cache-Control': 'no-store' } });
}
