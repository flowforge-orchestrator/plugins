import type {
  HitEntityRef,
  HitRelationRef,
  SearchHit,
} from '../../contracts/types';

/** Reciprocal Rank Fusion for dense + graph hit lists (equal weight). */
export function fuseHits(
  lists: SearchHit[][],
  k = 60,
  topK = 8,
): SearchHit[] {
  return fuseHitsWeighted(
    lists.map((hits) => ({ hits, weight: 1 })),
    k,
    topK,
  );
}

/** Weighted RRF — graph lists should use weight > 1 so entity seeds beat dense. */
export function fuseHitsWeighted(
  lists: Array<{ hits: SearchHit[]; weight: number }>,
  k = 60,
  topK = 8,
): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();
  for (const { hits, weight } of lists) {
    const w = weight > 0 ? weight : 1;
    hits.forEach((hit, index) => {
      const key = hit.chunkId || `${hit.docId}:${hit.text.slice(0, 40)}`;
      const add = w / (k + index + 1);
      const prev = scores.get(key);
      if (prev) {
        prev.score += add;
        prev.hit = {
          ...prev.hit,
          ...hit,
          score: prev.score,
          source: 'hybrid',
          entities: hit.entities ?? prev.hit.entities,
          relations: hit.relations ?? prev.hit.relations,
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
 * Graph-selected chunks first (entity/intent path), then dense fill.
 * Drops duplicate chunkIds; preserves graph enrichment fields.
 */
export function preferGraphThenDense(
  graph: SearchHit[],
  dense: SearchHit[],
  topK: number,
): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of [...graph, ...dense]) {
    const key = hit.chunkId || `${hit.docId}:${hit.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= topK) break;
  }
  return out;
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
    const entityLine =
      hit.entities && hit.entities.length
        ? `\nentities: ${hit.entities.map((e) => e.label).join(', ')}`
        : '';
    const intentLine =
      hit.intentEntities && hit.intentEntities.length
        ? `\nintent: ${hit.intentEntities.map((e) => e.label).join(', ')}`
        : '';
    const relLine =
      hit.relations && hit.relations.length
        ? `\nrelations: ${hit.relations
            .map((r) => `${r.fromLabel}-[${r.typeId}]->${r.toLabel}`)
            .join('; ')}`
        : '';
    const block = `[${hit.docId}] [${hit.chunkId}] ${hit.headingPath?.join(' > ') ?? ''}${entityLine}${intentLine}${relLine}\n${hit.text}`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  return { context: parts.join('\n\n---\n\n'), used };
}

/** Match catalog entities mentioned in the question (longer labels win). */
export function matchQueryEntities(
  query: string,
  catalog: HitEntityRef[],
): HitEntityRef[] {
  const q = query.trim().toLowerCase();
  if (!q || catalog.length === 0) return [];
  const sorted = [...catalog].sort(
    (a, b) => b.label.length - a.label.length || a.label.localeCompare(b.label),
  );
  const matched: HitEntityRef[] = [];
  const used = new Set<string>();
  for (const entity of sorted) {
    const label = entity.label.trim().toLowerCase();
    if (label.length < 2) continue;
    if (!q.includes(label)) continue;
    if (used.has(entity.entityId)) continue;
    // Skip shorter label fully covered by an already matched longer one.
    if (matched.some((m) => m.label.toLowerCase().includes(label))) {
      continue;
    }
    matched.push(entity);
    used.add(entity.entityId);
  }
  return matched;
}

export function enrichHitAgainstIntent(
  hit: SearchHit & {
    entities?: HitEntityRef[];
    relations?: HitRelationRef[];
  },
  intentEntities: HitEntityRef[],
): SearchHit {
  if (!intentEntities.length) {
    return { ...hit, intentEntities: [], intentOverlap: 0 };
  }
  const intentIds = new Set(intentEntities.map((e) => e.entityId));
  const intentLabels = new Set(
    intentEntities.map((e) => e.label.trim().toLowerCase()).filter(Boolean),
  );
  const overlap = (hit.entities ?? []).filter(
    (e) =>
      intentIds.has(e.entityId) ||
      intentLabels.has(e.label.trim().toLowerCase()),
  );
  return {
    ...hit,
    intentEntities: overlap,
    intentOverlap: overlap.length,
  };
}

/** Boost hits that discuss intent entities when merging rank lists. */
export function sortByIntentThenScore(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => {
    const ia = a.intentOverlap ?? 0;
    const ib = b.intentOverlap ?? 0;
    if (ib !== ia) return ib - ia;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}
