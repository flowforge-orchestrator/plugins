import type {
  Evidence,
  Hypothesis,
  ResearchClaim,
  ResearchTask,
} from './model';
import { spanInside } from './claims.logic';

export type VerificationGap = {
  kind: 'unsupported' | 'conflict' | 'missing_slot' | 'missing_parent' | 'overclaim';
  claimId?: string;
  slot?: string;
  detail: string;
};

export type Verification = {
  claims: ResearchClaim[];
  hypotheses: Hypothesis[];
  consistent: boolean;
  sufficient: boolean;
  complete: boolean;
  gaps: VerificationGap[];
  limitations: string[];
};

/**
 * Code decides support. A claim is supported only when it copies an evidence
 * record: an observation is a span of that record, a derived fact copies a
 * computed record whose parents exist. A hypothesis is never a supported claim.
 * Two different values for one fact at one location are both contradicted.
 */
export function verifyClaims(input: {
  claims: ResearchClaim[];
  evidence: Evidence[];
  hypotheses?: Hypothesis[];
  task?: ResearchTask;
}): Verification {
  const byId = new Map(input.evidence.map((row) => [row.id, row]));
  const gaps: VerificationGap[] = [];
  const stamped: ResearchClaim[] = input.claims.map((claim) => {
    const cited = claim.evidence.map((id) => byId.get(id)).filter((row): row is Evidence => !!row);
    if (claim.kind === 'hypothesis') {
      gaps.push({
        kind: 'overclaim',
        claimId: claim.id,
        detail: 'a hypothesis is not a supported claim',
      });
      return { ...claim, status: 'insufficient' as const };
    }
    if (cited.length !== claim.evidence.length) {
      gaps.push({
        kind: 'unsupported',
        claimId: claim.id,
        detail: 'claim cites evidence that is not in the store',
      });
      return { ...claim, status: 'insufficient' as const };
    }
    if (claim.kind === 'observation') {
      const matches = cited.every(
        (row) => row.kind === 'observation' && spanInside(row, claim.value),
      );
      if (!matches) {
        gaps.push({
          kind: 'overclaim',
          claimId: claim.id,
          detail: 'observation claim is not a span of its evidence',
        });
        return { ...claim, status: 'insufficient' as const };
      }
      return { ...claim, status: 'supported' as const };
    }
    const derived = cited.filter((row) => row.kind === 'derived');
    if (derived.length !== cited.length) {
      gaps.push({
        kind: 'overclaim',
        claimId: claim.id,
        detail: 'derived claim cites an observation as if it were computed',
      });
      return { ...claim, status: 'insufficient' as const };
    }
    for (const row of derived) {
      if (row.parentEvidence.length === 0 || row.parentEvidence.some((id) => !byId.has(id))) {
        gaps.push({
          kind: 'missing_parent',
          claimId: claim.id,
          detail: 'derived evidence has no recorded parents',
        });
        return { ...claim, status: 'insufficient' as const };
      }
      if (!spanInside(row, claim.value)) {
        gaps.push({
          kind: 'overclaim',
          claimId: claim.id,
          detail: 'derived claim does not copy the computed value',
        });
        return { ...claim, status: 'insufficient' as const };
      }
    }
    return { ...claim, status: 'supported' as const };
  });

  const contradicted = contradict(stamped, byId);
  for (const claim of contradicted) {
    if (claim.status !== 'contradicted') continue;
    gaps.push({
      kind: 'conflict',
      claimId: claim.id,
      slot: claim.slot,
      detail: 'two values for one fact at one location',
    });
  }

  const hypotheses = settleHypotheses(input.hypotheses ?? [], byId);
  const limitations = [
    ...new Set([
      ...gaps.map((gap) => gap.detail),
      ...(input.task?.unresolvedQuestions ?? []),
    ]),
  ];

  const required = input.task?.requiredInformation ?? [];
  const filled = new Set(
    contradicted.filter((claim) => claim.status === 'supported').map((claim) => claim.slot),
  );
  const unknown = new Set(input.task?.unresolvedQuestions ?? []);
  for (const slot of required) {
    if (filled.has(slot) || unknown.has(slot)) continue;
    gaps.push({ kind: 'missing_slot', slot, detail: 'required information is not in evidence' });
    limitations.push('required information is not in evidence');
  }

  const consistent = contradicted.every((claim) => claim.status !== 'contradicted');
  const sufficient =
    contradicted.length > 0 &&
    contradicted.every((claim) => claim.status === 'supported');
  const complete = required.every((slot) => filled.has(slot) || unknown.has(slot));

  return {
    claims: contradicted,
    hypotheses,
    consistent,
    sufficient,
    complete,
    gaps,
    limitations: [...new Set(limitations)],
  };
}

function contradict(claims: ResearchClaim[], evidence: Map<string, Evidence>): ResearchClaim[] {
  const groups = new Map<string, ResearchClaim[]>();
  for (const claim of claims) {
    if (claim.status !== 'supported') continue;
    const location = claim.evidence
      .map((id) => evidence.get(id)?.location ?? '')
      .sort()
      .join('|');
    const key = `${location}\u0000${claim.fact}`;
    const list = groups.get(key) ?? [];
    list.push(claim);
    groups.set(key, list);
  }
  const bad = new Set<string>();
  for (const list of groups.values()) {
    const values = new Set(list.map((claim) => claim.value));
    if (values.size < 2) continue;
    for (const claim of list) bad.add(claim.id);
  }
  return claims.map((claim) =>
    bad.has(claim.id) ? { ...claim, status: 'contradicted' as const } : claim,
  );
}

/** A hypothesis stays a hypothesis. Status records whether evidence mentions it, never promotes it to a fact. */
export function settleHypotheses(
  hypotheses: Hypothesis[],
  evidence: Map<string, Evidence>,
): Hypothesis[] {
  return hypotheses.map((hypothesis) => {
    const support = hypothesis.supportingEvidence.filter((id) => evidence.has(id));
    const against = hypothesis.contradictingEvidence.filter((id) => evidence.has(id));
    const status = against.length > 0 ? 'dropped' : support.length > 0 ? 'kept' : 'open';
    return {
      ...hypothesis,
      supportingEvidence: support,
      contradictingEvidence: against,
      status,
    };
  });
}
