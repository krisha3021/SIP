'use client';

import { useEffect, useId, useRef } from 'react';
import type { PermissionCategory } from '@/lib/security/actions';
import { Button } from '@/components/ui/primitives';

export interface PermissionRequest {
  /** The exact action, in plain words. */
  actionLabel: string;
  categories: PermissionCategory[];
  /** Every item that will be used or sent, as the person will see it. */
  dataItems: Array<{ label: string; value: string }>;
  destination: string;
  purpose: string;
  cost: string;
  retention: string;
  revoke: string;
  changesPersistentState: boolean;
}

const CATEGORY_TEXT: Record<PermissionCategory, string> = {
  'read-public': 'Reads public information only.',
  'use-personal-data': 'This action uses your data.',
  'save-changes': 'This action changes data saved in this browser.',
  'communicate-externally': 'This action communicates with an external service.',
  'execute-transaction': 'This would execute a financial transaction. Lakshya never does this.',
};

/**
 * One action, one decision. No preselected consent, no bundled permissions, no "approve everything".
 * Cancel has focus by default, so pressing Enter never approves by accident.
 */
export function PermissionDialog({ open, request, onApprove, onCancel }: { open: boolean; request: PermissionRequest; onApprove: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    // Remember the opener so focus can return to it (WCAG 2.4.3), whether the caller closes or unmounts the dialog.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    cancelRef.current?.focus();
    return () => {
      if (d.open) d.close();
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  const rows: Array<[string, React.ReactNode]> = [
    ['Destination or provider', request.destination],
    ['Purpose', request.purpose],
    ['Cost', request.cost],
    ['Retention', request.retention],
    ['Cancel or revoke', request.revoke],
    ['Saved state', request.changesPersistentState ? 'This changes what is saved.' : 'This does not change anything saved.'],
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-text backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          Approve this action?
        </h2>
        <p className="font-medium">{request.actionLabel}</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {request.categories.map((c) => (
            <li key={c}>{CATEGORY_TEXT[c]}</li>
          ))}
        </ul>
        <div>
          <h3 className="font-sans text-sm font-semibold">Data involved</h3>
          {request.dataItems.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <dl className="mt-1 max-h-48 overflow-auto rounded border border-line p-2 text-sm" tabIndex={0} aria-label="Data involved">
              {request.dataItems.map((d) => (
                <div key={d.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="num">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onApprove}>
            Approve this action
          </Button>
        </div>
      </div>
    </dialog>
  );
}
