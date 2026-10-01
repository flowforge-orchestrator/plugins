import type { SearchHit } from '../contracts/types';
import { noteChatLlm, usageFromLlmPayload } from '../internal/chat-metrics';
import { loadRagRuntimeConfig } from '../internal/env-config';
import type { Reranker } from '../internal/interfaces';
import { extractJsonObject } from './openai-llm-json';

function ollamaRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
}

function preferOllamaNative(baseUrl: string): boolean {
  if (process.env.LLM_API_STYLE === 'ollama') return true;
  if (process.env.LLM_API_STYLE === 'openai') return false;
  return /11434/.test(baseUrl);
}

/**
 * Reranker backed by Ollama.
 * Prefers native `/api/rerank` when the daemon supports it; otherwise scores via
 * a dedicated small chat model (`RERANK_MODEL`) returning JSON scores.
 */
export class OllamaReranker implements Reranker {
  async score(input: {
    query: string;
    hits: SearchHit[];
    apiKey: string;
    systemPrompt: string;
    userPrompt: string;
    runId?: string;
  }): Promise<unknown> {
    const cfg = loadRagRuntimeConfig();
    const root = ollamaRoot(cfg.rerankBaseUrl || cfg.llmBaseUrl);
    const model = cfg.rerankModel;
    const timeoutMs = Number(process.env.RERANK_TIMEOUT_MS ?? '120000');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const native = await this.tryNativeRerank({
        root,
        model,
        query: input.query,
        hits: input.hits,
        signal: controller.signal,
      });
      if (native) return native;

      return await this.scoreViaChat({
        root,
        model,
        baseUrl: cfg.rerankBaseUrl || cfg.llmBaseUrl,
        apiKey: input.apiKey,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        runId: input.runId,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async tryNativeRerank(input: {
    root: string;
    model: string;
    query: string;
    hits: SearchHit[];
    signal: AbortSignal;
  }): Promise<{ scores: Array<{ chunkId: string; score: number }> } | null> {
    try {
      const res = await fetch(`${input.root}/api/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          query: input.query,
          documents: input.hits.map((h) => h.text.slice(0, 1200)),
          top_n: input.hits.length,
        }),
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: Array<{ index?: number; relevance_score?: number }>;
      };
      const scores: Array<{ chunkId: string; score: number }> = [];
      for (const row of data.results ?? []) {
        const idx = Number(row.index);
        const hit = input.hits[idx];
        const score = Number(row.relevance_score);
        if (!hit || !Number.isFinite(score)) continue;
        scores.push({ chunkId: hit.chunkId, score });
      }
      return scores.length ? { scores } : null;
    } catch {
      return null;
    }
  }

  private async scoreViaChat(input: {
    root: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    systemPrompt: string;
    userPrompt: string;
    runId?: string;
    signal: AbortSignal;
  }): Promise<unknown> {
    const apiKey =
      input.apiKey?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      (preferOllamaNative(input.baseUrl) ? 'ollama' : '');
    if (!apiKey) throw new Error('Rerank API key is required');

    if (preferOllamaNative(input.baseUrl)) {
      const res = await fetch(`${input.root}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: input.signal,
        body: JSON.stringify({
          model: input.model,
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0, num_predict: 1024 },
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
        throw new Error(`Rerank API HTTP ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        message?: { content?: string };
      };
      if (input.runId) noteChatLlm(input.runId, usageFromLlmPayload(data));
      return extractJsonObject((data.message?.content ?? '').trim());
    }

    const res = await fetch(`${input.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: input.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        max_tokens: 1024,
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
      throw new Error(`Rerank API HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (input.runId) noteChatLlm(input.runId, usageFromLlmPayload(data));
    return extractJsonObject(
      (data.choices?.[0]?.message?.content ?? '').trim(),
    );
  }
}
