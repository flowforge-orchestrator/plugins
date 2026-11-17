import {
  canTransitionClaimStatus,
  claimsConflict,
  claimWindowsOverlap,
  transitionClaimStatus,
  type Claim,
} from './knowledge';

const SEP_FROM = '2024-09-01';
const SEP_TO = '2024-10-01';
const OCT_FROM = '2024-10-01';
const OCT_TO = '2024-11-01';

function claim(partial: Partial<Claim> & Pick<Claim, 'claimId' | 'object'>): Claim {
  return {
    subject: 'advertising_cost',
    predicate: 'amount',
    validFrom: SEP_FROM,
    validTo: SEP_TO,
    observedAt: '2024-10-05T10:00:00Z',
    assertedAt: '2024-10-05T12:00:00Z',
    source: 'report-a',
    confidence: 0.9,
    status: 'accepted',
    ...partial,
  };
}

describe('knowledge claim invariants (acceptance slice)', () => {
  it('keeps Sep=210K accepted and later 190K both in history', () => {
    const first = claim({
      claimId: 'c-210',
      object: '210000',
      source: 'report-a',
      status: 'accepted',
    });
    const second = claim({
      claimId: 'c-190',
      object: '190000',
      source: 'report-b',
      observedAt: '2024-10-12T10:00:00Z',
      assertedAt: '2024-10-12T12:00:00Z',
      status: 'candidate',
    });

    const history: Claim[] = [first, second];
    expect(history).toHaveLength(2);
    expect(history.map((c) => c.object).sort()).toEqual(['190000', '210000']);
    expect(history.find((c) => c.claimId === 'c-210')?.status).toBe('accepted');
  });

  it('overlapping valid windows with different objects = conflict', () => {
    const a = claim({ claimId: 'c-210', object: '210000' });
    const b = claim({ claimId: 'c-190', object: '190000', source: 'report-b' });
    expect(claimWindowsOverlap(a, b)).toBe(true);
    expect(claimsConflict(a, b)).toBe(true);
  });

  it('different valid windows = not conflict (two claims)', () => {
    const sep = claim({ claimId: 'c-sep', object: '210000' });
    const oct = claim({
      claimId: 'c-oct',
      object: '190000',
      validFrom: OCT_FROM,
      validTo: OCT_TO,
      source: 'report-b',
    });
    expect(claimWindowsOverlap(sep, oct)).toBe(false);
    expect(claimsConflict(sep, oct)).toBe(false);
  });

  it('same object overlapping window is not a conflict', () => {
    const a = claim({ claimId: 'c1', object: '210000' });
    const b = claim({ claimId: 'c2', object: '210000', source: 'report-b' });
    expect(claimsConflict(a, b)).toBe(false);
  });

  it('append-only status transitions from accepted', () => {
    const accepted = claim({ claimId: 'c-210', object: '210000' });
    expect(canTransitionClaimStatus('accepted', 'superseded')).toBe(true);
    expect(canTransitionClaimStatus('accepted', 'contradicted')).toBe(true);
    expect(canTransitionClaimStatus('accepted', 'candidate')).toBe(false);
    expect(canTransitionClaimStatus('superseded', 'accepted')).toBe(false);

    const superseded = transitionClaimStatus(accepted, 'superseded');
    expect(superseded.status).toBe('superseded');
    expect(accepted.status).toBe('accepted');

    expect(() => transitionClaimStatus(superseded, 'accepted')).toThrow(
      /append-only/,
    );
  });

  it('candidate may become accepted then contradicted by conflict', () => {
    let row = claim({
      claimId: 'c-190',
      object: '190000',
      status: 'candidate',
    });
    row = transitionClaimStatus(row, 'accepted');
    expect(row.status).toBe('accepted');
    row = transitionClaimStatus(row, 'contradicted');
    expect(row.status).toBe('contradicted');
    expect(canTransitionClaimStatus('contradicted', 'accepted')).toBe(false);
  });
});
