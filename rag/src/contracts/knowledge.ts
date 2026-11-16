/**
 * Knowledge-engine schema invariants (S0–S3, decisions, workspace, proposals).
 * Session answer records stay in research/model.ts and are not S2 canon.
 */

import type { ChunkSpan, EntityMention } from './types';

/** S0 — what the system observed. */
export type Evidence = {
  id: string;
  text: string;
  source: string;
  observedAt: string;
  metadata?: Record<string, unknown>;
  hash: string;
};

/** S1 — interpretation hypotheses over evidence spans. */
export type ConceptMention = {
  mentionId: string;
  surface: string;
  conceptHint?: string;
  evidenceId: string;
  chunkId?: string;
  span?: ChunkSpan;
};

export type ClaimCandidate = {
  candidateId: string;
  subject: string;
  predicate: string;
  object: string;
  evidenceId: string;
  chunkId?: string;
  span?: ChunkSpan;
  validFrom?: string;
  validTo?: string;
  observedAt?: string;
  confidence?: number;
};

export type EventCandidate = {
  candidateId: string;
  typeId: string;
  label: string;
  evidenceId: string;
  chunkId?: string;
  span?: ChunkSpan;
  occurredAt?: string;
  participants?: string[];
};

export type TemporalExpression = {
  expressionId: string;
  surface: string;
  evidenceId: string;
  chunkId?: string;
  span?: ChunkSpan;
  resolvedFrom?: string;
  resolvedTo?: string;
};

export type ObservationBundle = {
  entityMentions: EntityMention[];
  conceptMentions: ConceptMention[];
  claimCandidates: ClaimCandidate[];
  eventCandidates: EventCandidate[];
  temporalExpressions: TemporalExpression[];
};

/** S2 — durable canon. */
export type ClaimStatus =
  | 'candidate'
  | 'accepted'
  | 'superseded'
  | 'contradicted'
  | 'retracted'
  | 'expired';

export type Entity = {
  entityId: string;
  typeId: string;
  label: string;
  aliases?: string[];
  identityValues?: Record<string, string>;
};

export type Concept = {
  conceptId: string;
  name: string;
  aliases?: string[];
  definition?: string;
  parentConceptId?: string;
};

export type Relation = {
  relationId: string;
  typeId: string;
  fromEntityId: string;
  toEntityId: string;
  evidenceId?: string;
  validFrom?: string;
  validTo?: string;
};

export type Claim = {
  claimId: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom?: string;
  validTo?: string;
  observedAt: string;
  assertedAt: string;
  source: string;
  evidenceId?: string;
  confidence: number;
  status: ClaimStatus;
};

export type Event = {
  eventId: string;
  typeId: string;
  label: string;
  occurredAt?: string;
  participants?: string[];
  evidenceId?: string;
};

/** Resolver decisions. */
export type EntityDecisionKind = 'match' | 'new' | 'ambiguous';

export type EntityDecision = {
  mentionId: string;
  kind: EntityDecisionKind;
  entityId?: string;
  candidates?: string[];
  score?: number;
};

export type ConceptDecisionKind = 'NEW' | 'MATCH' | 'SUBTYPE';

export type ConceptDecision = {
  candidateId: string;
  kind: ConceptDecisionKind;
  conceptId?: string;
  alias?: string;
};

export type ClaimDecisionKind = 'new' | 'duplicate' | 'conflict';

export type ClaimDecision = {
  candidateId: string;
  kind: ClaimDecisionKind;
  existingClaimId?: string;
  conflictingClaimIds?: string[];
};

export type ConflictBranchKind =
  | 'newer'
  | 'authoritative'
  | 'otherPeriod'
  | 'otherDefinition'
  | 'correction'
  | 'ambiguous';

export type ConflictBranch = {
  branch: ConflictBranchKind;
  preferredClaimId?: string;
  reviewItem?: ConflictReviewItem;
};

export type ConflictReviewItem = {
  reviewId: string;
  claimIds: string[];
  reason: string;
  status: 'open' | 'resolved';
};

/** S3 — derived projection. */
export type DerivedValueAlternative = {
  value: string;
  claimId: string;
  source: string;
  confidence: number;
  validFrom?: string;
  validTo?: string;
};

export type DerivedValue = {
  subject: string;
  predicate: string;
  asOf: string;
  value: string | null;
  alternatives: DerivedValueAlternative[];
};

/** Agent workspace slice (hypotheses live only here). */
export type WorkspaceHypothesisStatus = 'open' | 'kept' | 'dropped';

export type WorkspaceHypothesis = {
  id: string;
  text: string;
  status: WorkspaceHypothesisStatus;
  claimIds?: string[];
};

