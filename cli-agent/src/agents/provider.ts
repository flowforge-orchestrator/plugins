import { NAMED_PROVIDERS } from '../contract/cli-agent.io';

export type ProviderCheck =
  | { ok: true; provider: string; baseUrl: string }
  | { ok: false; reason: string };

export function checkProvider(
  providerRaw: string,
  baseUrlRaw: string | undefined,
): ProviderCheck {
  const provider = providerRaw.trim().toLowerCase();
  if (!NAMED_PROVIDERS.includes(provider as (typeof NAMED_PROVIDERS)[number])) {
    return {
      ok: false,
      reason: `unsupported provider "${providerRaw}"`,
    };
  }
  const baseUrl = (baseUrlRaw ?? '').trim();
  if (provider === 'custom' && !baseUrl) {
    return {
      ok: false,
      reason: 'baseUrl is required when provider=custom',
    };
  }
  return { ok: true, provider, baseUrl };
}

/** OpenAI-compatible base URL hints for named providers when CLI needs an explicit URL. */
export function namedProviderBaseUrl(provider: string): string {
  switch (provider) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'zai':
      return 'https://api.z.ai/api/paas/v4';
    case 'nous':
      return 'https://inference-api.nousresearch.com/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'ollama':
      return 'http://host.docker.internal:11434/v1';
    default:
      return '';
  }
}
