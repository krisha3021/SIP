// @vitest-environment jsdom
import './setup-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionDialog, type PermissionRequest } from '@/components/permissions/PermissionDialog';
import { AUDIT_KEY, readAudit, recordAudit } from '@/features/permissions/ui/auditLog';
import { PrivacyPanel } from '@/features/permissions/ui/PrivacyPanel';
import { SavedPlans } from '@/features/plans/ui/SavedPlans';
import { readPlans, savePlan } from '@/features/plans/ui/storage';

beforeAll(() => {
  // jsdom lacks <dialog> modal methods.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const request: PermissionRequest = {
  actionLabel: 'Send computed results to an external AI service for an explanation',
  categories: ['use-personal-data', 'communicate-externally'],
  dataItems: [
    { label: 'Fixed SIP: projected corpus', value: '₹47.15 L' },
    { label: 'Horizon', value: '15 years' },
  ],
  destination: 'Example AI (api.example.com)',
  purpose: 'Write a plain-language explanation of the figures above.',
  cost: 'No charge to you. The site owner uses a free tier.',
  retention: 'Not stated by the provider — read its terms before approving.',
  revoke: 'Cancel now, or later stop using AI explanations. Data already sent cannot be recalled.',
  changesPersistentState: false,
};

describe('PermissionDialog', () => {
  it('shows the exact action, data, destination, purpose, cost, retention, revocation and state change', () => {
    render(<PermissionDialog open request={request} onApprove={() => {}} onCancel={() => {}} />);
    const dlg = screen.getByRole('dialog', { name: /approve this action/i });
    for (const text of [request.actionLabel, '₹47.15 L', '15 years', request.destination, request.purpose, request.cost, request.retention, request.revoke]) {
      expect(within(dlg).getByText(text)).toBeInTheDocument();
    }
    expect(within(dlg).getByText(/does not change anything saved/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/uses your data/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/communicates with an external service/i)).toBeInTheDocument();
  });

  it('has distinct Approve and Cancel buttons, focuses Cancel by default, and has no preselected checkbox', () => {
    render(<PermissionDialog open request={request} onApprove={() => {}} onCancel={() => {}} />);
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('button', { name: 'Approve this action' })).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dlg).queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
    expect(within(dlg).queryByText(/approve all|approve everything/i)).toBeNull();
  });

  it('Cancel calls only onCancel; Approve calls only onApprove', async () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(<PermissionDialog open request={request} onApprove={onApprove} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Approve this action' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});

describe('local audit log', () => {
  it('records time, action, destination and outcome — never payload values', () => {
    recordAudit({ action: 'ai-explain', destination: 'Example AI', outcome: 'approved' });
    const raw = localStorage.getItem(AUDIT_KEY)!;
    expect(raw).not.toMatch(/47\.15|₹/);
    expect(readAudit()[0]).toMatchObject({ action: 'ai-explain', destination: 'Example AI', outcome: 'approved' });
    expect(readAudit()[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('PrivacyPanel', () => {
  it('lists the data on this device and explains that revoking cannot recall data already sent', () => {
    savePlan({ name: 'My SIP', calculator: 'SIP projection', path: '/calculators/sip', query: 'm=5000' });
    render(<PrivacyPanel />);
    expect(screen.getByRole('button', { name: 'Clear saved plans' })).toBeEnabled(); // one plan stored
    expect(screen.getByRole('button', { name: 'Clear watchlist' })).toBeDisabled(); // nothing stored
    expect(screen.getByText(/cannot recall data already sent/i)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /permission categories/i })).toBeInTheDocument();
    expect(screen.getByText(/Execute an investment transaction/)).toBeInTheDocument();
  });
});

describe('SavedPlans deletion', () => {
  it('requires approval: cancelling keeps the plan, approving deletes it', async () => {
    savePlan({ name: 'My SIP', calculator: 'SIP projection', path: '/calculators/sip', query: 'm=5000' });
    render(<SavedPlans />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete My SIP' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(readPlans()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete My SIP' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve this action' }));
    expect(readPlans()).toHaveLength(0);
    expect(readAudit()[0]).toMatchObject({ action: 'delete-saved-plan', outcome: 'approved' });
  });
});
