'use client';

import { useEffect, useState } from 'react';
import { formatFact, type Explanation, type StrategyResult } from '@/contracts';
import { Button } from '@/components/ui/primitives';
import { PermissionDialog } from '@/components/permissions/PermissionDialog';
import { payloadHashBrowser } from '@/lib/security/canonical';
import { CONSENT_ACTIONS } from '@/lib/security/actions';
import { recordAudit } from '@/features/permissions/ui/auditLog';
import { StrategyLab } from './StrategyLab';
import { StrategyExplanation } from './StrategyExplanation';

type AiStatus =
  | { enabled: false; reason?: string }
  | { enabled: true; provider: string; retentionNote: string | null; termsUrl: string | null; disclosureVersion: string; cost: string };

const FALLBACK_TEXT: Record<string, string> = {
  UNGROUNDED: 'The AI answer was not shown because some of its figures did not match the calculation.',
  UNPARSEABLE: 'The AI answer could not be read, so it was not shown.',
  PROVIDER_UNAVAILABLE: 'The AI service did not respond. Nothing else changed; your inputs and results are intact.',
  PROVIDER_REJECTED: 'The AI service refused the request. Nothing else changed.',
};

/** Facts exactly as they will be sent: the dialog lists these, and the consent hash is computed over them. */
const factsPayload = (r: StrategyResult) => r.facts.map((f) => ({ id: f.id, label: f.label, value: f.value, unit: f.unit }));

function AiExplainPanel({ result }: { result: StrategyResult }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<{ explanation: Explanation; provider: string } | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const c = new AbortController();
    fetch('/api/ai/explain', { signal: c.signal })
      .then((r) => r.json() as Promise<AiStatus>)
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, reason: 'AI status could not be checked.' }));
    return () => c.abort();
  }, []);

  // A new result invalidates an explanation of the old one.
  const [explainedFor, setExplainedFor] = useState<StrategyResult | null>(null);
  const current = ai && explainedFor === result ? ai : null;

  const facts = factsPayload(result);
  const def = CONSENT_ACTIONS['ai-explain'];

  const approve = async () => {
    if (!status?.enabled) return;
    setAsking(false);
    setBusy(true);
    setNote('');
    recordAudit({ action: 'ai-explain', destination: status.provider, outcome: 'approved' });
    try {
      const payload = { facts };
      const hash = await payloadHashBrowser(payload);
      const c = await fetch('/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ai-explain', payloadHash: hash, disclosureVersion: status.disclosureVersion }) });
      const consent = (await c.json()) as { token?: string; error?: { message: string } };
      if (!c.ok || !consent.token) throw new Error(consent.error?.message ?? 'Approval could not be recorded.');
      const r = await fetch('/api/ai/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: payload.facts, consentToken: consent.token }) });
      const body = (await r.json()) as { ok?: boolean; source?: string; reason?: string; provider?: string; explanation?: Explanation; error?: { message: string } };
      if (!r.ok) throw new Error(body.error?.message ?? 'The AI request was refused.');
      if (body.source === 'ai' && body.explanation) {
        recordAudit({ action: 'ai-explain', destination: status.provider, outcome: 'sent' });
        setAi({ explanation: body.explanation, provider: body.provider ?? status.provider });
        setExplainedFor(result);
      } else {
        recordAudit({ action: 'ai-explain', destination: status.provider, outcome: 'failed' });
        setNote(FALLBACK_TEXT[body.reason ?? ''] ?? 'The AI explanation is unavailable. The explanation above is unchanged.');
      }
    } catch (e) {
      recordAudit({ action: 'ai-explain', destination: status.provider, outcome: 'failed' });
      setNote(`${(e as Error).message} The explanation above is unchanged.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ai-heading" className="space-y-3 rounded-xl border border-dashed border-line p-4">
      <h2 id="ai-heading" className="font-sans text-base font-semibold">
        Optional: AI explanation
      </h2>
      {status === null && <p className="text-sm text-muted">Checking whether AI explanations are available…</p>}
      {status && !status.enabled && <p className="text-sm text-muted">{status.reason ?? 'AI explanations are not available.'} The explanation above was written by Lakshya without AI.</p>}
      {status?.enabled && (
        <p className="text-sm">
          Sends only the computed figures listed in the approval dialog to {status.provider}. Your inputs are not sent as typed; no names, contact details or free text.
        </p>
      )}
      <Button variant="secondary" disabled={!status?.enabled || busy} onClick={() => setAsking(true)}>
        {busy ? 'Explaining…' : 'Explain with AI'}
      </Button>
      <p role="status" aria-live="polite" className="text-sm">
        {note}
      </p>
      {current && <StrategyExplanation explanation={current.explanation} providerName={current.provider} />}
      {status?.enabled && asking && (
        <PermissionDialog
          open
          request={{
            actionLabel: def.label,
            categories: [...def.categories],
            dataItems: facts.map((f) => ({ label: f.label, value: formatFact(f) })),
            destination: status.provider,
            purpose: 'Write a plain-language explanation of these computed figures. The calculation itself is not changed.',
            cost: status.cost,
            retention: status.retentionNote ?? `The site owner has not recorded this provider’s retention terms.${status.termsUrl ? ` Read them at ${status.termsUrl}` : ' Read the provider’s terms'} before approving.`,
            revoke: 'Choose Cancel to send nothing. Later, simply do not use this button. Data already sent cannot be recalled.',
            changesPersistentState: false,
          }}
          onCancel={() => {
            recordAudit({ action: 'ai-explain', destination: status.provider, outcome: 'cancelled' });
            setAsking(false);
          }}
          onApprove={approve}
        />
      )}
    </section>
  );
}

/** Strategy Lab with the optional, consent-gated AI explanation beneath the deterministic one. */
export function StrategyLabWithAi() {
  return <StrategyLab onExplainWithAi={(r) => <AiExplainPanel result={r} />} />;
}
