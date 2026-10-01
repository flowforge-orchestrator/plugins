import type { RagChunk, SearchHit } from '../contracts/types';
import type { VectorIndex } from '../internal/interfaces';
import { loadRagRuntimeConfig } from '../internal/env-config';
import { createHash } from 'crypto';

function collectionName(collectionId: string): string {
  return `rag_${collectionId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
}

/** Qdrant accepts only unsigned int or UUID as point id. */
export function qdrantPointId(chunkId: string): string {
  const hex = createHash('sha256').update(chunkId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function qdrantFetch(
  url: string,
  init?: RequestInit,
  attempts = 4,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      lastErr = err;
      const delayMs = 200 * 2 ** i;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Qdrant fetch failed: ${String(lastErr)}`);
}

export class QdrantVectorIndex implements VectorIndex {
  constructor(private readonly baseUrl = loadRagRuntimeConfig().qdrantUrl) {}

  private async ensureCollection(
    name: string,
    dimensions: number,
  ): Promise<void> {
    const get = await qdrantFetch(`${this.baseUrl}/collections/${name}`);
    if (get.ok) return;
    const create = await qdrantFetch(`${this.baseUrl}/collections/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: dimensions, distance: 'Cosine' },
      }),
    });
    if (!create.ok) {
      const body = await create.text();
      throw new Error(`Qdrant create collection HTTP ${create.status}: ${body}`);
    }
  }

  async upsertChunks(input: {
    collectionId: string;
    docId: string;
    chunks: RagChunk[];
    vectors: number[][];
  }): Promise<{ written: number; updated: number; orphansRemoved: number }> {
    if (input.chunks.length !== input.vectors.length) {
      throw new Error('chunks and vectors length mismatch');
    }
    const name = collectionName(input.collectionId);
    const dimensions = input.vectors[0]?.length ?? 0;
    if (dimensions === 0 && input.chunks.length > 0) {
      throw new Error('empty embedding vectors');
    }
    if (input.chunks.length === 0) {
      return { written: 0, updated: 0, orphansRemoved: 0 };
    }
    await this.ensureCollection(name, dimensions);

    const scroll = await qdrantFetch(
      `${this.baseUrl}/collections/${name}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{ key: 'docId', match: { value: input.docId } }],
          },
          limit: 10000,
          with_payload: true,
          with_vector: false,
        }),
      },
    );
    const existingIds = new Set<string>();
    if (scroll.ok) {
      const data = (await scroll.json()) as {
        result?: { points?: Array<{ id?: string | number }> };
      };
      for (const p of data.result?.points ?? []) {
        if (p.id !== undefined) existingIds.add(String(p.id));
      }
    }

    const points = input.chunks.map((chunk, i) => ({
      id: qdrantPointId(chunk.chunkId),
      vector: input.vectors[i],
      payload: {
        docId: input.docId,
        chunkId: chunk.chunkId,
        text: chunk.text,
        contentHash: chunk.contentHash,
        headingPath: chunk.headingPath,
        parentId: chunk.parentId,
        tokenEstimate: chunk.tokenEstimate,
      },
    }));

    const upsert = await qdrantFetch(
      `${this.baseUrl}/collections/${name}/points?wait=true`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      },
    );
    if (!upsert.ok) {
      const body = await upsert.text();
      throw new Error(`Qdrant upsert HTTP ${upsert.status}: ${body}`);
    }

    const keep = new Set(points.map((p) => String(p.id)));
    const orphans = [...existingIds].filter((id) => !keep.has(id));
    if (orphans.length > 0) {
      await qdrantFetch(
        `${this.baseUrl}/collections/${name}/points/delete?wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: orphans }),
        },
      );
    }

    const updated = points.filter((p) => existingIds.has(String(p.id))).length;
    return {
      written: points.length - updated,
      updated,
      orphansRemoved: orphans.length,
    };
  }

  async search(input: {
    collectionId: string;
    vector: number[];
    queryText: string;
    topK: number;
  }): Promise<SearchHit[]> {
    const name = collectionName(input.collectionId);
    const res = await qdrantFetch(
      `${this.baseUrl}/collections/${name}/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: input.vector,
          limit: input.topK,
          with_payload: true,
        }),
      },
    );
    if (res.status === 404) return [];
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Qdrant search HTTP ${res.status}: ${body}`);
    }
    const data = (await res.json()) as {
      result?: Array<{
        score?: number;
        payload?: {
          chunkId?: string;
          docId?: string;
          text?: string;
          headingPath?: string[];
        };
      }>;
    };
    void input.queryText;
    return (data.result ?? []).map((row) => ({
      chunkId: row.payload?.chunkId ?? '',
      docId: row.payload?.docId ?? '',
      text: row.payload?.text ?? '',
      score: row.score ?? 0,
      headingPath: row.payload?.headingPath,
      source: 'dense' as const,
    }));
  }
}
