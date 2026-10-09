import type { Claim } from '../../../contracts/knowledge';
import { deriveCurrent } from './current.logic';

const SEP = { validFrom: '2024-09-01', validTo: '2024-10-01' };

function claim(id: string, object: string): Claim {
  return {
    claimId: id,
    subject: 'advertising_cost',
    predicate: 'amount',
    object,
    ...SEP,
    observedAt: '2024-10-05T10:00:00Z',
    assertedAt: '2024-10-05T12:00:00Z',
    source: id,
    confidence: 0.8,
    status: 'accepted',
  };
}

describe('deriveCurrent', () => {
  it('returns value for single accepted claim', () => {
    const derived = deriveCurrent({
      subject: 'advertising_cost',
      predicate: 'amount',
      asOf: '2024-09-15',
      claims: [claim('c-210', '210000')],
    });
    expect(derived.value).toBe('210000');
    expect(derived.alternatives).toHaveLength(1);
  });

  it('returns null value when two accepted conflict on asOf', () => {
    const derived = deriveCurrent({
      subject: 'advertising_cost',
      predicate: 'amount',
      asOf: '2024-09-15',
      claims: [claim('c-210', '210000'), claim('c-190', '190000')],
    });
    expect(derived.value).toBeNull();
    expect(derived.alternatives.map((a) => a.value).sort()).toEqual([
      '190000',
      '210000',
    ]);
  });
});
