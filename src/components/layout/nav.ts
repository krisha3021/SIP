export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Sub-links shown in the mobile drawer and footer. */
  children?: Array<{ href: string; label: string }>;
}

/** Primary navigation. Order matters: it is the order in the header, drawer and home page. */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', description: 'Start here' },
  {
    href: '/calculators',
    label: 'SIP & Goals',
    description: 'SIP, goals, retirement, cash flow, allocation, Monte Carlo and tax calculators',
    children: [
      { href: '/calculators', label: 'All calculators' },
      { href: '/goals', label: 'Goals & Retirement' },
      { href: '/calculators/life-stage-planner', label: 'Life-stage & Risk Planner' },
      { href: '/scenario-lab', label: 'Scenario Lab' },
      { href: '/saved', label: 'Saved Plans' },
    ],
  },
  { href: '/strategy-lab', label: 'Strategy Lab', description: 'Compare contribution patterns and allocation mixes on your own assumptions' },
  {
    href: '/funds',
    label: 'Fund Research',
    description: 'Search schemes and fund houses, read NAV history and provenanced research fields',
    children: [
      { href: '/funds', label: 'Search schemes' },
      { href: '/amcs', label: 'Fund Houses (AMCs)' },
      { href: '/historical', label: 'Historical Analysis (SIP backtest)' },
    ],
  },
  { href: '/compare', label: 'Compare Funds', description: 'Up to four schemes on the same rows, with comparability warnings' },
  { href: '/watchlist', label: 'Watchlist', description: 'Schemes you follow, saved in this browser only' },
  {
    href: '/methodology',
    label: 'Sources & Methodology',
    description: 'How every number is calculated, and where the data comes from',
    children: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/data-sources', label: 'Data Sources' },
      { href: '/learn', label: 'Learn' },
    ],
  },
  { href: '/privacy-permissions', label: 'Privacy & Permissions', description: 'What stays on this device and how each permission is asked for' },
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
