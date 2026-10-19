import 'server-only';
/** AI provider configuration (server-side). Off unless all three variables are set and the base URL is https. */
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerName: string;
  retentionNote: string | null;
  termsUrl: string | null;
  dailyCap: number;
}

export function readAiConfig(env: Record<string, string | undefined>): AiConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  try {
    if (new URL(baseUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const cap = Number(env.LLM_DAILY_REQUEST_CAP);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    model,
    providerName: env.LLM_PROVIDER_NAME?.trim() || new URL(baseUrl).hostname,
    retentionNote: env.LLM_DATA_RETENTION_NOTE?.trim() || null,
    termsUrl: env.LLM_TERMS_URL?.trim() || null,
    dailyCap: Number.isInteger(cap) && cap > 0 ? cap : 200,
  };
}
