import 'server-only';
/**
 * OpenAI-compatible chat-completions client (works with free tiers such as Groq, Gemini's OpenAI-compatible
 * endpoint, or OpenRouter ":free" models — chosen by the owner via env). Timeout, one retry with backoff on 429/5xx.
 */
import type { AiConfig } from './config';
import { SYSTEM_PROMPT, userMessage } from './prompt';

export type ProviderOutcome = { ok: true; content: string } | { ok: false; reason: 'PROVIDER_UNAVAILABLE' | 'PROVIDER_REJECTED'; status?: number };

export async function requestExplanation(cfg: AiConfig, facts: unknown, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ProviderOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = JSON.stringify({
    model: cfg.model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage(facts) },
    ],
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
    try {
      const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body,
        signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        cache: 'no-store',
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) continue;
        return { ok: false, reason: 'PROVIDER_UNAVAILABLE', status: res.status };
      }
      if (!res.ok) return { ok: false, reason: 'PROVIDER_REJECTED', status: res.status };
      const json = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return { ok: false, reason: 'PROVIDER_REJECTED' };
      return { ok: true, content };
    } catch {
      if (attempt === 0) continue;
      return { ok: false, reason: 'PROVIDER_UNAVAILABLE' };
    }
  }
  return { ok: false, reason: 'PROVIDER_UNAVAILABLE' };
}
