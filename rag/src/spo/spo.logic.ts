import { createHash } from 'crypto';
import type {
  CanonicalEntity,
  EntityRelation,
  RagChunk,
} from '../contracts/types';
import { isLeafChunk } from '../contracts/types';
import {
  mapPredicate,
  resolveSurface,
  type SynonymDictionary,
} from './synonym.logic';
import { normalizeEntityLabel } from '../entity/normalize-label';

export type SpoTriple = {
  subject: string;
  predicate: string;
  object: string;
  chunkId: string;
  docId: string;
  evidence?: string;
};

/** Split leaf chunks into LLM batches (non-leaves dropped). */
export function batchLeafChunks(
  chunks: RagChunk[],
  batchSize: number,
): RagChunk[][] {
  const size = Math.max(1, Math.floor(batchSize) || 1);
  const leaves = chunks.filter(isLeafChunk);
  const out: RagChunk[][] = [];
  for (let i = 0; i < leaves.length; i += size) {
    out.push(leaves.slice(i, i + size));
  }
  return out;
}

function findEntity(
  entities: CanonicalEntity[],
  surface: string,
  dict: SynonymDictionary,
): CanonicalEntity | undefined {
  const resolved = resolveSurface(dict, surface);
  const want = normalizeEntityLabel(resolved.canonical);
  return entities.find((e) => {
    if (normalizeEntityLabel(e.label) === want) return true;
    return (e.aliases ?? []).some((a) => normalizeEntityLabel(a) === want);
  });
}

export function materializeSpoRelations(input: {
  triples: SpoTriple[];
  entities: CanonicalEntity[];
  allowedRelationTypeIds: string[];
  dict: SynonymDictionary;
}): EntityRelation[] {
  const relations: EntityRelation[] = [];
  for (const triple of input.triples) {
    const typeId = mapPredicate(
      input.dict,
      triple.predicate,
      input.allowedRelationTypeIds,
    );
    if (!typeId) continue;
    const from = findEntity(input.entities, triple.subject, input.dict);
    const to = findEntity(input.entities, triple.object, input.dict);
    if (!from || !to) continue;
    const relationId = createHash('sha256')
      .update(
        `${typeId}:${from.entityId}:${to.entityId}:${triple.chunkId}:${triple.predicate}`,
      )
      .digest('hex')
      .slice(0, 24);
    relations.push({
      relationId,
      typeId,
      fromEntityId: from.entityId,
      toEntityId: to.entityId,
      chunkId: triple.chunkId,
      docId: triple.docId,
      evidence: triple.evidence,
      predicateSurface: triple.predicate,
    });
  }
  return relations;
}

/** Surfaces from SPO ends → mention-like rows for resolve. */
export function surfacesFromTriples(
  triples: SpoTriple[],
): Array<{ surface: string; chunkId: string; docId: string }> {
  const out: Array<{ surface: string; chunkId: string; docId: string }> = [];
  const seen = new Set<string>();
  for (const t of triples) {
    for (const surface of [t.subject, t.object]) {
      const key = `${t.chunkId}|${normalizeEntityLabel(surface)}`;
      if (!surface.trim() || seen.has(key)) continue;
      seen.add(key);
      out.push({ surface: surface.trim(), chunkId: t.chunkId, docId: t.docId });
    }
  }
  return out;
}
