import {
  claimWindowsOverlap,
  sameClaimKey,
  type Claim,
  type DerivedValue,
  type DerivedValueAlternative,
} from '../../../contracts/knowledge';

export type DeriveCurrentInput = {
  subject: string;
  predicate: string;
  claims: Claim[];
  asOf: string;
};

function coversAsOf(claim: Claim, asOf: string): boolean {
  return claimWindowsOverlap(
    { validFrom: claim.validFrom, validTo: claim.validTo },
    { validFrom: asOf, validTo: asOf + '\0' },
  );
}

/**
 * Several accepted claims for the same key at asOf → empty value + alternatives.
 */
export function deriveCurrent(input: DeriveCurrentInput): DerivedValue {
  const accepted = input.claims.filter(
    (c) =>
      c.status === 'accepted' &&
      sameClaimKey(c, input) &&
      coversAsOf(c, input.asOf),
  );

  const alternatives: DerivedValueAlternative[] = accepted.map((c) => ({
    value: c.object,
    claimId: c.claimId,
    source: c.source,
    confidence: c.confidence,
    validFrom: c.validFrom,
    validTo: c.validTo,
  }));

  if (accepted.length === 1) {
    return {
      subject: input.subject,
      predicate: input.predicate,
      asOf: input.asOf,
      value: accepted[0]!.object,
      alternatives,
    };
  }

  return {
    subject: input.subject,
    predicate: input.predicate,
    asOf: input.asOf,
    value: null,
    alternatives,
  };
}
