// @vitest-environment jsdom
import './setup-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/lib/security/canonical';
import { StrategyLabWithAi } from '@/features/strategy/ui/StrategyLabWithAi';
import { readAudit } from '@/features/permissions/ui/auditLog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const ENABLED = { enabled: true, provider: 'Example free LLM', retentionNote: 'Prompts may be kept for 30 days.', termsUrl: 'https://llm.example/terms', disclosureVersion: 'ai-explain-v1', cost: 'No charge to you.' };

function stub(status: unknown, explain: unknown = { ok: true, source: 'ai', provider: 'Example free LLM', explanation: { source: 'ai', sections: [{ heading: 'AI summary', paragraphs: ['Grounded text.'] }], notice: 'AI notice.' } }) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), body });
      if (String(url).endsWith('/api/ai/explain') && (!init || init.method !== 'POST')) return new Response(JSON.stringify(status), { status: 200 });
      if (String(url).endsWith('/api/consent')) return new Response(JSON.stringify({ token: 'tok.sig', expiresAt: new Date(Date.now() + 300000).toISOString() }), { status: 200 });
      if (String(url).endsWith('/api/ai/explain')) return new Response(JSON.stringify(explain), { status: 200 });
      throw new Error(`unexpected ${url}`);
    }),
  );
  return calls;
}

describe('Strategy Lab — AI explanation flow', () => {
  it('when AI is not configured, says so and keeps the deterministic explanation', async () => {
    stub({ enabled: false, reason: 'AI explanations are not configured on this deployment.' });
    render(<StrategyLabWithAi />);
    expect(await screen.findByText(/not configured on this deployment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explain with ai/i })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'What these results mean' })).toBeInTheDocument();
  });

  it('asks first, showing exactly what will be sent; Cancel sends nothing', async () => {
    const calls = stub(ENABLED);
    render(<StrategyLabWithAi />);
    await userEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    const dlg = screen.getByRole('dialog', { name: /approve this action/i });
    expect(within(dlg).getByText('Example free LLM')).toBeInTheDocument();
    expect(within(dlg).getByText(/Prompts may be kept for 30 days/)).toBeInTheDocument();
    expect(within(dlg).getByText('Fixed SIP: projected corpus at the assumed return')).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.url.endsWith('/api/consent') || (c.url.endsWith('/api/ai/explain') && c.body))).toHaveLength(0);
    expect(readAudit()[0]).toMatchObject({ action: 'ai-explain', outcome: 'cancelled' });
  });

  it('on approval, binds consent to the hash of exactly the facts sent, then shows the labelled AI explanation', async () => {
    const calls = stub(ENABLED);
    render(<StrategyLabWithAi />);
    await userEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve this action' }));
    expect(await screen.findByRole('heading', { name: 'AI-generated explanation' })).toBeInTheDocument();
    const consent = calls.find((c) => c.url.endsWith('/api/consent'))!.body as { action: string; payloadHash: string; disclosureVersion: string };
    const explain = calls.find((c) => c.url.endsWith('/api/ai/explain') && c.body)!.body as { facts: unknown; consentToken: string };
    expect(consent).toMatchObject({ action: 'ai-explain', disclosureVersion: 'ai-explain-v1' });
    expect(consent.payloadHash).toBe(createHash('sha256').update(canonicalJson({ facts: explain.facts })).digest('hex'));
    expect(explain.consentToken).toBe('tok.sig');
    expect(Object.keys(explain)).toEqual(['facts', 'consentToken']);
    // The deterministic explanation is still there; the AI one is clearly separate.
    expect(screen.getByRole('heading', { name: 'What these results mean' })).toBeInTheDocument();
  });

  it('shows a clear fallback when the AI answer is rejected, without losing inputs', async () => {
    stub(ENABLED, { ok: true, source: 'deterministic-fallback', reason: 'UNGROUNDED' });
    render(<StrategyLabWithAi />);
    const cap = screen.getByRole('textbox', { name: /monthly amount you can invest/i }) as HTMLInputElement;
    const before = cap.value;
    await userEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve this action' }));
    expect(await screen.findByText(/did not match the calculation/i)).toBeInTheDocument();
    expect(cap.value).toBe(before);
  });
});
