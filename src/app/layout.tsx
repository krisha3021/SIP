import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { THEME_BOOT_SCRIPT } from '@/components/layout/ThemeToggle';
import { resolveSiteUrl } from './site-url';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const heading = Fraunces({ subsets: ['latin'], variable: '--font-heading', display: 'swap', weight: ['500', '600', '700'] });

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  title: { default: 'Lakshya — Investment planning & mutual fund research', template: '%s · Lakshya' },
  description:
    'Educational SIP, goal, retirement and historical NAV calculators for Indian investors. Assumptions are stated, and data sources are disclosed.',
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  robots: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' ? { index: false, follow: false } : undefined,
  authors: [{ name: 'Alok Shukla' }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ee' },
    { media: '(prefers-color-scheme: dark)', color: '#101512' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${body.variable} ${heading.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
