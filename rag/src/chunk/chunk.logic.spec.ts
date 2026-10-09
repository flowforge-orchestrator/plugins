import { recursiveChunkBlocks } from '../adapters/recursive-chunker';

describe('recursiveChunkBlocks hierarchy', () => {
  it('Zero: empty blocks → no leaf chunks, still emits doc node', () => {
    const { chunks } = recursiveChunkBlocks({
      blocks: [],
      docId: 'doc1',
      maxTokens: 100,
      overlapTokens: 10,
      hardMaxTokens: 200,
      maxChars: 400,
    });
    expect(chunks.filter((c) => c.level === 'doc')).toHaveLength(1);
    expect(chunks.filter((c) => c.level === 'chunk')).toHaveLength(0);
  });

  it('One: short paragraph → doc → section → paragraph → one leaf ~text', () => {
    const { chunks } = recursiveChunkBlocks({
      blocks: [
        { id: 'h1', type: 'heading', text: 'Intro', headingPath: ['Intro'] },
        {
          id: 'b1',
          type: 'paragraph',
          text: 'Hello world',
          headingPath: ['Intro'],
        },
      ],
      docId: 'doc1',
      maxTokens: 200,
      overlapTokens: 20,
      hardMaxTokens: 400,
      maxChars: 400,
    });
    const levels = chunks.map((c) => c.level);
    expect(levels).toContain('doc');
    expect(levels).toContain('section');
    expect(levels).toContain('paragraph');
    expect(levels).toContain('chunk');
    const leaf = chunks.find((c) => c.level === 'chunk');
    expect(leaf?.text).toBe('Hello world');
    expect(leaf?.parentId).toMatch(/^doc1:p/);
    const para = chunks.find((c) => c.chunkId === leaf?.parentId);
    expect(para?.level).toBe('paragraph');
    expect(para?.parentId).toMatch(/^doc1:sec/);
  });

  it('Many: long paragraph splits into ~400-char leaves under one paragraph', () => {
    const sentence =
      'Evidence gates score local passages and reject unsupported claims. ';
    const text = sentence.repeat(20); // ~1280 chars
    const { chunks } = recursiveChunkBlocks({
      blocks: [
        {
          id: 'h1',
          type: 'heading',
          text: 'Protocol',
          headingPath: ['Protocol'],
        },
        {
          id: 'b1',
          type: 'paragraph',
          text,
          headingPath: ['Protocol'],
        },
      ],
      docId: 'd',
      maxTokens: 100,
      overlapTokens: 10,
      hardMaxTokens: 200,
      maxChars: 400,
      overlapChars: 40,
    });
    const leaves = chunks.filter((c) => c.level === 'chunk');
    expect(leaves.length).toBeGreaterThan(1);
    for (const leaf of leaves) {
      expect(leaf.text.length).toBeLessThanOrEqual(440);
      expect(leaf.parentId).toBe(leaves[0]?.parentId);
    }
  });

  it('Boundary: maxChars=400 keeps leaf under soft limit except hard cut', () => {
    const text = 'x'.repeat(900);
    const { chunks, forcedCutShare } = recursiveChunkBlocks({
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text,
          headingPath: ['Root'],
        },
      ],
      docId: 'd',
      maxTokens: 50,
      overlapTokens: 5,
      hardMaxTokens: 100,
      maxChars: 400,
      hardMaxChars: 400,
      overlapChars: 0,
    });
    const leaves = chunks.filter((c) => c.level === 'chunk');
    expect(leaves.length).toBeGreaterThanOrEqual(2);
    expect(leaves.every((c) => c.text.length <= 400)).toBe(true);
    expect(forcedCutShare).toBeGreaterThan(0);
  });
});
