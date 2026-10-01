import {
  buildRerankSystemPrompt,
  buildRerankUserPrompt,
  parseRerankScorePayload,
} from './rerank.logic';

describe('rerank.logic prompts', () => {
  it('parses score payload and drops junk', () => {
    expect(
      parseRerankScorePayload({
        scores: [
          { chunkId: 'a', score: 0.7 },
          { chunkId: '', score: 1 },
          { chunkId: 'b', score: 'x' },
          { score: 0.2 },
        ],
      }),
    ).toEqual([{ chunkId: 'a', score: 0.7 }]);
    expect(parseRerankScorePayload(null)).toEqual([]);
  });

  it('builds compact candidate prompt', () => {
    expect(buildRerankSystemPrompt()).toContain('reranker');
    const user = buildRerankUserPrompt({
      query: 'какие автошколы',
      hits: [
        {
          chunkId: 'c1',
          docId: 'olisa',
          text: 'x'.repeat(2000),
          score: 0.1,
        },
      ],
      maxCharsPerHit: 100,
    });
    const parsed = JSON.parse(user) as {
      candidates: Array<{ text: string }>;
    };
    expect(parsed.candidates[0]?.text.length).toBe(100);
  });
});
