import { recursiveChunkBlocks } from '../adapters/recursive-chunker';

describe('recursiveChunkBlocks', () => {
  it('keeps short section as one chunk', () => {
    const { chunks } = recursiveChunkBlocks({
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          text: 'Intro',
          headingPath: ['Intro'],
        },
        {
          id: 'b2',
          type: 'paragraph',
          text: 'Hello world',
          headingPath: ['Intro'],
        },
      ],
      docId: 'doc1',
      maxTokens: 200,
      overlapTokens: 20,
      hardMaxTokens: 400,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('Hello world');
  });
});
