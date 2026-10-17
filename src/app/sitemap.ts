import type { MetadataRoute } from 'next';
import { CALCULATORS } from '@/features/calculators/ui/registry';

const STATIC = ['', '/calculators', '/goals', '/funds', '/historical', '/scenario-lab', '/learn', '/methodology', '/data-sources', '/about', '/contact', '/privacy', '/terms', '/disclaimer'];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return [...STATIC, ...CALCULATORS.map((c) => `/calculators/${c.slug}`)].map((p) => ({ url: `${site}${p}` }));
}
