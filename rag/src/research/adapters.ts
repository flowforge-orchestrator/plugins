import type { SearchHit } from '../contracts/types';
import type { Inventory } from '../agent/turn/agent.turn.logic';
import { normalizeEvidenceList, type Evidence } from './model';

/**
 * Hits are candidates, not field values. A query made for a required field
 * also records the attempt, so a later turn knows the field was asked.
 */
export function evidenceFromHits(input: {
  hits: SearchHit[];
  source: string;
  field?: string;
}): Evidence[] {
  const field = input.field?.trim();
  const out: Evidence[] = [];
  for (const hit of input.hits) {
    const content = String(hit.text ?? '').trim();
    const id = String(hit.chunkId ?? '').trim();
    if (!id || !content) continue;
    out.push({
      id,
      source: input.source,
      location: String(hit.docId ?? ''),
      content: content.slice(0, 2000),
      extractionMethod: 'query',
      parentEvidence: [],
      reliability: 'recorded',
      kind: 'observation',
    });
  }
  if (field) {
    out.push({
      id: `ask:${field}`,
      source: input.source,
      location: '',
      content: field,
      extractionMethod: 'query_attempt',
      parentEvidence: [],
      reliability: 'recorded',
      kind: 'observation',
      group: field,
    });
  }
  return normalizeEvidenceList(out);
}

export function evidenceFromInventory(input: {
  inventory?: Inventory;
  source: string;
}): Evidence[] {
  const documents = input.inventory?.documents ?? [];
  return normalizeEvidenceList(
    documents.map((doc) => ({
      id: `doc:${doc.docId}`,
      source: input.source,
      location: doc.docId,
      content: doc.title || doc.docId,
      extractionMethod: 'inspect_schema',
      parentEvidence: [],
      reliability: 'recorded' as const,
      kind: 'observation' as const,
    })),
  );
}

export function evidenceFromText(input: {
  id: string;
  source: string;
  location: string;
  content: string;
  extractionMethod: string;
}): Evidence[] {
  return normalizeEvidenceList([
    {
      id: input.id,
      source: input.source,
      location: input.location,
      content: input.content,
      extractionMethod: input.extractionMethod,
      parentEvidence: [],
      reliability: 'recorded',
      kind: 'observation',
    },
  ]);
}
