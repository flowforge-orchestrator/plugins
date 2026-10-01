import {
  applyRerankScores,
  normalizeHitsPort,
  selectDiverseHits,
} from './rerank.logic';
import type { SearchHit } from '../../contracts/types';

const hit = (
  chunkId: string,
  docId: string,
  score = 0.1,
  text = chunkId,
): SearchHit => ({ chunkId, docId, text, score });

describe('rerank.logic', () => {
  it('Zero: empty hits stay empty', () => {
    expect(applyRerankScores([], [{ chunkId: 'a', score: 1 }])).toEqual([]);
    expect(selectDiverseHits([], { topK: 5 })).toEqual([]);
    expect(normalizeHitsPort(null)).toEqual([]);
    expect(normalizeHitsPort('')).toEqual([]);
  });

  it('One: single hit keeps chunk and takes rerank score', () => {
    const out = applyRerankScores([hit('a', 'd1', 0.2)], [
      { chunkId: 'a', score: 0.9 },
    ]);
    expect(out).toEqual([
      expect.objectContaining({ chunkId: 'a', score: 0.9, source: 'rerank' }),
    ]);
  });

  it('Many: sorts by rerank score descending', () => {
    const out = applyRerankScores(
      [hit('a', 'd1'), hit('b', 'd2'), hit('c', 'd3')],
      [
        { chunkId: 'a', score: 0.2 },
        { chunkId: 'b', score: 0.9 },
        { chunkId: 'c', score: 0.5 },
      ],
    );
    expect(out.map((h) => h.chunkId)).toEqual(['b', 'c', 'a']);
  });

  it('Boundary: missing scores keep original score and sort after ranked', () => {
    const out = applyRerankScores(
      [hit('a', 'd1', 0.8), hit('b', 'd2', 0.1)],
      [{ chunkId: 'b', score: 0.5 }],
    );
    expect(out[0]?.chunkId).toBe('b');
    expect(out[1]?.chunkId).toBe('a');
    expect(out[1]?.score).toBe(0.8);
  });

  it('Interface: normalizeHitsPort accepts JSON string and array', () => {
    const rows = [hit('a', 'd1')];
    expect(normalizeHitsPort(rows)).toEqual(rows);
    expect(normalizeHitsPort(JSON.stringify(rows))).toEqual(rows);
    expect(normalizeHitsPort('[[]]')).toEqual([]);
  });

  it('Many+Boundary: diversity caps per doc then fills topK', () => {
    const ranked = [
      hit('a1', 'olisa', 0.99),
      hit('a2', 'olisa', 0.98),
      hit('a3', 'olisa', 0.97),
      hit('b1', 'start', 0.9),
      hit('c1', 'sokol', 0.8),
      hit('d1', 'tomich', 0.7),
      hit('e1', 'signal', 0.6),
    ];
    const out = selectDiverseHits(ranked, { topK: 5, maxPerDoc: 1 });
    expect(out).toHaveLength(5);
    expect(new Set(out.map((h) => h.docId)).size).toBe(5);
    expect(out.map((h) => h.chunkId)).toEqual([
      'a1',
      'b1',
      'c1',
      'd1',
      'e1',
    ]);
  });

  it('Exceptions: invalid score payloads ignored; topK 0 yields empty', () => {
    const out = applyRerankScores([hit('a', 'd1', 0.3)], [
      { chunkId: 'a', score: Number.NaN },
      { chunkId: '', score: 1 },
    ] as never);
    expect(out[0]?.score).toBe(0.3);
    expect(selectDiverseHits([hit('a', 'd1')], { topK: 0 })).toEqual([]);
  });
});
