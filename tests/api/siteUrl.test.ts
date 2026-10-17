import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from '@/app/site-url';

describe('resolveSiteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and strips trailing slashes', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://lakshya.example/', VERCEL_PROJECT_PRODUCTION_URL: 'sip-three-zeta.vercel.app' })).toBe(
      'https://lakshya.example',
    );
  });
  it('falls back to the Vercel production host with https', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'sip-three-zeta.vercel.app' })).toBe('https://sip-three-zeta.vercel.app');
  });
  it('ignores blank values and returns undefined when nothing is set (never localhost)', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '  ' })).toBeUndefined();
    expect(resolveSiteUrl({})).toBeUndefined();
  });
});
