import type { SearchHit } from '../../contracts/types';

/** Reciprocal Rank Fusion for dense + graph hit lists. */
export function fuseHits(
  lists: SearchHit[][],
  k = 60,
  topK = 8,
): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, index) => {
      const key = hit.chunkId || `${hit.docId}:${hit.text.slice(0, 40)}`;
      const add = 1 / (k + index + 1);
      const prev = scores.get(key);
      if (prev) {
        prev.score += add;
        prev.hit = {
          ...prev.hit,
          score: prev.score,
          source: 'hybrid',
        };
      } else {
        scores.set(key, {
          hit: { ...hit, score: add, source: 'hybrid' },
          score: add,
        });
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((row) => ({ ...row.hit, score: row.score }));
}

/**
 * Observations are the agent's working memory: a new search adds to it.
 * New hits come first; earlier hits stay unless already present; cap keeps it bounded.
 */
export function mergeWorkingSet(
  fresh: SearchHit[],
  prior: SearchHit[],
  cap: number,
): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of [...fresh, ...prior]) {
    const key = hit.chunkId || `${hit.docId}:${hit.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= cap) break;
  }
  return out;
}

export function assembleContext(
  hits: SearchHit[],
  maxChars = 6000,
): { context: string; used: number } {
  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const block = `[${hit.docId}] [${hit.chunkId}] ${hit.headingPath?.join(' > ') ?? ''}\n${hit.text}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return { context: parts.join('\n\n---\n\n'), used };
}
