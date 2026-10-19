'use client';

import { useEffect, useState } from 'react';
import { CONSENT_ACTIONS } from '@/lib/security/actions';
import { Button, Notice } from '@/components/ui/primitives';
import { PermissionDialog } from '@/components/permissions/PermissionDialog';
import { PLANS_KEY, readPlans, safeStorage } from '@/features/plans/ui/storage';
import { WATCHLIST_KEY, readWatchlist } from '@/features/watchlist/ui/storage';
import { AUDIT_KEY, readAudit, recordAudit, type AuditEntry } from './auditLog';

const CATEGORY_LABEL = {
  'read-public': 'Read public information',
  'use-personal-data': 'Use your data',
  'save-changes': 'Save changes',
  'communicate-externally': 'Communicate externally',
  'execute-transaction': 'Execute a financial transaction',
} as const;

type Store = { key: string; label: string; count: number };

function snapshot(): { stores: Store[]; audit: AuditEntry[]; available: boolean } {
  return {
    stores: [
      { key: PLANS_KEY, label: 'Saved plans', count: readPlans().length },
      { key: WATCHLIST_KEY, label: 'Watchlist', count: readWatchlist().length },
      { key: AUDIT_KEY, label: 'Permission history', count: readAudit().length },
    ],
    audit: readAudit(),
    available: safeStorage.available(),
  };
}

export function PrivacyPanel() {
  const [state, setState] = useState<ReturnType<typeof snapshot> | null>(null);
  const [pending, setPending] = useState<Store | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // localStorage exists only in the browser, so it is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(snapshot());
  }, []);

  const stores = state?.stores ?? [];
  const audit = state?.audit ?? [];

  return (
    <div className="space-y-8">
      <section aria-labelledby="device-heading" className="space-y-3">
        <h2 id="device-heading" className="text-xl font-semibold">
          Data on this device
        </h2>
        <p className="text-sm">Calculators run in your browser. These items are stored only in this browser’s local storage; Lakshya’s server never receives them.</p>
        {state && !state.available && (
          <Notice tone="warning" title="Local storage is unavailable">
            Nothing can be saved in this browser.
          </Notice>
        )}
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {stores.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                {s.label}: <span className="num">{s.count}</span>
              </span>
              <Button variant="ghost" disabled={s.count === 0} onClick={() => setPending(s)}>
                Clear {s.label.toLowerCase()}
              </Button>
            </li>
          ))}
        </ul>
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      </section>

      <section aria-labelledby="perm-heading" className="space-y-3">
        <h2 id="perm-heading" className="text-xl font-semibold">
          Permissions
        </h2>
        <p className="text-sm">
          Each action that would use your data, save changes or contact an external service asks first, separately, with “Approve this action” or “Cancel”.
          Approvals for external actions are checked by the server, bound to the exact data shown, single-use and valid for 5 minutes.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line" role="region" aria-label="Permission categories (scrolls sideways)" tabIndex={0}>
          <table aria-label="Permission categories" className="min-w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Action
                </th>
                <th scope="col" className="px-3 py-2">
                  Permission types
                </th>
                <th scope="col" className="px-3 py-2">
                  Status in this release
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.values(CONSENT_ACTIONS).map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {a.label}
                  </th>
                  <td className="px-3 py-2">{a.categories.map((c) => CATEGORY_LABEL[c]).join(', ')}</td>
                  <td className="px-3 py-2">
                    {a.enabled ? (a.enforcement === 'server-token' ? 'Asks each time; server-verified' : a.enforcement === 'local-confirmation' ? 'Asks each time; this browser only' : 'No personal data; no prompt') : 'Not available'} — {a.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice tone="info" title="About revoking access">
          You can cancel any request, and you can stop using AI explanations at any time. Revoking future access cannot recall data already sent to an external service; that provider’s own retention terms then apply.
        </Notice>
      </section>

      <section aria-labelledby="history-heading" className="space-y-2">
        <h2 id="history-heading" className="text-xl font-semibold">
          Permission history (this browser)
        </h2>
        {audit.length === 0 ? (
          <p className="text-sm text-muted">No permission decisions recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {audit.slice(0, 20).map((e) => (
              <li key={e.at + e.action}>
                <span className="num text-muted">{new Date(e.at).toLocaleString('en-IN')}</span> — {e.action} → {e.destination}: {e.outcome}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Only the time, action, destination and outcome are kept — never the data itself.</p>
      </section>

      {pending && (
        <PermissionDialog
          open
          request={{
            actionLabel: `Clear ${pending.label.toLowerCase()} from this browser`,
            categories: ['save-changes'],
            dataItems: [{ label: pending.label, value: `${pending.count} item(s)` }],
            destination: 'This browser only (local storage)',
            purpose: 'Remove the stored items permanently from this browser.',
            cost: 'None.',
            retention: 'The items are deleted from this browser; Lakshya never held a copy.',
            revoke: 'Choose Cancel to keep them. Once cleared, they cannot be restored.',
            changesPersistentState: true,
          }}
          onCancel={() => {
            recordAudit({ action: 'clear-local-data', destination: 'this browser', outcome: 'cancelled' });
            setPending(null);
            setState(snapshot());
          }}
          onApprove={() => {
            safeStorage.remove(pending.key);
            if (pending.key !== AUDIT_KEY) recordAudit({ action: 'clear-local-data', destination: 'this browser', outcome: 'approved' });
            setMsg(`${pending.label} cleared.`);
            setPending(null);
            setState(snapshot());
          }}
        />
      )}
    </div>
  );
}
