import { buildOntologyContext } from './lookup.logic';
import { emptySchema } from '../../contracts/types';

describe('ontology lookup.logic', () => {
  it('Zero: empty entities', () => {
    const r = buildOntologyContext({
      schema: emptySchema(1),
      entities: [],
      query: 'автошкола',
    });
    expect(r.matchedEntityIds).toEqual([]);
    expect(r.ontologyContext).toContain('Entity types');
  });

  it('One: matches an entity whose label contains the whole query', () => {
    const r = buildOntologyContext({
      schema: {
        version: 1,
        entityTypes: [{ id: 'org', description: 'organization' }],
        relationTypes: [],
      },
      entities: [
        { entityId: 'e1', typeId: 'org', label: 'Alpha Beta', mentionIds: [] },
        { entityId: 'e2', typeId: 'org', label: 'Gamma', mentionIds: [] },
      ],
      query: 'alpha beta',
    });
    expect(r.matchedEntityIds).toEqual(['e1']);
    expect(r.ontologyContext).toContain('Alpha Beta');
  });

  it('Boundary: a query that is not a name matches nothing; no token splitting', () => {
    const r = buildOntologyContext({
      schema: emptySchema(1),
      entities: [
        { entityId: 'e1', typeId: 'org', label: 'Alpha Beta', mentionIds: [] },
      ],
      query: 'alpha program beta',
    });
    expect(r.matchedEntityIds).toEqual([]);
  });

  it('Zero: empty query lists the first entities', () => {
    const r = buildOntologyContext({
      schema: emptySchema(1),
      entities: [
        { entityId: 'e1', typeId: 'org', label: 'Alpha', mentionIds: [] },
      ],
      query: '   ',
    });
    expect(r.matchedEntityIds).toEqual(['e1']);
  });
});
