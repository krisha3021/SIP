import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from './site-url';

export default function robots(): MetadataRoute.Robots {
  const site = resolveSiteUrl();
  const isPreview = Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production');
  return {
    rules: isPreview ? { userAgent: '*', disallow: '/' } : { userAgent: '*', allow: '/', disallow: ['/api/'] },
    ...(site && !isPreview ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
