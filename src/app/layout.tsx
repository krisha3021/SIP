import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Lakshya — Investment planning & mutual fund research', template: '%s · Lakshya' },
  description:
    'Educational SIP, goal, retirement and historical NAV calculators for Indian investors. Assumptions are stated, and data sources are disclosed.',
  robots: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' ? { index: false, follow: false } : undefined,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
