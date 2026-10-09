import {
  claimsConflict,
  normalizeClaimKeyPart,
  sameClaimKey,
  claimWindowsOverlap,
  type Claim,
  type ClaimCandidate,
  type ClaimDecision,
} from '../../../contracts/knowledge';

export type ClaimResolveInput = {
  candidate: ClaimCandidate;
  existing: Claim[];
  /** Extra slack is reserved for future fuzzy window matching; overlap uses schema bounds. */
  windowToleranceDays?: number;
};

export type ClaimResolveResult = {
  decision: ClaimDecision;
};

function candidateAsClaim(candidate: ClaimCandidate): Pick<
  Claim,
  'claimId' | 'subject' | 'predicate' | 'object' | 'validFrom' | 'validTo' | 'status' | 'observedAt' | 'assertedAt' | 'source' | 'confidence'
> {
  return {
    claimId: candidate.candidateId,
    subject: candidate.subject,
    predicate: candidate.predicate,
    object: candidate.object,
    validFrom: candidate.validFrom,
    validTo: candidate.validTo,
    observedAt: candidate.observedAt ?? '',
    assertedAt: '',
    source: '',
    confidence: candidate.confidence ?? 0,
    status: 'candidate',
  };
}

export function resolveClaim(input: ClaimResolveInput): ClaimResolveResult {
  const cand = candidateAsClaim(input.candidate);
  const conflicting: string[] = [];
  let duplicateId: string | undefined;

  for (const existing of input.existing) {
    if (!sameClaimKey(cand, existing)) continue;
    const sameObject =
      normalizeClaimKeyPart(cand.object) === normalizeClaimKeyPart(existing.object);
    const overlap = claimWindowsOverlap(cand, existing);
    if (sameObject && overlap) {
      duplicateId = existing.claimId;
      break;
    }
    if (
      claimsConflict(
        {
          ...cand,
          claimId: cand.claimId,
          observedAt: cand.observedAt || '1970-01-01T00:00:00Z',
          assertedAt: cand.assertedAt || '1970-01-01T00:00:00Z',
          source: cand.source || 'candidate',
          confidence: cand.confidence,
          status: 'candidate',
        },
        existing,
      )
    ) {
      conflicting.push(existing.claimId);
    }
  }

  if (duplicateId) {
    return {
      decision: {
        candidateId: input.candidate.candidateId,
        kind: 'duplicate',
        existingClaimId: duplicateId,
      },
    };
  }
  if (conflicting.length > 0) {
    return {
      decision: {
        candidateId: input.candidate.candidateId,
        kind: 'conflict',
        conflictingClaimIds: conflicting,
      },
    };
  }
  return {
    decision: {
      candidateId: input.candidate.candidateId,
      kind: 'new',
    },
  };
}
