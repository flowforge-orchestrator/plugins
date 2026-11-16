/**
 * Shared LLM endpoint config for CLI agents.
 * Produced by LlmConfig executor, consumed via agent llmConfig port.
 */

export type LlmConfig = {
  version: 1;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export function parseLlmConfig(raw: unknown): LlmConfig | null {
  if (raw == null || raw === '') return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (typeof obj.provider !== 'string' || !obj.provider.trim()) return null;
  if (typeof obj.apiKey !== 'string' || !obj.apiKey.trim()) return null;
  return {
    version: 1,
    provider: obj.provider.trim(),
    model: typeof obj.model === 'string' ? obj.model.trim() : '',
    baseUrl: typeof obj.baseUrl === 'string' ? obj.baseUrl.trim() : '',
    apiKey: obj.apiKey,
  };
}
