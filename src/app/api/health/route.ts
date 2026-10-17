import { NextResponse } from 'next/server';
import { upstashConfigFromEnv } from '../_lib/storage';

export const dynamic = 'force-dynamic';

/** Liveness check. Reports configuration presence only, never secret values. */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      time: new Date().toISOString(),
      navProvider: process.env.NAV_PROVIDER === 'none' ? 'disabled' : 'mfapi',
      sharedCacheConfigured: upstashConfigFromEnv() !== null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
