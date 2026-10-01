import type { SearchHit } from '../../contracts/types';
import { fromJsonPort } from '../../internal/json-port';

export type RerankScore = {
  chunkId: string;
  score: number;
};

function isHit(value: unknown): value is SearchHit {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.chunkId === 'string' &&
    row.chunkId.length > 0 &&
    typeof row.docId === 'string' &&
    typeof row.text === 'string' &&
    typeof row.score === 'number'
  );
}

/** Accept hits from a textarea port (array or JSON string). */
export function normalizeHitsPort(raw: unknown): SearchHit[] {
  const parsed = fromJsonPort<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  // Conveyor sometimes wraps once more → [[]]
  if (parsed.length === 1 && Array.isArray(parsed[0])) {
    return (parsed[0] as unknown[]).filter(isHit);
  }
  return parsed.filter(isHit);
}

/**
 * Merge model scores onto candidate hits and sort descending.
 * Hits without a usable score keep their retrieval score.
 */
export function applyRerankScores(
  hits: SearchHit[],
  scores: RerankScore[],
): SearchHit[] {
  if (hits.length === 0) return [];
  const byId = new Map<string, number>();
  for (const row of scores) {
    if (!row || typeof row.chunkId !== 'string' || !row.chunkId) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    byId.set(row.chunkId, score);
  }
  return hits
    .map((hit) => {
      const scored = byId.get(hit.chunkId);
      if (scored == null) {
        return {
          hit: { ...hit },
          scored: false,
          rank: hit.score,
        };
      }
      return {
        hit: { ...hit, score: scored, source: 'rerank' as const },
        scored: true,
        rank: scored,
      };
    })
    .sort((a, b) => {
      if (a.scored !== b.scored) return a.scored ? -1 : 1;
      return b.rank - a.rank;
    })
    .map((row) => row.hit);
}

/**
 * Pick topK hits with a per-document cap so context covers more corpus units.
 * First pass: respect maxPerDoc. Second pass: fill remaining slots by score.
 */
export function selectDiverseHits(
  ranked: SearchHit[],
  opts: { topK: number; maxPerDoc?: number },
): SearchHit[] {
  const topK = Math.max(0, Math.floor(opts.topK));
  if (topK === 0 || ranked.length === 0) return [];
  const maxPerDoc = Math.max(1, Math.floor(opts.maxPerDoc ?? 2));
  const selected: SearchHit[] = [];
  const perDoc = new Map<string, number>();
  const used = new Set<string>();

  const tryAdd = (hit: SearchHit, enforceCap: boolean) => {
    if (selected.length >= topK) return;
    if (used.has(hit.chunkId)) return;
    const count = perDoc.get(hit.docId) ?? 0;
    if (enforceCap && count >= maxPerDoc) return;
    selected.push(hit);
    used.add(hit.chunkId);
    perDoc.set(hit.docId, count + 1);
  };

  for (const hit of ranked) tryAdd(hit, true);
  for (const hit of ranked) tryAdd(hit, false);
  return selected;
}

export function parseRerankScorePayload(payload: unknown): RerankScore[] {
  if (!payload || typeof payload !== 'object') return [];
  const scores = (payload as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return [];
  const out: RerankScore[] = [];
  for (const row of scores) {
    if (!row || typeof row !== 'object') continue;
    const chunkId = String((row as { chunkId?: unknown }).chunkId ?? '').trim();
    const score = Number((row as { score?: unknown }).score);
    if (!chunkId || !Number.isFinite(score)) continue;
    out.push({ chunkId, score });
  }
  return out;
}

export function buildRerankSystemPrompt(): string {
  return [
    'You are a relevance reranker for RAG retrieval.',
    'Score how well each candidate passage answers the user query.',
    'Use the full 0..1 range. Prefer passages that add distinct facts or distinct organizations/docs.',
    'Do not invent chunk IDs. Score only the provided candidates.',
    'Return a single JSON object: {"scores":[{"chunkId":string,"score":number}]}.',
  ].join('\n');
}

export function buildRerankUserPrompt(input: {
  query: string;
  hits: SearchHit[];
  maxCharsPerHit?: number;
}): string {
  const maxChars = input.maxCharsPerHit ?? 600;
  return JSON.stringify(
    {
      query: input.query,
      candidates: input.hits.map((h) => ({
        chunkId: h.chunkId,
        docId: h.docId,
        text: h.text.slice(0, maxChars),
      })),
    },
    null,
    2,
  );
}
