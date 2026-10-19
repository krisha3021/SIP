/** Client-safe registry of consentable actions and permission categories (no crypto here). */
export type PermissionCategory = 'read-public' | 'use-personal-data' | 'save-changes' | 'communicate-externally' | 'execute-transaction';

export interface ConsentActionDef {
  id: string;
  label: string;
  categories: PermissionCategory[];
  /** Whether the server will ever issue a token for it in this release. */
  enabled: boolean;
  /** Where enforcement happens. Local-only actions need no server token because nothing leaves the device. */
  enforcement: 'server-token' | 'local-confirmation' | 'none';
  note: string;
}

export const CONSENT_ACTIONS = {
  'read-public-nav': { id: 'read-public-nav', label: 'Read public NAV data', categories: ['read-public'], enabled: true, enforcement: 'none', note: 'Public market data fetched by Lakshya’s server; no personal data involved.' },
  'ai-explain': { id: 'ai-explain', label: 'Send computed results to an external AI service for an explanation', categories: ['use-personal-data', 'communicate-externally'], enabled: true, enforcement: 'server-token', note: 'Only when an AI provider is configured.' },
  'replace-saved-plan': { id: 'replace-saved-plan', label: 'Replace a saved plan', categories: ['save-changes'], enabled: true, enforcement: 'local-confirmation', note: 'Saved plans live in this browser only.' },
  'delete-saved-plan': { id: 'delete-saved-plan', label: 'Delete a saved plan', categories: ['save-changes'], enabled: true, enforcement: 'local-confirmation', note: 'Saved plans live in this browser only.' },
  'cloud-sync': { id: 'cloud-sync', label: 'Enable cloud synchronisation', categories: ['save-changes', 'communicate-externally', 'use-personal-data'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'external-notifications': { id: 'external-notifications', label: 'Enable external notifications', categories: ['communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'connect-account': { id: 'connect-account', label: 'Connect a brokerage or financial account', categories: ['use-personal-data', 'communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'upload-statement': { id: 'upload-statement', label: 'Upload or process a portfolio statement externally', categories: ['use-personal-data', 'communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Not available in this release.' },
  'paid-data-provider': { id: 'paid-data-provider', label: 'Activate a paid data provider', categories: ['communicate-externally'], enabled: false, enforcement: 'server-token', note: 'Owner-only decision; not exposed to visitors.' },
  'execute-transaction': { id: 'execute-transaction', label: 'Execute an investment transaction', categories: ['execute-transaction'], enabled: false, enforcement: 'server-token', note: 'Permanently disabled in this release.' },
} as const satisfies Record<string, ConsentActionDef>;
export type ConsentActionId = keyof typeof CONSENT_ACTIONS;
