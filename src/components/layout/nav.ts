export interface NavItem {
  href: string;
  label: string;
  description: string;
}

/** Primary navigation. Order matters: it is the order in the header, drawer and home page. */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/calculators', label: 'Calculators', description: 'SIP, step-up, lumpsum, goal, SWP, Monte Carlo and tax' },
  { href: '/goals', label: 'Goals & Retirement', description: 'Plan a goal, test a withdrawal plan, explore uncertainty' },
  { href: '/funds', label: 'Fund Research', description: 'Search schemes and read their published NAV history' },
  { href: '/historical', label: 'Historical Analysis', description: 'Backtest a SIP on observed NAVs' },
  { href: '/scenario-lab', label: 'Scenario Lab', description: 'Compare up to three sets of assumptions' },
  { href: '/saved', label: 'Saved Plans', description: 'Plans saved in this browser only' },
  { href: '/learn', label: 'Learn', description: 'Short explainers on the conventions we use' },
  { href: '/methodology', label: 'Methodology', description: 'How every number is calculated, and where data comes from' },
];

export const FOOTER_NAV: NavItem[] = [
  { href: '/about', label: 'About', description: '' },
  { href: '/contact', label: 'Contact', description: '' },
  { href: '/privacy', label: 'Privacy', description: '' },
  { href: '/terms', label: 'Terms', description: '' },
  { href: '/disclaimer', label: 'Disclaimer', description: '' },
  { href: '/methodology', label: 'Methodology', description: '' },
  { href: '/data-sources', label: 'Data Sources', description: '' },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}
