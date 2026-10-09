import type { Claim, ClaimCandidate } from '../../../contracts/knowledge';
import { applyConflictPolicy } from '../../conflict/policy.logic';
import { resolveClaim } from '../resolve/resolve.logic';
import { commitClaim } from './commit.logic';

const SEP = { validFrom: '2024-09-01', validTo: '2024-10-01' };

const candidate210: ClaimCandidate = {
  candidateId: 'cand-210',
  subject: 'advertising_cost',
  predicate: 'amount',
  object: '210000',
  evidenceId: 'ev-a',
  observedAt: '2024-10-05T10:00:00Z',
  ...SEP,
};

const candidate190: ClaimCandidate = {
  candidateId: 'cand-190',
  subject: 'advertising_cost',
  predicate: 'amount',
  object: '190000',
  evidenceId: 'ev-b',
  observedAt: '2024-10-12T10:00:00Z',
  ...SEP,
};

describe('commitClaim acceptance slice', () => {
  it('accepts 210 then keeps both after conflicting 190', () => {
    const first = commitClaim({
      candidate: candidate210,
      decision: { candidateId: 'cand-210', kind: 'new' },
      existing: [],
      source: 'report-a',
      assertedAt: '2024-10-05T12:00:00Z',
    });
    expect(first.claim.status).toBe('accepted');
    expect(first.reused).toBe(false);

    const history: Claim[] = [first.claim];
    const decision = resolveClaim({
      candidate: candidate190,
      existing: history,
    }).decision;
    expect(decision.kind).toBe('conflict');

    const branch = applyConflictPolicy({
      left: first.claim,
      right: {
        ...first.claim,
        claimId: 'pending',
        object: '190000',
        source: 'report-b',
        observedAt: '2024-10-12T10:00:00Z',
        status: 'candidate',
      },
      sourceAuthorityOrder: ['report-a', 'report-b'],
    });

    const second = commitClaim({
      candidate: candidate190,
      decision,
      branch,
      existing: history,
      source: 'report-b',
      assertedAt: '2024-10-12T12:00:00Z',
    });

    const nextHistory = [
      ...history.map(
        (row) =>
          second.statusUpdates.find((u) => u.claimId === row.claimId) ?? row,
      ),
      second.claim,
    ];

    expect(nextHistory).toHaveLength(2);
    expect(nextHistory.map((c) => c.object).sort()).toEqual(['190000', '210000']);
    expect(nextHistory.find((c) => c.object === '210000')).toBeDefined();
    expect(second.claim.status).toBe('accepted');

    const again = commitClaim({
      candidate: candidate190,
      decision,
      branch,
      existing: nextHistory,
      source: 'report-b',
    });
    expect(again.reused).toBe(true);
    expect(again.claim.claimId).toBe(second.claim.claimId);
  });
});
