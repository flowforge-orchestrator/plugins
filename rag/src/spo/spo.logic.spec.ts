import { batchLeafChunks, materializeSpoRelations, type SpoTriple } from './spo.logic';
import type { CanonicalEntity, RagChunk } from '../contracts/types';
import { createSynonymDictionary } from './synonym.logic';

function leaf(partial: Partial<RagChunk> & Pick<RagChunk, 'chunkId' | 'text'>): RagChunk {
  return {
    docId: 'd1',
    contentHash: 'h',
    headingPath: [],
    tokenEstimate: 10,
    level: 'chunk',
    ...partial,
  };
}

describe('spo.logic', () => {
  it('Zero: no leaves → no batches', () => {
    expect(batchLeafChunks([], 4)).toEqual([]);
  });

  it('One: single leaf → one batch', () => {
    const batches = batchLeafChunks([leaf({ chunkId: 'c1', text: 'a' })], 4);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it('Many: batches by size', () => {
    const chunks = [1, 2, 3, 4, 5].map((i) =>
      leaf({ chunkId: `c${i}`, text: String(i) }),
    );
    expect(batchLeafChunks(chunks, 2).map((b) => b.map((c) => c.chunkId))).toEqual([
      ['c1', 'c2'],
      ['c3', 'c4'],
      ['c5'],
    ]);
  });

  it('Boundary: batchSize < 1 treated as 1', () => {
    const chunks = [leaf({ chunkId: 'c1', text: 'a' }), leaf({ chunkId: 'c2', text: 'b' })];
    expect(batchLeafChunks(chunks, 0)).toHaveLength(2);
  });

  it('materializeSpoRelations: maps S/P/O via synonym dict', () => {
    const entities: CanonicalEntity[] = [
      { entityId: 'e-chuk', typeId: 'Person', label: 'Чук', aliases: ['Чука'], mentionIds: [] },
      { entityId: 'e-gek', typeId: 'Person', label: 'Гек', aliases: ['Гека'], mentionIds: [] },
    ];
    const dict = createSynonymDictionary({
      entities: [
        { canonical: 'Чук', aliases: ['Чука'] },
        { canonical: 'Гек', aliases: ['Гека'] },
      ],
      predicates: [{ typeId: 'travels_with', aliases: ['поехал с'] }],
    });
    const triples: SpoTriple[] = [
      {
        subject: 'Чука',
        predicate: 'поехал с',
        object: 'Гека',
        chunkId: 'c1',
        docId: 'd1',
        evidence: 'Чук поехал с Геком',
      },
    ];
    const rels = materializeSpoRelations({
      triples,
      entities,
      allowedRelationTypeIds: ['travels_with', 'located_in'],
      dict,
    });
    expect(rels).toEqual([
      expect.objectContaining({
        typeId: 'travels_with',
        fromEntityId: 'e-chuk',
        toEntityId: 'e-gek',
        predicateSurface: 'поехал с',
      }),
    ]);
  });

  it('materializeSpoRelations: drops unknown predicate or unresolved ends', () => {
    const entities: CanonicalEntity[] = [
      { entityId: 'e-chuk', typeId: 'Person', label: 'Чук', mentionIds: [] },
    ];
    const dict = createSynonymDictionary();
    const triples: SpoTriple[] = [
      {
        subject: 'Чук',
        predicate: 'посмотрел на',
        object: 'гору',
        chunkId: 'c1',
        docId: 'd1',
      },
    ];
    expect(
      materializeSpoRelations({
        triples,
        entities,
        allowedRelationTypeIds: ['located_in'],
        dict,
      }),
    ).toEqual([]);
  });
});
