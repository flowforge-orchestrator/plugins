import type { Claim } from '../../../contracts/knowledge';
import { resolveClaim } from './resolve.logic';

const SEP = { validFrom: '2024-09-01', validTo: '2024-10-01' };

function accepted210(): Claim {
  return {
    claimId: 'c-210',
    subject: 'advertising_cost',
    predicate: 'amount',
    object: '210000',
    ...SEP,
    observedAt: '2024-10-05T10:00:00Z',
    assertedAt: '2024-10-05T12:00:00Z',
    source: 'report-a',
    confidence: 0.9,
    status: 'accepted',
  };
}

describe('resolveClaim', () => {
  it('flags overlapping 190 vs 210 as conflict', () => {
    const result = resolveClaim({
      existing: [accepted210()],
      candidate: {
        candidateId: 'cand-190',
        subject: 'advertising_cost',
        predicate: 'amount',
        object: '190000',
        evidenceId: 'ev-b',
        ...SEP,
      },
    });
    expect(result.decision.kind).toBe('conflict');
    expect(result.decision.conflictingClaimIds).toEqual(['c-210']);
  });

  it('different windows are new, not conflict', () => {
    const result = resolveClaim({
      existing: [accepted210()],
      candidate: {
        candidateId: 'cand-oct',
        subject: 'advertising_cost',
        predicate: 'amount',
        object: '190000',
        evidenceId: 'ev-b',
        validFrom: '2024-10-01',
        validTo: '2024-11-01',
      },
    });
    expect(result.decision.kind).toBe('new');
  });

  it('same object overlapping window is duplicate', () => {
    const result = resolveClaim({
      existing: [accepted210()],
      candidate: {
        candidateId: 'cand-dup',
        subject: 'advertising_cost',
        predicate: 'amount',
        object: '210000',
        evidenceId: 'ev-c',
        ...SEP,
      },
    });
    expect(result.decision).toMatchObject({
      kind: 'duplicate',
      existingClaimId: 'c-210',
    });
  });
});
