import type { Evidence } from '../../contracts/knowledge';
import { sha256Hex, shortId } from '../hash';

export type EvidenceCommitInput = {
  text: string;
  docId: string;
  collectionId: string;
  source?: string;
  observedAt?: string;
  metadata?: Record<string, unknown>;
  /** Existing evidence in the collection (for duplicate detection). */
  existing?: Evidence[];
};

export type EvidenceCommitResult = {
  evidence: Evidence;
  duplicate: boolean;
};

export function commitEvidence(input: EvidenceCommitInput): EvidenceCommitResult {
  const text = String(input.text ?? '');
  const hash = sha256Hex(`${input.collectionId}\0${input.docId}\0${text}`);
  const existing = input.existing ?? [];
  const found = existing.find((row) => row.hash === hash);
  if (found) {
    return { evidence: found, duplicate: true };
  }
  const observedAt = input.observedAt?.trim() || new Date().toISOString();
  const evidence: Evidence = {
    id: shortId(`ev:${hash}`),
    text,
    source: input.source?.trim() || input.docId,
    observedAt,
    hash,
    metadata: {
      docId: input.docId,
      collectionId: input.collectionId,
      ...(input.metadata ?? {}),
    },
  };
  return { evidence, duplicate: false };
}
