import {
  canTransitionClaimStatus,
  claimsConflict,
  normalizeClaimKeyPart,
  type Claim,
  type ClaimCandidate,
  type ClaimDecision,
  type ClaimStatus,
  type ConflictBranch,
} from '../../../contracts/knowledge';
import { shortId } from '../../hash';

export type ClaimCommitInput = {
  candidate: ClaimCandidate;
  decision: ClaimDecision;
  branch?: ConflictBranch;
  existing: Claim[];
  assertedAt?: string;
  source?: string;
};

export type ClaimCommitResult = {
  claim: Claim;
  /** Prior claims whose status changed as a side effect of this commit. */
  statusUpdates: Claim[];
  reused: boolean;
};

function proposalKey(candidate: ClaimCandidate): string {
  return [
    normalizeClaimKeyPart(candidate.subject),
    normalizeClaimKeyPart(candidate.predicate),
    normalizeClaimKeyPart(candidate.object),
    candidate.validFrom ?? '',
    candidate.validTo ?? '',
    candidate.evidenceId ?? '',
  ].join('|');
}

function statusForDecision(
  decision: ClaimDecision,
  branch?: ConflictBranch,
): ClaimStatus {
  if (decision.kind === 'duplicate') return 'accepted';
  if (decision.kind === 'conflict') {
    if (branch?.branch === 'ambiguous') return 'candidate';
    if (branch?.branch === 'otherPeriod' || branch?.branch === 'otherDefinition') {
      return 'accepted';
    }
    return 'accepted';
  }
  return 'accepted';
}

function priorStatusOnConflict(
  branch: ConflictBranch | undefined,
  priorIsPreferred: boolean,
): ClaimStatus | undefined {
  if (!branch) return 'contradicted';
  switch (branch.branch) {
    case 'newer':
    case 'authoritative':
    case 'correction':
      return priorIsPreferred ? undefined : 'superseded';
    case 'ambiguous':
      return 'contradicted';
    case 'otherPeriod':
    case 'otherDefinition':
      return undefined;
    default:
      return 'contradicted';
  }
}

export function commitClaim(input: ClaimCommitInput): ClaimCommitResult {
  const assertedAt = input.assertedAt?.trim() || new Date().toISOString();
  const key = proposalKey(input.candidate);

  const reused = input.existing.find((row) => {
    const rowKey = [
      normalizeClaimKeyPart(row.subject),
      normalizeClaimKeyPart(row.predicate),
      normalizeClaimKeyPart(row.object),
      row.validFrom ?? '',
      row.validTo ?? '',
      row.evidenceId ?? '',
    ].join('|');
    return rowKey === key;
  });
  if (reused) {
    return { claim: reused, statusUpdates: [], reused: true };
  }

  if (input.decision.kind === 'duplicate' && input.decision.existingClaimId) {
    const existing = input.existing.find(
      (c) => c.claimId === input.decision.existingClaimId,
    );
    if (existing) {
      return { claim: existing, statusUpdates: [], reused: true };
    }
  }

  const status = statusForDecision(input.decision, input.branch);
  const claim: Claim = {
    claimId: shortId(`claim:${key}:${assertedAt}`),
    subject: input.candidate.subject,
    predicate: input.candidate.predicate,
    object: input.candidate.object,
    validFrom: input.candidate.validFrom,
    validTo: input.candidate.validTo,
    observedAt: input.candidate.observedAt || assertedAt,
    assertedAt,
    source: input.source?.trim() || input.candidate.evidenceId || 'unknown',
    evidenceId: input.candidate.evidenceId,
    confidence: input.candidate.confidence ?? 0.5,
    status,
  };

  const statusUpdates: Claim[] = [];
  if (input.decision.kind === 'conflict') {
    const ids = input.decision.conflictingClaimIds ?? [];
    for (const id of ids) {
      const prior = input.existing.find((c) => c.claimId === id);
      if (!prior) continue;
      const preferredId = input.branch?.preferredClaimId;
      const priorIsPreferred = preferredId === prior.claimId;
      const next = priorStatusOnConflict(input.branch, priorIsPreferred);
      if (!next || next === prior.status) continue;
      if (!canTransitionClaimStatus(prior.status, next)) continue;
      if (!claimsConflict(claim, prior) && input.branch?.branch !== 'ambiguous') {
        // still apply when policy marked them conflicting via decision ids
      }
      statusUpdates.push({ ...prior, status: next });
    }
  }

  return { claim, statusUpdates, reused: false };
}
