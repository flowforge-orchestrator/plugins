import type { RagChunk } from '../../contracts/types';
import type {
  ClaimCandidate,
  ConceptMention,
  Evidence,
  EventCandidate,
  ObservationBundle,
  TemporalExpression,
} from '../../contracts/knowledge';
import { emptyObservationBundle } from '../../contracts/knowledge';
import { shortId } from '../hash';
import { collapseWhitespace } from '../../research/claims.logic';

export type InterpretObservationsInput = {
  evidence: Evidence;
  chunks: RagChunk[];
  /** Optional structured candidates from a model (validated for spans). */
  raw?: {
    conceptMentions?: ConceptMention[];
    claimCandidates?: ClaimCandidate[];
    eventCandidates?: EventCandidate[];
    temporalExpressions?: TemporalExpression[];
  };
  candidateLimit?: number;
};

function spanInsideText(text: string, span?: { start: number; end: number } | string): boolean {
  if (span == null) return true;
  if (typeof span === 'string') {
    const needle = collapseWhitespace(span);
    if (!needle) return false;
    return collapseWhitespace(text).includes(needle);
  }
  if (span.start < 0 || span.end < span.start || span.end > text.length) return false;
  return true;
}

function evidenceTextForChunk(evidence: Evidence, chunk: RagChunk): string {
  return chunk.text || evidence.text;
}

/**
 * Builds an S1 observation bundle. Span-in-text checks run here (not a sibling executor).
 * Without model raw output, returns an empty bundle (entity mentions come from entity.extract).
 */
export function interpretObservations(
  input: InterpretObservationsInput,
): ObservationBundle {
  const limit = Math.max(0, Number(input.candidateLimit ?? 50));
  const raw = input.raw;
  if (!raw) return emptyObservationBundle();

  const chunkById = new Map(input.chunks.map((c) => [c.chunkId, c]));
  const out = emptyObservationBundle();

  const take = <T extends { span?: { start: number; end: number } }>(
    rows: T[] | undefined,
    pickText: (row: T) => string,
  ): T[] => {
    if (!Array.isArray(rows)) return [];
    const accepted: T[] = [];
    for (const row of rows) {
      if (accepted.length >= limit) break;
      if (!spanInsideText(pickText(row), row.span)) continue;
      accepted.push(row);
    }
    return accepted;
  };

  out.conceptMentions = take(raw.conceptMentions, (row) => {
    const chunk = row.chunkId ? chunkById.get(row.chunkId) : undefined;
    return chunk ? evidenceTextForChunk(input.evidence, chunk) : input.evidence.text;
  }).map((row) => ({
    ...row,
    mentionId: row.mentionId || shortId(`cm:${row.surface}:${input.evidence.id}`),
    evidenceId: row.evidenceId || input.evidence.id,
  }));

  out.claimCandidates = take(raw.claimCandidates, (row) => {
    const chunk = row.chunkId ? chunkById.get(row.chunkId) : undefined;
    return chunk ? evidenceTextForChunk(input.evidence, chunk) : input.evidence.text;
  }).map((row) => ({
    ...row,
    candidateId:
      row.candidateId ||
      shortId(`cc:${row.subject}:${row.predicate}:${row.object}:${input.evidence.id}`),
    evidenceId: row.evidenceId || input.evidence.id,
  }));

  out.eventCandidates = take(raw.eventCandidates, (row) => {
    const chunk = row.chunkId ? chunkById.get(row.chunkId) : undefined;
    return chunk ? evidenceTextForChunk(input.evidence, chunk) : input.evidence.text;
  }).map((row) => ({
    ...row,
    candidateId: row.candidateId || shortId(`ec:${row.label}:${input.evidence.id}`),
    evidenceId: row.evidenceId || input.evidence.id,
  }));

  out.temporalExpressions = take(raw.temporalExpressions, (row) => {
    const chunk = row.chunkId ? chunkById.get(row.chunkId) : undefined;
    return chunk ? evidenceTextForChunk(input.evidence, chunk) : input.evidence.text;
  }).map((row) => ({
    ...row,
    expressionId:
      row.expressionId || shortId(`te:${row.surface}:${input.evidence.id}`),
    evidenceId: row.evidenceId || input.evidence.id,
  }));

  return out;
}
