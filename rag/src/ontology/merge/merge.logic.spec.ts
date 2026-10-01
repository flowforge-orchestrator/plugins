import { mergeOntologySchema } from './merge.logic';
import { emptySchema } from '../../contracts/types';

describe('mergeOntologySchema', () => {
  it('adds new entity and relation types', () => {
    const { schema, delta } = mergeOntologySchema({
      current: emptySchema(),
      candidateTypes: [{ id: 'Person', description: 'человек' }],
      candidateRelations: [
        { id: 'WORKS_AT', from: ['Person'], to: ['Organization'] },
      ],
    });
    expect(schema.entityTypes).toHaveLength(1);
    expect(schema.relationTypes).toHaveLength(0);
    expect(
      delta.operations.some(
        (o: { op: string; id?: string }) => o.op === 'ADD' && o.id === 'Person',
      ),
    ).toBe(true);
  });

  it('aliases case-insensitive duplicates', () => {
    const current = {
      version: 1,
      entityTypes: [{ id: 'Person' }],
      relationTypes: [],
    };
    const { schema, delta } = mergeOntologySchema({
      current,
      candidateTypes: [{ id: 'person' }],
      candidateRelations: [],
    });
    expect(schema.entityTypes).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({ op: 'ALIAS', toId: 'Person' });
  });

  it('keeps relation when domain/range exist', () => {
    const { schema } = mergeOntologySchema({
      current: {
        version: 1,
        entityTypes: [{ id: 'Person' }, { id: 'Organization' }],
        relationTypes: [],
      },
      candidateTypes: [],
      candidateRelations: [
        { id: 'WORKS_AT', from: ['Person'], to: ['Organization'] },
      ],
    });
    expect(schema.relationTypes.map((r: { id: string }) => r.id)).toEqual([
      'WORKS_AT',
    ]);
    expect(schema.version).toBe(2);
  });
});
