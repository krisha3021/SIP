import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** There is no licensed market-quote provider, so no index or stock quotes are served. */
export function GET() {
  return NextResponse.json({
    ok: true,
    quoteProvider: null,
    status: 'not-configured',
    message: 'No licensed quote provider is configured. Lakshya does not show live or delayed index or stock quotes.',
    navProvider: (process.env.NAV_PROVIDER ?? 'mfapi') === 'mfapi' ? 'mfapi' : 'disabled',
  });
}