export type WorkspaceBudget = {
  maxEntities: number;
  maxClaims: number;
  maxEvidence: number;
  maxConcepts: number;
};

export type WorkspaceDropped = {
  entities: number;
  claims: number;
  evidence: number;
  concepts: number;
  reasons: string[];
};

export type Workspace = {
  question: string;
  entities: Entity[];
  concepts: Concept[];
  claims: Claim[];
  evidence: Evidence[];
  hypotheses: WorkspaceHypothesis[];
  timeWindow?: { from?: string; to?: string };
  budget: WorkspaceBudget;
  dropped: WorkspaceDropped;
};

export type ProposalKind =
  | 'propose.claim'
  | 'propose.relation'
  | 'propose.concept'
  | 'propose.alias';

export type ProposalStatus = 'candidate' | 'accepted' | 'rejected';

export type Proposal = {
  proposalId: string;
  kind: ProposalKind;
  status: ProposalStatus;
  payload: Record<string, unknown>;
  evidenceId?: string;
  span?: ChunkSpan | string;
  createdAt: string;
};

export type ConceptCandidate = {
  candidateId: string;
  name: string;
  aliases?: string[];
  definition?: string;
  evidenceId?: string;
};

export type OntologyEvolveOp =
  | 'ADD'
  | 'ALIAS'
  | 'MERGE'
  | 'RETIRE'
  | 'SUBTYPE';

export type OntologyEvolveDecision = {
  op: OntologyEvolveOp;
  kind: 'entity' | 'relation' | 'concept';
  id?: string;
  fromId?: string;
  toId?: string;
  fromIds?: string[];
  intoId?: string;
  parentId?: string;
  payload?: Record<string, unknown>;
};

export type OntologyEvolveLogEntry = {
  entryId: string;
  decision: OntologyEvolveDecision;
  evidenceId?: string;
  schemaVersion: number;
  assertedAt: string;
};

/** Append-only claim status transitions. */
const CLAIM_STATUS_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  candidate: ['accepted', 'retracted', 'contradicted', 'superseded', 'expired'],
  accepted: ['superseded', 'contradicted', 'retracted', 'expired'],
  superseded: [],
  contradicted: [],
  retracted: [],
  expired: [],
};

export function canTransitionClaimStatus(
  from: ClaimStatus,
  to: ClaimStatus,
): boolean {
  if (from === to) return false;
  return CLAIM_STATUS_TRANSITIONS[from].includes(to);
}

export function transitionClaimStatus(
  claim: Claim,
  to: ClaimStatus,
): Claim {
  if (!canTransitionClaimStatus(claim.status, to)) {
    throw new Error(
      `append-only claim status: cannot transition ${claim.status} → ${to}`,
    );
  }
  return { ...claim, status: to };
}

/** Open interval overlap on optional ISO date bounds (missing = unbounded). */
export function claimWindowsOverlap(
  a: { validFrom?: string; validTo?: string },
  b: { validFrom?: string; validTo?: string },
): boolean {
  const aFrom = a.validFrom ?? '';
  const aTo = a.validTo ?? '\uffff';
  const bFrom = b.validFrom ?? '';
  const bTo = b.validTo ?? '\uffff';
  return aFrom < bTo && bFrom < aTo;
}

export function sameClaimKey(
  a: { subject: string; predicate: string },
  b: { subject: string; predicate: string },
): boolean {
  return (
    normalizeClaimKeyPart(a.subject) === normalizeClaimKeyPart(b.subject) &&
    normalizeClaimKeyPart(a.predicate) === normalizeClaimKeyPart(b.predicate)
  );
}

export function normalizeClaimKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Conflict: same subject+predicate, different object, overlapping validity.
 * Different windows for the same key are two claims, not a conflict.
 */
export function claimsConflict(a: Claim, b: Claim): boolean {
  if (a.claimId === b.claimId) return false;
  if (!sameClaimKey(a, b)) return false;
  if (normalizeClaimKeyPart(a.object) === normalizeClaimKeyPart(b.object)) {
    return false;
  }
  return claimWindowsOverlap(a, b);
}

export function emptyObservationBundle(): ObservationBundle {
  return {
    entityMentions: [],
    conceptMentions: [],
    claimCandidates: [],
    eventCandidates: [],
    temporalExpressions: [],
  };
}

export function defaultWorkspaceBudget(): WorkspaceBudget {
  return {
    maxEntities: 100,
    maxClaims: 500,
    maxEvidence: 50,
    maxConcepts: 30,
  };
}

export function emptyWorkspaceDropped(): WorkspaceDropped {
  return {
    entities: 0,
    claims: 0,
    evidence: 0,
    concepts: 0,
    reasons: [],
  };
}
