import type { Claim } from '../../contracts/knowledge';
import { applyConflictPolicy } from './policy.logic';

const base: Claim = {
  claimId: 'c-210',
  subject: 'advertising_cost',
  predicate: 'amount',
  object: '210000',
  validFrom: '2024-09-01',
  validTo: '2024-10-01',
  observedAt: '2024-10-05T10:00:00Z',
  assertedAt: '2024-10-05T12:00:00Z',
  source: 'report-a',
  confidence: 0.9,
  status: 'accepted',
};

describe('applyConflictPolicy', () => {
  it('picks authoritative source', () => {
    const right: Claim = {
      ...base,
      claimId: 'c-190',
      object: '190000',
      source: 'report-b',
      observedAt: '2024-10-12T10:00:00Z',
    };
    const branch = applyConflictPolicy({
      left: base,
      right,
      sourceAuthorityOrder: ['report-a', 'report-b'],
    });
    expect(branch.branch).toBe('authoritative');
    expect(branch.preferredClaimId).toBe('c-190');
  });

  it('otherPeriod when windows do not overlap', () => {
    const right: Claim = {
      ...base,
      claimId: 'c-oct',
      object: '190000',
      validFrom: '2024-10-01',
      validTo: '2024-11-01',
      source: 'report-b',
    };
    const branch = applyConflictPolicy({ left: base, right });
    expect(branch.branch).toBe('otherPeriod');
  });
});
