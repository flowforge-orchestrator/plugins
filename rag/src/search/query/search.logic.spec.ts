import type { SearchHit } from '../../contracts/types';
import {
  fuseHitsWeighted,
  matchQueryEntities,
  preferGraphThenDense,
  enrichHitAgainstIntent,
} from './search.logic';

const hit = (
  chunkId: string,
  source: SearchHit['source'],
  score = 1,
): SearchHit => ({
  chunkId,
  docId: 'd',
  text: chunkId,
  score,
  source,
});

describe('graph-first retrieval ranking', () => {
  it('Zero: empty lists → empty', () => {
    expect(preferGraphThenDense([], [], 8)).toEqual([]);
  });

  it('One: graph hit ranks above dense-only neighbor', () => {
    const ranked = fuseHitsWeighted(
      [
        { hits: [hit('g1', 'graph')], weight: 2.5 },
        { hits: [hit('d1', 'dense')], weight: 1 },
      ],
      60,
      8,
    );
    expect(ranked[0]?.chunkId).toBe('g1');
  });

  it('Many: preferGraphThenDense fills from dense after graph', () => {
    const out = preferGraphThenDense(
      [hit('g1', 'graph'), hit('g2', 'graph')],
      [hit('g1', 'dense'), hit('d1', 'dense'), hit('d2', 'dense')],
      3,
    );
    expect(out.map((h) => h.chunkId)).toEqual(['g1', 'g2', 'd1']);
  });
});

describe('matchQueryEntities', () => {
  const catalog = [
    { entityId: 'e1', label: 'RAGScope', typeId: 'Protocol' },
    { entityId: 'e2', label: 'evidence gates', typeId: 'Component' },
    { entityId: 'e3', label: 'gate', typeId: 'Metric' },
  ];

  it('Zero: no overlap → []', () => {
    expect(matchQueryEntities('привет', catalog)).toEqual([]);
  });

  it('One: prefers longer label over substring shorter alias', () => {
    const matched = matchQueryEntities(
      'How do evidence gates reduce hallucinations?',
      catalog,
    );
    expect(matched.map((m) => m.entityId)).toEqual(['e2']);
  });
});

describe('enrichHitAgainstIntent', () => {
  it('marks overlapping entities and drops unrelated', () => {
    const enriched = enrichHitAgainstIntent(
      {
        chunkId: 'c1',
        docId: 'd',
        text: '…',
        score: 1,
        entities: [
          { entityId: 'e1', label: 'RAGScope', typeId: 'Protocol' },
          { entityId: 'e9', label: 'Other', typeId: 'Thing' },
        ],
        relations: [
          {
            typeId: 'USES',
            fromLabel: 'RAGScope',
            toLabel: 'evidence gates',
          },
        ],
      },
      [{ entityId: 'e1', label: 'RAGScope', typeId: 'Protocol' }],
    );
    expect(enriched.intentEntities?.map((e) => e.entityId)).toEqual(['e1']);
    expect(enriched.intentOverlap).toBe(1);
  });
});
