import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness check. Reports configuration presence only, never secret values. */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      time: new Date().toISOString(),
      navProvider: process.env.NAV_PROVIDER === 'none' ? 'disabled' : 'mfapi',
      sharedCacheConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
