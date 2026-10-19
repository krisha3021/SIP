import { z } from 'zod';
import { readAiConfig } from '@/lib/ai/config';
import { checkGrounding, type GroundingFact } from '@/lib/ai/grounding';
import { AI_DISCLOSURE_VERSION } from '@/lib/ai/prompt';
import { requestExplanation } from '@/lib/ai/provider';
import { DailyCounter } from '@/lib/ai/usage';
import { InMemoryNonceStore, MIN_SECRET_LENGTH, verifyConsentToken } from '@/lib/security/consent';
import { RateLimiter, clientKey, errorJson } from '../../_lib/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const nonces = new InMemoryNonceStore();
const limiter = new RateLimiter(20, 60_000);
let counter: DailyCounter | null = null;

const factSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),
  // Labels are untrusted data: bounded, no control characters.
  label: z.string().max(160).regex(/^[^\u0000-\u001f\u007f]*$/),
  value: z.number().finite(),
  unit: z.enum(['inr', 'percent', 'years', 'months', 'count']),
});
const bodySchema = z.object({ facts: z.array(factSchema).min(1).max(200), consentToken: z.string().max(4000).optional() });
const answerSchema = z.object({
  sections: z.array(z.object({ heading: z.string().min(1).max(80), paragraphs: z.array(z.string().min(1).max(800)).min(1).max(6) })).min(1).max(10),
});

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const log = (event: Record<string, unknown>) => console.info(JSON.stringify({ event: 'ai-explain', ...event }));

/** Status for the UI: whether AI explanations are available and what the consent dialog must disclose. */
export function GET() {
  const cfg = readAiConfig(process.env);
  if (!cfg || (process.env.CONSENT_SIGNING_SECRET ?? '').length < MIN_SECRET_LENGTH) return json({ enabled: false, reason: 'AI explanations are not configured on this deployment.' });
  return json({
    enabled: true,
    provider: cfg.providerName,
    retentionNote: cfg.retentionNote,
    termsUrl: cfg.termsUrl,
    disclosureVersion: AI_DISCLOSURE_VERSION,
    cost: 'No charge to you. The site owner pays any provider charges; free-tier limits may make this unavailable.',
  });
}

/** Explain computed facts. Requires a consent token bound to exactly { facts }. Output is used only if grounded. */
export async function POST(req: Request) {
  const started = Date.now();
  const cfg = readAiConfig(process.env);
  const secret = process.env.CONSENT_SIGNING_SECRET ?? '';
  if (!cfg || secret.length < MIN_SECRET_LENGTH) return errorJson(503, 'AI_DISABLED', 'AI explanations are not configured on this deployment.');
  const { allowed, retryAfterSec } = limiter.check(clientKey(req));
  if (!allowed) return errorJson(429, 'RATE_LIMITED', 'Too many requests. Please wait a minute.', { 'Retry-After': String(retryAfterSec) });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'INVALID_REQUEST', 'The explanation request was not valid.');
  const { facts, consentToken } = parsed.data;

  const consent = await verifyConsentToken(consentToken ?? '', { action: 'ai-explain', payload: { facts }, disclosureVersion: AI_DISCLOSURE_VERSION, now: new Date(), secret, nonceStore: nonces });
  if (!consent.ok) {
    log({ status: 'consent-refused', code: consent.code });
    return errorJson(403, `CONSENT_${consent.code}`, 'Approval is missing, expired, already used, or was given for different data. Nothing was sent.');
  }

  counter ??= new DailyCounter(cfg.dailyCap);
  if (!counter.take(new Date())) return errorJson(429, 'DAILY_LIMIT', 'Today’s AI explanation limit has been reached. The explanation above is still available.');

  const out = await requestExplanation(cfg, facts);
  if (!out.ok) {
    log({ status: 'provider-failed', reason: out.reason, httpStatus: out.status ?? null, facts: facts.length, ms: Date.now() - started });
    return json({ ok: true, source: 'deterministic-fallback', reason: out.reason });
  }

  let answer: z.infer<typeof answerSchema> | null = null;
  try {
    const cleaned = out.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const a = answerSchema.safeParse(JSON.parse(cleaned));
    answer = a.success ? a.data : null;
  } catch {
    answer = null;
  }
  if (!answer) {
    log({ status: 'unparseable', facts: facts.length, ms: Date.now() - started });
    return json({ ok: true, source: 'deterministic-fallback', reason: 'UNPARSEABLE' });
  }

  const text = answer.sections.flatMap((s) => [s.heading, ...s.paragraphs]).join('\n');
  const g = checkGrounding(text, facts as GroundingFact[]);
  if (!g.grounded) {
    log({ status: 'ungrounded', problems: g.problems.length, facts: facts.length, ms: Date.now() - started });
    return json({ ok: true, source: 'deterministic-fallback', reason: 'UNGROUNDED', problemCount: g.problems.length });
  }
  log({ status: 'ok', facts: facts.length, ms: Date.now() - started });
  return json({
    ok: true,
    source: 'ai',
    provider: cfg.providerName,
    explanation: {
      source: 'ai',
      sections: answer.sections,
      notice: 'AI-generated explanation of Lakshya’s computed figures. Not a recommendation and not a forecast. Every number was checked against the calculation.',
    },
  });
}
