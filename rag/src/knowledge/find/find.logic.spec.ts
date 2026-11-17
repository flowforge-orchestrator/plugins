import type { Claim } from '../../contracts/knowledge';
import { comparePeriods, findClaims, inspectHistory } from './find.logic';

const claims: Claim[] = [
  {
    claimId: 'c-sep',
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
  },
  {
    claimId: 'c-oct',
    subject: 'advertising_cost',
    predicate: 'amount',
    object: '190000',
    validFrom: '2024-10-01',
    validTo: '2024-11-01',
    observedAt: '2024-11-02T10:00:00Z',
    assertedAt: '2024-11-02T12:00:00Z',
    source: 'report-b',
    confidence: 0.8,
    status: 'accepted',
  },
];

describe('find.*', () => {
  it('findClaims filters by window', () => {
    const result = findClaims({
      collectionId: 'col',
      claims,
      subject: 'advertising_cost',
      predicate: 'amount',
      timeWindow: { from: '2024-09-01', to: '2024-10-01' },
    });
    expect(result.records.map((c) => c.claimId)).toEqual(['c-sep']);
  });

  it('inspectHistory returns both statuses for same key', () => {
    const result = inspectHistory({
      collectionId: 'col',
      claims,
      subject: 'advertising_cost',
      predicate: 'amount',
    });
    expect(result.alternatives).toHaveLength(2);
  });

  it('comparePeriods returns both sets', () => {
    const result = comparePeriods({
      collectionId: 'col',
      claims,
      subject: 'advertising_cost',
      predicate: 'amount',
      windowA: { from: '2024-09-01', to: '2024-10-01' },
      windowB: { from: '2024-10-01', to: '2024-11-01' },
    });
    expect(result.periodA.map((c) => c.object)).toEqual(['210000']);
    expect(result.periodB.map((c) => c.object)).toEqual(['190000']);
  });
});
