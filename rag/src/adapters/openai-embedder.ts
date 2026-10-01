import type { Embedder } from '../internal/interfaces';
import { loadRagRuntimeConfig } from '../internal/env-config';

export class OpenAiCompatibleEmbedder implements Embedder {
  async embed(
    texts: string[],
    apiKey: string,
  ): Promise<{
    vectors: number[][];
    model: string;
    dimensions: number;
    usageTokens?: number;
  }> {
    const cfg = loadRagRuntimeConfig();
    const key =
      apiKey?.trim() ||
      process.env.EMBEDDING_API_KEY?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      (/11434/.test(cfg.embeddingBaseUrl) ? 'ollama' : '');
    if (!key) throw new Error('Embedding API key is required');
    if (texts.length === 0) {
      return { vectors: [], model: '', dimensions: 0, usageTokens: 0 };
    }
    const res = await fetch(`${cfg.embeddingBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.embeddingModel,
        input: texts,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding API HTTP ${res.status}: ${body}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      model?: string;
      usage?: { total_tokens?: number };
    };
    const sorted = [...(data.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    const vectors = sorted.map((row) => row.embedding ?? []);
    const dimensions = vectors[0]?.length ?? 0;
    return {
      vectors,
      model: data.model ?? cfg.embeddingModel,
      dimensions,
      usageTokens: data.usage?.total_tokens,
    };
  }
}
