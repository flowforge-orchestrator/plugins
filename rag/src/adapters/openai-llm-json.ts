import type { LlmCompleteOptions, LlmJson } from '../internal/interfaces';
import { loadRagRuntimeConfig } from '../internal/env-config';
import { noteChatLlm, usageFromLlmPayload } from '../internal/chat-metrics';

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('LLM response does not contain a JSON object');
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const startObj = candidate.indexOf('{');
  const startArr = candidate.indexOf('[');
  let start = startObj;
  if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
    start = startArr;
  }
  const endObj = candidate.lastIndexOf('}');
  const endArr = candidate.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start < 0 || end < start) {
    throw new Error('LLM response does not contain a JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function messageText(message: {
  content?: string | null;
  reasoning?: string | null;
}): string {
  const content = (message.content ?? '').trim();
  if (content) return content;
  return (message.reasoning ?? '').trim();
}

function preferOllamaNative(baseUrl: string): boolean {
  if (process.env.LLM_API_STYLE === 'ollama') return true;
  if (process.env.LLM_API_STYLE === 'openai') return false;
  return /11434/.test(baseUrl);
}

function ollamaRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
}

export class OpenAiCompatibleLlmJson implements LlmJson {
  async completeJson<T>(input: LlmCompleteOptions): Promise<T> {
    const cfg = loadRagRuntimeConfig();
    const baseUrl = (input.baseUrl?.trim() || cfg.llmBaseUrl).replace(
      /\/$/,
      '',
    );
    const model = input.model?.trim() || cfg.llmModel;
    const temperature =
      typeof input.temperature === 'number' && Number.isFinite(input.temperature)
        ? input.temperature
        : 0;
    const maxTokens = Number(
      input.maxTokens ?? process.env.LLM_MAX_TOKENS ?? '2048',
    );
    const apiKey =
      input.apiKey?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      (preferOllamaNative(baseUrl) ? 'ollama' : '');
    if (!apiKey) throw new Error('LLM API key is required');
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? '180000');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (preferOllamaNative(baseUrl)) {
        const res = await fetch(`${ollamaRoot(baseUrl)}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            stream: false,
            think: false,
            format: 'json',
            options: { temperature, num_predict: maxTokens },
            messages: [
              {
                role: 'system',
                content: `${input.systemPrompt}\nRespond with a single JSON object only.`,
              },
              { role: 'user', content: input.userPrompt },
            ],
          }),
        });
        if (!res.ok) {
          throw new Error(`LLM API HTTP ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          message?: { content?: string; reasoning?: string };
        };
        if (input.runId) noteChatLlm(input.runId, usageFromLlmPayload(data));
        return extractJsonObject(messageText(data.message ?? {})) as T;
      }

      const body: Record<string, unknown> = {
        model,
        temperature,
        max_tokens: maxTokens,
        think: false,
        messages: [
          {
            role: 'system',
            content: `${input.systemPrompt}\nRespond with a single JSON object only. No markdown.`,
          },
          { role: 'user', content: input.userPrompt },
        ],
      };
      if (process.env.LLM_JSON_RESPONSE_FORMAT === '1') {
        body.response_format = { type: 'json_object' };
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`LLM API HTTP ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string; reasoning?: string };
        }>;
      };
      if (input.runId) noteChatLlm(input.runId, usageFromLlmPayload(data));
      return extractJsonObject(
        messageText(data.choices?.[0]?.message ?? {}),
      ) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
