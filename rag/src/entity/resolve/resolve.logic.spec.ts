import { resolveEntities } from './resolve.logic';

describe('resolveEntities', () => {
  it('creates canonical entities from mentions', () => {
    const result = resolveEntities({
      existing: [],
      mentions: [
        {
          mentionId: 'm1',
          surface: 'Иван',
          typeId: 'Person',
          chunkId: 'c1',
          docId: 'd1',
        },
      ],
    });
    expect(result.created).toBe(1);
    expect(result.entities[0]?.label).toBe('Иван');
  });

  it('merges by normalized label', () => {
    const first = resolveEntities({
      existing: [],
      mentions: [
        {
          mentionId: 'm1',
          surface: 'Иван',
          typeId: 'Person',
          chunkId: 'c1',
          docId: 'd1',
        },
      ],
    });
    const second = resolveEntities({
      existing: first.entities,
      mentions: [
        {
          mentionId: 'm2',
          surface: 'Иван',
          typeId: 'Person',
          chunkId: 'c2',
          docId: 'd2',
        },
      ],
    });
    expect(second.created).toBe(0);
    expect(second.merged).toBe(1);
    expect(second.entities).toHaveLength(1);
    expect(second.entities[0]?.mentionIds).toEqual(['m1', 'm2']);
  });

  it('rebinds types from schema delta alias', () => {
    const result = resolveEntities({
      existing: [
        {
          entityId: 'e1',
          typeId: 'PersonOld',
          label: 'Иван',
          mentionIds: ['m1'],
        },
      ],
      mentions: [],
      delta: {
        fromVersion: 1,
        toVersion: 2,
        operations: [
          { op: 'ALIAS', kind: 'entity', fromId: 'PersonOld', toId: 'Person' },
        ],
      },
    });
    expect(result.rebound).toBe(1);
    expect(result.entities[0]?.typeId).toBe('Person');
  });
});
