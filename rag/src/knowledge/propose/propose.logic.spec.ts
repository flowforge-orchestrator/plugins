import {
  proposeAlias,
  proposeClaim,
  proposeConcept,
  proposeRelation,
} from './propose.logic';

describe('propose.*', () => {
  it('creates candidate proposals without writing S2 fields beyond payload', () => {
    const claim = proposeClaim({
      subject: 'advertising_cost',
      predicate: 'amount',
      object: '210000',
      evidenceId: 'ev-1',
      span: '210 тыс.',
    });
    expect(claim.kind).toBe('propose.claim');
    expect(claim.status).toBe('candidate');

    const relation = proposeRelation({
      typeId: 'MENTIONS',
      fromEntityId: 'e1',
      toEntityId: 'e2',
    });
    expect(relation.kind).toBe('propose.relation');

    const concept = proposeConcept({ name: 'ДРР' });
    expect(concept.kind).toBe('propose.concept');

    const alias = proposeAlias({
      kind: 'concept',
      targetId: 'AdvertisingCostRatio',
      alias: 'ДРР',
    });
    expect(alias.kind).toBe('propose.alias');
    expect(alias.status).toBe('candidate');
  });
});
