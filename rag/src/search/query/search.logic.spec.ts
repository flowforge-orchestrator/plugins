import { fuseHits, assembleContext, mergeWorkingSet } from './search.logic';

describe('search.logic', () => {
  it('fuses ranked lists with RRF', () => {
    const fused = fuseHits(
      [
        [
          { chunkId: 'a', docId: 'd', text: 'A', score: 1 },
          { chunkId: 'b', docId: 'd', text: 'B', score: 0.5 },
        ],
        [
          { chunkId: 'b', docId: 'd', text: 'B', score: 1 },
          { chunkId: 'c', docId: 'd', text: 'C', score: 0.4 },
        ],
      ],
      60,
      3,
    );
    expect(fused[0]?.chunkId).toBe('b');
    expect(fused).toHaveLength(3);
  });

  it('assembles context under budget', () => {
    const { context, used } = assembleContext(
      [
        { chunkId: 'a', docId: 'd', text: 'one', score: 1 },
        { chunkId: 'b', docId: 'd', text: 'two', score: 0.5 },
      ],
      40,
    );
    expect(used).toBeLessThanOrEqual(40);
    expect(context).toContain('[a]');
  });

  describe('working set', () => {
    const h = (id: string) => ({ chunkId: id, docId: 'd', text: id, score: 1 });

    it('Zero: nothing prior keeps the fresh hits', () => {
      expect(mergeWorkingSet([h('a')], [], 10).map((x) => x.chunkId)).toEqual(['a']);
    });

    it('Many: fresh first, prior appended without duplicates', () => {
      const out = mergeWorkingSet([h('b'), h('c')], [h('a'), h('b')], 10);
      expect(out.map((x) => x.chunkId)).toEqual(['b', 'c', 'a']);
    });

    it('Boundary: the cap drops the oldest prior hits', () => {
      const out = mergeWorkingSet([h('n1'), h('n2')], [h('p1'), h('p2'), h('p3')], 3);
      expect(out.map((x) => x.chunkId)).toEqual(['n1', 'n2', 'p1']);
    });
  });

  describe('working set', () => {
    const h = (id: string) => ({ chunkId: id, docId: 'd', text: id, score: 1 });

    it('Zero: nothing prior keeps the fresh hits', () => {
      expect(mergeWorkingSet([h('a')], [], 10).map((x) => x.chunkId)).toEqual(['a']);
    });

    it('Many: fresh first, prior appended without duplicates', () => {
      const out = mergeWorkingSet([h('b'), h('c')], [h('a'), h('b')], 10);
      expect(out.map((x) => x.chunkId)).toEqual(['b', 'c', 'a']);
    });

    it('Boundary: the cap drops the oldest prior hits', () => {
      const out = mergeWorkingSet([h('n1'), h('n2')], [h('p1'), h('p2'), h('p3')], 3);
      expect(out.map((x) => x.chunkId)).toEqual(['n1', 'n2', 'p1']);
    });
  });
});
