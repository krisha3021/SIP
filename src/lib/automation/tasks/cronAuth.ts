/**
 * Authorisation check for scheduled invocations. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * The route (owned by Agent 1) must call this before running any task and return 401 when it fails.
 * The comparison is constant-time in the secret's length, and a missing or short secret always fails closed.
 */
export const MIN_CRON_SECRET_LENGTH = 32;

export function isAuthorizedCronRequest(authorizationHeader: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  if (!authorizationHeader) return false;
  const expected = `Bearer ${secret}`;
  const given = authorizationHeader;
  let diff = given.length === expected.length ? 0 : 1;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ (given.charCodeAt(i) || 0);
  }
  return diff === 0;
}
