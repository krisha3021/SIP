/**
 * Public origin of the site, without a trailing slash.
 * Order: NEXT_PUBLIC_SITE_URL (custom domain) → VERCEL_PROJECT_PRODUCTION_URL (set by Vercel automatically, host only)
 * → undefined. Callers decide whether a localhost fallback is acceptable (development only).
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return undefined;
}
