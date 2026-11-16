import {
  claimWindowsOverlap,
  normalizeClaimKeyPart,
  type Claim,
  type ConflictBranch,
  type ConflictReviewItem,
} from '../../contracts/knowledge';
import { shortId } from '../hash';

export type ConflictPolicyInput = {
  left: Claim;
  right: Claim;
  /** Higher index = more authoritative. */
  sourceAuthorityOrder?: string[];
  samePeriodRequiresOverlap?: boolean;
  sameDefinition?: boolean;
};

function authorityRank(
  source: string,
  order: string[] | undefined,
): number {
  if (!order || order.length === 0) return -1;
  const key = normalizeClaimKeyPart(source);
  const idx = order.findIndex((s) => normalizeClaimKeyPart(s) === key);
  return idx;
}

function isNewer(a: Claim, b: Claim): boolean {
  return (a.observedAt || a.assertedAt) > (b.observedAt || b.assertedAt);
}

export function applyConflictPolicy(input: ConflictPolicyInput): ConflictBranch {
  const { left, right } = input;
  const sameDefinition = input.sameDefinition !== false;
  const requireOverlap = input.samePeriodRequiresOverlap !== false;

  if (!sameDefinition) {
    return {
      branch: 'otherDefinition',
      preferredClaimId: undefined,
    };
  }

  if (requireOverlap && !claimWindowsOverlap(left, right)) {
    return {
      branch: 'otherPeriod',
      preferredClaimId: undefined,
    };
  }

  const leftRank = authorityRank(left.source, input.sourceAuthorityOrder);
  const rightRank = authorityRank(right.source, input.sourceAuthorityOrder);
  if (leftRank >= 0 && rightRank >= 0 && leftRank !== rightRank) {
    return {
      branch: 'authoritative',
      preferredClaimId: leftRank > rightRank ? left.claimId : right.claimId,
    };
  }

  if (isNewer(right, left) || isNewer(left, right)) {
    const preferred = isNewer(right, left) ? right : left;
    const older = preferred.claimId === right.claimId ? left : right;
    // Explicit correction signal: newer source notes correction in metadata via status candidate only.
    if (
      preferred.source !== older.source &&
      normalizeClaimKeyPart(preferred.object) !== normalizeClaimKeyPart(older.object)
    ) {
      return {
        branch: 'newer',
        preferredClaimId: preferred.claimId,
      };
    }
    return {
      branch: 'newer',
      preferredClaimId: preferred.claimId,
    };
  }

  const review: ConflictReviewItem = {
    reviewId: shortId(`review:${left.claimId}:${right.claimId}`),
    claimIds: [left.claimId, right.claimId],
    reason: 'ambiguous conflict; no newer or authoritative signal',
    status: 'open',
  };
  return {
    branch: 'ambiguous',
    reviewItem: review,
  };
}
