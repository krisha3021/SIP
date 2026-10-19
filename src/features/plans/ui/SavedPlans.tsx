'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, ButtonLink, Notice } from '@/components/ui/primitives';
import { deletePlan, readPlans, safeStorage, type SavedPlan } from './storage';
import { PermissionDialog } from '@/components/permissions/PermissionDialog';
import { recordAudit } from '@/features/permissions/ui/auditLog';

export function SavedPlans() {
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<SavedPlan | null>(null);

  useEffect(() => {
    // localStorage exists only in the browser, so the list is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailable(safeStorage.available());
    setPlans(readPlans());
  }, []);

  if (plans === null) return <p className="text-muted">Loading saved plans…</p>;

  return (
    <div className="space-y-4">
      {!available && (
        <Notice tone="warning" title="Local storage is unavailable">
          This browser is blocking local storage (for example, in some private modes), so plans cannot be saved or read here.
        </Notice>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted empty:hidden">
        {msg}
      </p>
      {plans.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-6">
          <p className="font-semibold">No saved plans yet.</p>
          <p className="mt-1 text-sm text-muted">Open a calculator and use “Save” to keep its assumptions here.</p>
          <ButtonLink href="/calculators" variant="primary" className="mt-4">
            Browse calculators
          </ButtonLink>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <Link href={`${p.path}${p.query ? `?${p.query}` : ''}`} className="font-semibold">
                  {p.name}
                </Link>
                <p className="text-sm text-muted">
                  {p.calculator} · saved {new Date(p.savedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <Button onClick={() => setPending(p)} aria-label={`Delete ${p.name}`}>
                <Trash2 aria-hidden="true" size={16} /> Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <PermissionDialog
          open
          request={{
            actionLabel: `Delete the saved plan “${pending.name}”`,
            categories: ['save-changes'],
            dataItems: [
              { label: 'Plan', value: pending.name },
              { label: 'Calculator', value: pending.calculator },
            ],
            destination: 'This browser only (local storage)',
            purpose: 'Remove this plan permanently from this browser.',
            cost: 'None.',
            retention: 'The plan is deleted from this browser; Lakshya never held a copy.',
            revoke: 'Choose Cancel to keep it. Once deleted it cannot be restored.',
            changesPersistentState: true,
          }}
          onCancel={() => {
            recordAudit({ action: 'delete-saved-plan', destination: 'this browser', outcome: 'cancelled' });
            setPending(null);
          }}
          onApprove={() => {
            const ok = deletePlan(pending.id);
            recordAudit({ action: 'delete-saved-plan', destination: 'this browser', outcome: ok ? 'approved' : 'failed' });
            setPlans(readPlans());
            setMsg(ok ? `Deleted “${pending.name}”.` : 'Could not delete the plan.');
            setPending(null);
          }}
        />
      )}
      <p className="text-xs text-muted">
        Cloud accounts and syncing are not available yet. When they are added, they will use a real sign-in provider with server-side verification.
      </p>
    </div>
  );
}
