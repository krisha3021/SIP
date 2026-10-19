import { errorJson } from '../_lib/server';

export const dynamic = 'force-dynamic';

/**
 * Investment execution is permanently disabled in this release. Any future integration must live behind its own
 * isolated module, stay disabled until operational, security and regulatory prerequisites are verified, and require
 * a server-verified consent token for 'execute-transaction' — which this release never issues.
 */
const refuse = () => errorJson(403, 'EXECUTION_DISABLED', 'Lakshya does not execute investments. This is an educational planning and research site.');
export const GET = refuse;
export const POST = refuse;
